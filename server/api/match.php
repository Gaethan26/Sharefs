<?php
/* =========================================================================
   Jeu 1v1 « Genre tu l'as vu !? »
   - Pierre, feuille, ciseaux : le gagnant choisit 5 œuvres pour son adversaire
   - L'adversaire en garde 1 ; les deux joueurs répondent chacun de leur côté aux 5 mêmes questions (1 point par bonne réponse)
   - Puis les rôles s'inversent ; égalité : pierre, feuille, ciseaux en 2 manches gagnantes
   Le serveur fait foi : les réponses et le coup de l'adversaire ne sont jamais envoyés avant l'heure.
   ========================================================================= */

const RPS_BEATS = ['r' => 's', 'p' => 'r', 's' => 'p'];
const QUIZ_SECONDS = 30;

function match_side(array $m, string $uid): string {
  if ($m['a_id'] === $uid) return 'a';
  if ($m['b_id'] === $uid) return 'b';
  fail(403, 'forbidden');
}
function op_side(string $s): string { return $s === 'a' ? 'b' : 'a'; }

function match_row(string $id, bool $lock = false): array {
  $r = q('SELECT * FROM matches WHERE id = ?' . ($lock ? ' FOR UPDATE' : ''), [$id])->fetch();
  if (!$r) fail(404, 'not_found');
  return $r;
}

/* Lecture d'une partie, avec mise au format des parties lancées par une ancienne version (questionnaire express) */
function match_state(array $m): array {
  $st = json_decode((string) $m['state'], true);
  if (!is_array($st)) $st = match_new_state();
  $st += match_new_state();
  if (!empty($st['quiz']) && (!isset($st['quiz']['p']['a']['i'], $st['quiz']['p']['b']['i']) || empty($st['quiz']['qs']))) {
    if (empty($st['quiz']['qs'])) { $st['quiz'] = null; if ($st['phase'] === 'quiz') $st['phase'] = 'choose'; }
    else $st['quiz'] = ['qs' => $st['quiz']['qs'], 'p' => ['a' => ['i' => 0, 't0' => null, 'res' => []], 'b' => ['i' => 0, 't0' => null, 'res' => []]]];
  }
  if ($st['phase'] === 'quiz' && empty($st['quiz'])) $st['phase'] = $st['picks'] ? 'choose' : 'pick';
  foreach (['a', 'b'] as $x) $st['score'][$x] = (int) ($st['score'][$x] ?? 0);
  return $st;
}
function match_new_state(): array {
  return ['phase' => 'rps', 'rps' => ['a' => null, 'b' => null], 'rpsLog' => [], 'tb' => null, 'turn' => 0,
    'picker' => null, 'target' => null, 'picks' => [], 'chosen' => null, 'quiz' => null,
    'score' => ['a' => 0, 'b' => 0], 'turns' => [], 'winner' => null, 'forfeit' => null];
}

/* Modification d'une partie sous verrou : deux joueurs qui jouent en même temps ne s'écrasent pas */
function match_tx(string $id, string $uid, callable $fn): array {
  $pdo = db();
  $pdo->beginTransaction();
  try {
    $m = match_row($id, true);
    $side = match_side($m, $uid);
    $st = match_state($m);
    if (($st['phase'] ?? '') === 'done') fail(409, 'match_over');
    $fn($st, $side, $m);
    $status = $st['phase'] === 'done' ? 'done' : 'live';
    q('UPDATE matches SET state = ?, status = ?, version = version + 1, updated_at = UTC_TIMESTAMP() WHERE id = ?', [enc($st), $status, $id]);
    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
  return match_view(match_row($id), $uid);
}

function my_turn(array $st, string $me): bool {
  return match ($st['phase']) {
    'rps', 'tiebreak' => ($st['rps'][$me] ?? null) === null,
    'pick' => $st['picker'] === $me,
    'choose' => $st['target'] === $me,
    'quiz' => $st['quiz']['p'][$me]['i'] < count($st['quiz']['qs']),
    default => false,
  };
}

/* Ce que voit un joueur : jamais le coup en attente de l'adversaire, jamais une bonne réponse avant d'avoir répondu soi-même */
function match_view(array $m, string $uid): array {
  $st = match_state($m);
  $me = match_side($m, $uid); $op = op_side($me);
  $v = ['id' => $m['id'], 'version' => (int) $m['version'], 'status' => $m['status'], 'me' => $me, 'a' => $m['a_id'], 'b' => $m['b_id'],
    'phase' => $st['phase'], 'turn' => $st['turn'], 'picker' => $st['picker'], 'target' => $st['target'], 'score' => $st['score'],
    'tb' => $st['tb'], 'winner' => $st['winner'], 'forfeit' => $st['forfeit'], 'rpsLog' => $st['rpsLog'],
    'rps' => ['me' => $st['rps'][$me] ?? null, 'opDone' => ($st['rps'][$op] ?? null) !== null],
    'picks' => $st['picks'], 'chosen' => $st['chosen'], 'turns' => $st['turns'], 'myTurn' => my_turn($st, $me),
    'updated' => iso($m['updated_at'])];
  if ($st['quiz']) {
    $qz = $st['quiz']; $n = count($qz['qs']); $p = $qz['p'][$me]; $o = $qz['p'][$op]; $now = time();
    $past = [];
    foreach ($p['res'] as $k => $r) $past[] = ['q' => $qz['qs'][$k]['q'], 'opts' => $qz['qs'][$k]['opts'], 'ans' => $qz['qs'][$k]['ans'], 'opt' => $r['opt'], 'ok' => $r['ok']];
    $started = $p['i'] < $n && $p['t0'] !== null;
    $v['quiz'] = ['n' => $n, 'i' => $p['i'], 'past' => $past, 'ok' => count(array_filter($p['res'], fn($r) => $r['ok'])),
      'started' => $started, 'left' => $started ? max(0, $p['t0'] + QUIZ_SECONDS - $now) : null,
      'cur' => $started ? ['q' => $qz['qs'][$p['i']]['q'], 'opts' => $qz['qs'][$p['i']]['opts']] : null,
      'op' => ['i' => $o['i'], 'done' => $o['i'] >= $n]];
  }
  return $v;
}

function match_list(string $uid): array {
  $rows = q('SELECT * FROM matches WHERE a_id = ? OR b_id = ? ORDER BY (status = \'live\') DESC, updated_at DESC LIMIT 20', [$uid, $uid])->fetchAll();
  return array_map(function ($m) use ($uid) {
    $st = match_state($m); $me = match_side($m, $uid); $op = op_side($me);
    return ['id' => $m['id'], 'op' => $m[$op . '_id'], 'me' => $me, 'phase' => $st['phase'], 'myTurn' => my_turn($st, $me),
      'score' => ['me' => $st['score'][$me], 'op' => $st['score'][$op]], 'winner' => $st['winner'], 'status' => $m['status'],
      'version' => (int) $m['version'], 'updated' => iso($m['updated_at'])];
  }, $rows);
}

/* ---------- Coups (chacun joue à son rythme, la partie avance quand les deux ont joué) ---------- */
function rps_play(array &$st, string $side, string $c): void {
  if (!in_array($st['phase'], ['rps', 'tiebreak'], true)) fail(409, 'bad_phase');
  if (!isset(RPS_BEATS[$c])) fail(400, 'bad_choice');
  if (($st['rps'][$side] ?? null) !== null) fail(409, 'already_played');
  $st['rps'][$side] = $c;
  if ($st['rps']['a'] === null || $st['rps']['b'] === null) return;
  $a = $st['rps']['a']; $b = $st['rps']['b'];
  $w = $a === $b ? null : (RPS_BEATS[$a] === $b ? 'a' : 'b');
  $st['rpsLog'][] = ['a' => $a, 'b' => $b, 'w' => $w, 'phase' => $st['phase']];
  $st['rps'] = ['a' => null, 'b' => null];
  if ($w === null) return; // égalité : on rejoue
  if ($st['phase'] === 'rps') {
    $st['phase'] = 'pick'; $st['turn'] = 1; $st['picker'] = $w; $st['target'] = op_side($w);
  } else {
    $st['tb'][$w]++;
    if ($st['tb'][$w] >= 2) { $st['phase'] = 'done'; $st['winner'] = $w; }
  }
}

function match_pick(array &$st, string $side, $works): void {
  if ($st['phase'] !== 'pick') fail(409, 'bad_phase');
  if ($st['picker'] !== $side) fail(403, 'not_your_turn');
  if (!is_array($works)) fail(400, 'bad_works');
  $clean = []; $ids = [];
  foreach ($works as $w) { $cw = clean_work($w); if ($cw && !in_array($cw['id'], $ids, true)) { $clean[] = $cw; $ids[] = $cw['id']; } }
  if (count($clean) !== 5) fail(400, 'need_five');
  $st['picks'] = $clean; $st['chosen'] = null; $st['quiz'] = null; $st['phase'] = 'choose';
}

function match_choose(array &$st, string $side, string $id, array $uids): void {
  if ($st['phase'] !== 'choose') fail(409, 'bad_phase');
  if ($st['target'] !== $side) fail(403, 'not_your_turn');
  $work = null;
  foreach ($st['picks'] as $w) if ($w['id'] === $id) $work = $w;
  if (!$work) fail(400, 'bad_work');
  $st['chosen'] = $work;
  $st['quiz'] = ['qs' => make_quiz($work, $st['picks'], $uids),
    'p' => ['a' => ['i' => 0, 't0' => null, 'res' => []], 'b' => ['i' => 0, 't0' => null, 'res' => []]]];
  $st['phase'] = 'quiz';
}

/* Questionnaire : chaque joueur a son propre chrono, lancé quand il affiche la question.
   Une question laissée ouverte trop longtemps compte comme ratée à la reprise. */
function quiz_expire(array &$p): void {
  if ($p['t0'] !== null && time() > $p['t0'] + QUIZ_SECONDS + 3) {
    $p['res'][$p['i']] = ['opt' => -1, 'ok' => false];
    $p['i']++; $p['t0'] = null;
  }
}
function match_qnext(array &$st, string $side): void {
  if ($st['phase'] !== 'quiz') fail(409, 'bad_phase');
  $p = &$st['quiz']['p'][$side]; $n = count($st['quiz']['qs']);
  quiz_expire($p);
  if ($p['i'] < $n && $p['t0'] === null) $p['t0'] = time();
  unset($p);
  quiz_finish($st);
}
function match_answer(array &$st, string $side, int $i, int $opt): void {
  if ($st['phase'] !== 'quiz') fail(409, 'bad_phase');
  $p = &$st['quiz']['p'][$side]; $qs = $st['quiz']['qs'];
  if ($i !== $p['i'] || !isset($qs[$i]) || $p['t0'] === null) fail(409, 'bad_question');
  $late = time() > $p['t0'] + QUIZ_SECONDS + 3; // petite marge pour le réseau
  $ok = !$late && $opt === $qs[$i]['ans'];
  $p['res'][$i] = ['opt' => $late ? -1 : $opt, 'ok' => $ok];
  $p['i']++; $p['t0'] = null;
  if ($ok) $st['score'][$side]++;
  unset($p);
  quiz_finish($st);
}
// Quand les deux joueurs ont fini : on garde le récapitulatif, puis on inverse les rôles ou on conclut
function quiz_finish(array &$st): void {
  $qz = $st['quiz']; $n = count($qz['qs']);
  if ($qz['p']['a']['i'] < $n || $qz['p']['b']['i'] < $n) return;
  $qs = [];
  foreach ($qz['qs'] as $k => $q) $qs[] = ['q' => $q['q'], 'opts' => $q['opts'], 'ans' => $q['ans'], 'a' => $qz['p']['a']['res'][$k] ?? null, 'b' => $qz['p']['b']['res'][$k] ?? null];
  $pts = ['a' => 0, 'b' => 0];
  foreach (['a', 'b'] as $x) foreach ($qz['p'][$x]['res'] as $r) if ($r['ok']) $pts[$x]++;
  $st['turns'][] = ['picker' => $st['picker'], 'target' => $st['target'], 'work' => $st['chosen'], 'pts' => $pts, 'qs' => $qs];
  $st['quiz'] = null;
  if ($st['turn'] === 1) {
    $st['turn'] = 2; [$st['picker'], $st['target']] = [$st['target'], $st['picker']];
    $st['phase'] = 'pick'; $st['picks'] = []; $st['chosen'] = null;
  } elseif ($st['score']['a'] !== $st['score']['b']) {
    $st['phase'] = 'done'; $st['winner'] = $st['score']['a'] > $st['score']['b'] ? 'a' : 'b';
  } else {
    $st['phase'] = 'tiebreak'; $st['tb'] = ['a' => 0, 'b' => 0]; $st['rps'] = ['a' => null, 'b' => null];
  }
}

/* ---------- Questions générées à partir des fiches des œuvres ---------- */
const QZ_GENRES = [
  'f' => ['Action', 'Comédie', 'Drame', 'Science-fiction', 'Horreur', 'Thriller', 'Animation', 'Romance', 'Documentaire', 'Fantastique', 'Policier', 'Aventure', 'Guerre', 'Western'],
  's' => ['Comédie', 'Drame', 'Science-fiction', 'Thriller', 'Policier', 'Animation', 'Fantastique', 'Documentaire', 'Romance', 'Action', 'Mystère'],
  'l' => ['Roman', 'Science-fiction', 'Fantasy', 'Policier', 'Biographie', 'Essai', 'Poésie', 'Bande dessinée', 'Thriller', 'Jeunesse', 'Histoire'],
  'j' => ['Action', 'Aventure', 'RPG', 'Stratégie', 'Plateforme', 'Course', 'Sport', 'Simulation', 'Puzzle', 'Combat', 'Tir', 'Indépendant'],
  'b' => ['Stratégie', 'Ambiance', 'Coopératif', 'Famille', 'Cartes', 'Dés', 'Enquête', 'Négociation', 'Placement d’ouvriers'],
  'm' => ['Pop', 'Rock', 'Rap/Hip Hop', 'Électro', 'Jazz', 'Soul & Funk', 'Classique', 'Reggae', 'Metal', 'Chanson française', 'R&B'],
];
const QZ_PEOPLE = [
  'f' => ['Steven Spielberg', 'Christopher Nolan', 'Quentin Tarantino', 'Martin Scorsese', 'Luc Besson', 'Jacques Audiard', 'Agnès Varda', 'Denis Villeneuve', 'Greta Gerwig', 'Bong Joon-ho', 'Hayao Miyazaki', 'Ridley Scott', 'Céline Sciamma', 'James Cameron'],
  's' => ['Vince Gilligan', 'David Chase', 'Shonda Rhimes', 'Ryan Murphy', 'David Lynch', 'Matt Groening', 'Phoebe Waller-Bridge', 'Eric Rochant', 'Jesse Armstrong', 'The Duffer Brothers', 'Alexandre Astier'],
  'l' => ['Victor Hugo', 'Albert Camus', 'J.K. Rowling', 'Stephen King', 'Agatha Christie', 'Haruki Murakami', 'Fred Vargas', 'Joël Dicker', 'George Orwell', 'Amélie Nothomb', 'Annie Ernaux', 'Frank Herbert'],
  'j' => ['Nintendo', 'Ubisoft', 'Rockstar Games', 'FromSoftware', 'Naughty Dog', 'Bethesda', 'Valve', 'Capcom', 'Square Enix', 'Supergiant Games', 'CD Projekt Red', 'Blizzard'],
  'b' => ['Klaus Teuber', 'Uwe Rosenberg', 'Bruno Cathala', 'Antoine Bauza', 'Reiner Knizia', 'Matt Leacock', 'Vlaada Chvátil', 'Klaus-Jürgen Wrede'],
  'm' => ['Daft Punk', 'The Beatles', 'Beyoncé', 'Stromae', 'Céline Dion', 'Queen', 'Drake', 'Angèle', 'PNL', 'Madonna', 'Radiohead', 'Aya Nakamura'],
];
const QZ_ACTORS = ['Tom Hanks', 'Meryl Streep', 'Jean Dujardin', 'Marion Cotillard', 'Brad Pitt', 'Scarlett Johansson', 'Omar Sy', 'Léa Seydoux', 'Leonardo DiCaprio',
  'Cate Blanchett', 'Denzel Washington', 'Audrey Tautou', 'Vincent Cassel', 'Keanu Reeves', 'Natalie Portman', 'Gérard Depardieu', 'Zendaya', 'Pedro Pascal'];
const QZ_PLATFORMS = ['PC', 'PS5', 'PS4', 'XSX', 'XONE', 'Switch', 'PS3', 'X360', 'Wii', 'iOS', 'Android'];

function qz_opts(string $good, array $pool, int $n = 4): ?array {
  $pool = array_values(array_unique(array_filter($pool, fn($x) => $x !== '' && mb_strtolower($x) !== mb_strtolower($good))));
  shuffle($pool);
  if (count($pool) < $n - 1) return null;
  $opts = array_merge([$good], array_slice($pool, 0, $n - 1));
  shuffle($opts);
  return ['opts' => $opts, 'ans' => array_search($good, $opts, true)];
}
function qz_bucket(int $v, array $edges, array $labels): array {
  $i = 0; while ($i < count($edges) && $v >= $edges[$i]) $i++;
  return ['opts' => $labels, 'ans' => $i];
}

function make_quiz(array $work, array $picks, array $uids): array {
  // fiche détaillée de l'œuvre choisie, et des autres propositions pour fabriquer des réponses crédibles
  $full = function (array $w): array { try { return array_merge($w, catalog_work($w['id'])); } catch (Throwable $e) { return $w; } };
  $w = $full($work); $t = $w['t']; $ti = '« ' . $w['ti'] . ' »';
  $others = [];
  foreach ($picks as $p) if ($p['id'] !== $work['id']) $others[] = $full($p);
  foreach ($uids as $u) {
    $d = json_decode((string) q('SELECT data FROM users WHERE id = ?', [$u])->fetchColumn(), true);
    foreach (($d['works'] ?? []) as $x) if (is_array($x) && ($x['t'] ?? '') === $t && ($x['id'] ?? '') !== $work['id']) $others[] = $x;
  }
  $people = []; $genres = []; $cast = []; $tracks = []; $plats = [];
  foreach ($others as $o) {
    if (($o['t'] ?? '') === $t) foreach (explode(', ', (string) ($o['c'] ?? '')) as $c) $people[] = trim($c);
    if (($o['t'] ?? '') === $t) foreach (($o['g'] ?? []) as $g) $genres[] = $g;
    foreach (($o['cast'] ?? []) as $c) $cast[] = $c;
    foreach (($o['tracks'] ?? []) as $c) $tracks[] = $c;
    foreach (($o['plat'] ?? []) as $c) $plats[] = $c;
  }
  $people = array_merge($people, QZ_PEOPLE[$t] ?? []);
  $genres = array_merge($genres, QZ_GENRES[$t] ?? []);
  $cast = array_merge($cast, QZ_ACTORS);
  $plats = array_merge($plats, QZ_PLATFORMS);
  $verb = ['f' => 'est sorti le film', 's' => 'a démarré la série', 'l' => 'a été publié le livre', 'j' => 'est sorti le jeu', 'b' => 'a été publié le jeu', 'm' => 'est sorti l’album'][$t] ?? 'est sortie l’œuvre';
  $who = ['f' => 'Qui a réalisé', 's' => 'Qui a créé la série', 'l' => 'Qui a écrit', 'j' => 'Quel studio a développé', 'b' => 'Qui a créé le jeu', 'm' => 'Quel artiste a sorti l’album'][$t] ?? 'Qui a créé';
  $creators = array_values(array_filter(array_map('trim', explode(', ', (string) ($w['c'] ?? '')))));
  $y = (int) ($w['y'] ?? 0); $d = (int) ($w['d'] ?? 0);

  $gen = [];
  if ($y) $gen[] = function () use ($y, $verb, $ti) {
    $c = [$y]; while (count($c) < 4) { $v = $y + random_int(-7, 7); if ($v !== $y && !in_array($v, $c, true) && $v <= (int) date('Y')) $c[] = $v; }
    sort($c); return ['q' => "En quelle année $verb $ti ?", 'opts' => array_map('strval', $c), 'ans' => array_search($y, $c, true)];
  };
  if ($creators) $gen[] = function () use ($creators, $people, $who, $ti) {
    $o = qz_opts($creators[0], array_diff($people, $creators)); return $o ? ['q' => "$who $ti ?"] + $o : null;
  };
  if (!empty($w['g'])) $gen[] = function () use ($w, $genres, $ti) {
    $o = qz_opts($w['g'][array_rand($w['g'])], array_diff($genres, $w['g'])); return $o ? ['q' => "Lequel de ces genres colle à $ti ?"] + $o : null;
  };
  if (!empty($w['cast'])) $gen[] = function () use ($w, $cast, $ti) {
    $o = qz_opts($w['cast'][array_rand($w['cast'])], array_diff($cast, $w['cast'])); return $o ? ['q' => "Qui joue dans $ti ?"] + $o : null;
  };
  if (!empty($w['plat'])) $gen[] = function () use ($w, $plats, $ti) {
    $o = qz_opts($w['plat'][array_rand($w['plat'])], array_diff($plats, $w['plat'])); return $o ? ['q' => "Sur quelle plateforme peut-on jouer à $ti ?"] + $o : null;
  };
  if (!empty($w['tracks'])) $gen[] = function () use ($w, $tracks, $ti) {
    $o = qz_opts($w['tracks'][array_rand($w['tracks'])], array_diff($tracks, $w['tracks'])); return $o ? ['q' => "Lequel de ces titres est sur l’album $ti ?"] + $o : null;
  };
  if ($d) $gen[] = function () use ($t, $d, $ti) {
    return match ($t) {
      'f' => ['q' => "Combien de temps dure $ti ?"] + qz_bucket($d, [90, 120, 150], ['Moins de 1 h 30', '1 h 30 à 2 h', '2 h à 2 h 30', 'Plus de 2 h 30']),
      'l' => ['q' => "Combien de pages compte $ti, à peu près ?"] + qz_bucket($d, [200, 400, 700], ['Moins de 200', '200 à 400', '400 à 700', 'Plus de 700']),
      'b' => ['q' => "Combien de temps dure une partie de $ti ?"] + qz_bucket($d, [30, 60, 120], ['Moins de 30 min', '30 à 60 min', '1 h à 2 h', 'Plus de 2 h']),
      's', 'm' => (function () use ($t, $d, $ti) { $c = [$d]; while (count($c) < 4) { $v = max(1, $d + random_int(-4, 6)); if (!in_array($v, $c, true)) $c[] = $v; } sort($c);
        return ['q' => $t === 's' ? "Combien de saisons compte $ti ?" : "Combien de titres compte l’album $ti ?", 'opts' => array_map('strval', $c), 'ans' => array_search($d, $c, true)]; })(),
      default => null,
    };
  };
  shuffle($gen);
  $qs = [];
  foreach ($gen as $g) { $r = $g(); if ($r && count($qs) < 5) $qs[] = $r; }
  // compléments en vrai ou faux si la fiche est maigre
  $tf = [];
  if ($y) { $pivot = [1980, 1990, 2000, 2010, 2015, 2020][array_rand([0, 1, 2, 3, 4, 5])]; $tf[] = ['q' => "Vrai ou faux : $ti est sorti avant $pivot.", 'ok' => $y < $pivot]; }
  if ($y) $tf[] = ['q' => 'Vrai ou faux : ' . $ti . ' date des années ' . (intdiv($y, 10) * 10 + (random_int(0, 1) ? 0 : 10)) . '.', 'ok' => null];
  if ($creators) { $fake = random_int(0, 1) === 1; $name = $fake ? (array_values(array_diff($people, $creators))[0] ?? $creators[0]) : $creators[0];
    $tf[] = ['q' => "Vrai ou faux : $ti est signé $name.", 'ok' => !$fake || $name === $creators[0]]; }
  if (!empty($w['g'])) { $fakeG = array_values(array_diff($genres, $w['g'])); $useFake = $fakeG && random_int(0, 1) === 1;
    $tf[] = ['q' => 'Vrai ou faux : ' . $ti . ' est classé dans le genre « ' . ($useFake ? $fakeG[0] : $w['g'][0]) . ' ».', 'ok' => !$useFake]; }
  $tf[] = ['q' => "Vrai ou faux : tu as vraiment vu (ou lu, joué, écouté) $ti en entier.", 'ok' => true];
  foreach ($tf as $x) {
    if (count($qs) >= 5) break;
    if ($x['ok'] === null) { // décennie : on calcule la vérité à partir du texte
      preg_match('/années (\d{4})/', $x['q'], $mm); $x['ok'] = isset($mm[1]) && intdiv($y, 10) * 10 === (int) $mm[1];
    }
    $qs[] = ['q' => $x['q'], 'opts' => ['Vrai', 'Faux'], 'ans' => $x['ok'] ? 0 : 1];
  }
  return array_slice($qs, 0, 5);
}
