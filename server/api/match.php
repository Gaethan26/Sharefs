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

/* ---------- Questions sur ce qu'il se passe dans l'œuvre, tirées des données des catalogues (sans IA) ----------
   Personnages (TMDB, IGDB, Open Library), rôles, lieux, épisodes, titres, mécaniques, et résumé à compléter. */
const QZ_CHARS = [
  'f' => ['Sherlock Holmes', 'James Bond', 'Indiana Jones', 'Ellen Ripley', 'Hermione Granger', 'Tony Stark', 'Jack Sparrow', 'Marty McFly', 'Sarah Connor', 'Amélie Poulain', 'Hannibal Lecter', 'Forrest Gump', 'Neo', 'Maximus', 'Rocky Balboa', 'Vito Corleone'],
  's' => ['Walter White', 'Jon Snow', 'Arya Stark', 'Tony Soprano', 'Michael Scott', 'Eleven', 'Don Draper', 'Sherlock Holmes', 'Rachel Green', 'Dale Cooper', 'Saul Goodman', 'Lucifer', 'Jessica Day', 'Malotru', 'Perceval', 'Daenerys Targaryen'],
  'j' => ['Mario', 'Link', 'Lara Croft', 'Kratos', 'Master Chief', 'Geralt de Riv', 'Aloy', 'Samus Aran', 'Solid Snake', 'Ezio Auditore', 'Joel', 'Ellie', 'Cloud Strife', 'Sonic', 'Zagreus', 'Arthur Morgan'],
  'l' => ['Jean Valjean', 'Hermione Granger', 'Sherlock Holmes', 'Emma Bovary', 'Bilbon Sacquet', 'Arsène Lupin', 'Dracula', 'Jay Gatsby', 'Paul Atréides', 'Meursault', 'Winston Smith', 'Elizabeth Bennet', 'Edmond Dantès', 'Gavroche', 'Lisbeth Salander', 'Jo March'],
];
const QZ_PLACES = ['Paris', 'Londres', 'New York', 'Tokyo', 'Rome', 'Venise', 'Moscou', 'Berlin', 'Los Angeles', 'Mars', 'la Lune', 'une île déserte', 'le Far West', 'Égypte', 'Écosse', 'Inde', 'Brésil', 'Antarctique'];
const QZ_MECH = ['Placement d’ouvriers', 'Construction de deck', 'Draft', 'Pose de tuiles', 'Majorité', 'Enchères', 'Lancer de dés', 'Coopération', 'Rôles cachés', 'Collection de sets', 'Programmation', 'Déplacement sur plateau'];
const QZ_STOP = ['Le', 'La', 'Les', 'Un', 'Une', 'Des', 'Du', 'De', 'Dans', 'Quand', 'Mais', 'Alors', 'Lorsque', 'Avec', 'Après', 'Avant', 'Pendant', 'Cette', 'Ce', 'Cet', 'Ces', 'Il', 'Elle', 'Ils', 'Elles', 'Son', 'Sa', 'Ses', 'Leur', 'Leurs', 'Pour', 'Par', 'Sur', 'Sous', 'Entre', 'Tout', 'Tous', 'Toute', 'Toutes', 'Mon', 'Ma', 'Mes', 'Notre', 'Nos', 'Votre', 'Vos', 'Au', 'Aux', 'En', 'Et', 'Ou', 'Où', 'Mais', 'Puis', 'Bientôt', 'Désormais', 'Ainsi', 'Cependant', 'Pourtant', 'Lui', 'Eux', 'Celui', 'Celle', 'Chaque', 'Comment', 'Pourquoi', 'Lorsqu', 'Jusqu', 'Depuis', 'Seul', 'Seule', 'Une', 'Rien', 'Personne', 'Contre', 'Malgré', 'Grâce', 'Face', 'Afin', 'Tandis', 'Enfin', 'Aujourd', 'The', 'And', 'When', 'His', 'Her', 'After'];

// Résumé à compléter : un nom propre du résumé (personnage, lieu…) est masqué
function qz_cloze(string $text, array $w, array $pool): ?array {
  $text = trim((string) preg_replace('/\s+/', ' ', $text));
  if (mb_strlen($text) < 60) return null;
  $titleWords = array_map('mb_strtolower', preg_split('/[\s’\'\-:,]+/u', (string) ($w['ti'] ?? '')));
  $sentences = preg_split('/(?<=[.!?…])\s+/u', $text);
  $cands = [];
  foreach ($sentences as $si => $sen) {
    if (mb_strlen($sen) < 30) continue;
    if (!preg_match_all('/(?<=[\s«“(\'’-])([A-ZÉÈÊÀÂÎÔÛÇ][\p{L}’\'-]{2,}(?:\s[A-ZÉÈÊÀÂÎÔÛÇ][\p{L}’\'-]{2,})?)/u', ' ' . $sen, $m, PREG_OFFSET_CAPTURE)) continue;
    foreach ($m[1] as [$word, $off]) {
      if ($off <= 1) continue; // le premier mot d'une phrase n'est pas forcément un nom propre
      $first = explode(' ', $word)[0];
      if (in_array($first, QZ_STOP, true) || in_array(mb_strtolower($first), $titleWords, true)) continue;
      $cands[] = [$si, $word];
    }
  }
  if (!$cands) return null;
  // on préfère un mot qui est aussi un personnage connu de l'œuvre
  $chars = array_map('mb_strtolower', $w['chars'] ?? []);
  usort($cands, fn($x, $y) => (int) in_array(mb_strtolower($y[1]), $chars, true) - (int) in_array(mb_strtolower($x[1]), $chars, true));
  [$si, $word] = random_int(0, 2) === 0 ? $cands[array_rand($cands)] : $cands[0];
  $sen = $sentences[$si];
  $blank = preg_replace('/' . preg_quote($word, '/') . '/u', '____', $sen, 1);
  if (mb_strlen($blank) > 170) { $pos = mb_strpos($blank, '____'); $start = max(0, $pos - 80); $blank = ($start > 0 ? '…' : '') . mb_substr($blank, $start, 160) . '…'; }
  // réponses du même genre : personnages pour un personnage, lieux pour un lieu
  $lw = mb_strtolower($word);
  if (in_array($lw, $chars, true)) $pool = array_merge(array_diff($pool, QZ_PLACES), QZ_CHARS[$w['t']] ?? []);
  elseif (in_array($lw, array_map('mb_strtolower', $w['places'] ?? []), true)) $pool = QZ_PLACES;
  $o = qz_opts($word, array_filter($pool, fn($x) => mb_stripos($text, $x) === false));
  return $o ? ['q' => 'Complète le résumé : « ' . $blank . ' »'] + $o : null;
}

function story_questions(array $w, array $others): array {
  $t = $w['t']; $ti = '« ' . $w['ti'] . ' »';
  $oChars = []; $oPlaces = []; $oEps = []; $oTracks = []; $oNames = [];
  foreach ($others as $o) {
    foreach (($o['chars'] ?? []) as $c) $oChars[] = $c;
    foreach (($o['places'] ?? []) as $c) $oPlaces[] = $c;
    foreach (($o['eps'] ?? []) as $c) $oEps[] = $c;
    foreach (($o['tracks'] ?? []) as $c) $oTracks[] = $c;
    if (preg_match_all('/(?<=\s)([A-ZÉÈÀÂÎÔÛÇ][\p{L}’\'-]{3,})/u', ' ' . ($o['syn'] ?? ''), $m)) foreach ($m[1] as $x) if (!in_array($x, QZ_STOP, true)) $oNames[] = $x;
  }
  $chars = $w['chars'] ?? []; $roles = $w['roles'] ?? [];
  $charPool = array_merge($oChars, QZ_CHARS[$t] ?? QZ_CHARS['f']);
  $gen = [];
  if (count($chars) >= 1) $gen[] = function () use ($chars, $charPool, $ti, $t) {
    $verb = ['f' => 'apparaît dans le film', 's' => 'apparaît dans la série', 'j' => 'croise-t-on dans le jeu', 'l' => 'apparaît dans le livre'][$t] ?? 'apparaît dans';
    $o = qz_opts($chars[array_rand(array_slice($chars, 0, 6))], array_diff($charPool, $chars));
    return $o ? ['q' => "Lequel de ces personnages $verb $ti ?"] + $o : null;
  };
  if (count($chars) >= 4) $gen[] = function () use ($chars, $charPool, $ti) {
    // l'intrus : un personnage qui n'est PAS dans l'œuvre
    $fake = array_values(array_diff($charPool, $chars)); if (!$fake) return null;
    $intrus = $fake[array_rand($fake)]; $real = array_slice($chars, 0, 8); shuffle($real);
    $opts = array_merge([$intrus], array_slice($real, 0, 3)); shuffle($opts);
    return ['q' => "Intrus : lequel de ces personnages n’apparaît PAS dans $ti ?", 'opts' => $opts, 'ans' => array_search($intrus, $opts, true)];
  };
  if (count($roles) >= 4) $gen[] = function () use ($roles, $ti) {
    [$actor, $char] = $roles[array_rand(array_slice($roles, 0, 6))];
    $o = qz_opts($char, array_column(array_filter($roles, fn($r) => $r[1] !== $char), 1));
    return $o ? ['q' => "Dans $ti, quel personnage est joué par $actor ?"] + $o : null;
  };
  if (!empty($w['places'])) $gen[] = function () use ($w, $oPlaces, $ti) {
    $o = qz_opts($w['places'][array_rand(array_slice($w['places'], 0, 4))], array_diff(array_merge($oPlaces, QZ_PLACES), $w['places']));
    return $o ? ['q' => "Lequel de ces lieux apparaît dans $ti ?"] + $o : null;
  };
  if (count($w['eps'] ?? []) >= 3) $gen[] = function () use ($w, $oEps, $ti) {
    $fake = array_merge($oEps, ['Le Retour', 'La Nuit des masques', 'Point de non-retour', 'Le Dernier Jour', 'Sous la surface', 'Les Liens du sang', 'Le Grand Saut', 'Échec et mat']);
    $o = qz_opts($w['eps'][array_rand($w['eps'])], array_diff($fake, $w['eps']));
    return $o ? ['q' => "Lequel de ces titres est un épisode de la saison 1 de $ti ?"] + $o : null;
  };
  if (count($w['eps'] ?? []) >= 4) $gen[] = function () use ($w, $ti) {
    $first = $w['eps'][0]; $rest = array_slice($w['eps'], 1); shuffle($rest);
    $opts = array_merge([$first], array_slice($rest, 0, 3)); shuffle($opts);
    return ['q' => "Quel est le tout premier épisode de $ti ?", 'opts' => $opts, 'ans' => array_search($first, $opts, true)];
  };
  if (count($w['tracks'] ?? []) >= 4) $gen[] = function () use ($w, $ti) {
    $first = $w['tracks'][0]; $rest = array_slice($w['tracks'], 1); shuffle($rest);
    $opts = array_merge([$first], array_slice($rest, 0, 3)); shuffle($opts);
    return ['q' => "Quel titre ouvre l’album $ti ?", 'opts' => $opts, 'ans' => array_search($first, $opts, true)];
  };
  if (count($w['tracks'] ?? []) >= 4) $gen[] = function () use ($w, $ti) {
    $last = $w['tracks'][count($w['tracks']) - 1]; $rest = array_slice($w['tracks'], 0, -1); shuffle($rest);
    $opts = array_merge([$last], array_slice($rest, 0, 3)); shuffle($opts);
    return ['q' => "Quel titre clôt l’album $ti ?", 'opts' => $opts, 'ans' => array_search($last, $opts, true)];
  };
  if (!empty($w['mech'])) $gen[] = function () use ($w, $ti) {
    $o = qz_opts($w['mech'][array_rand($w['mech'])], array_diff(QZ_MECH, $w['mech']));
    return $o ? ['q' => "Quelle mécanique fait partie de $ti ?"] + $o : null;
  };
  $namePool = array_merge($oNames, $oChars, QZ_CHARS[$t] ?? [], QZ_PLACES);
  foreach (array_filter([$w['syn'] ?? '', $w['story'] ?? '']) as $txt) $gen[] = fn() => qz_cloze($txt, $w, $namePool);
  if (!empty($w['syn'])) $gen[] = fn() => qz_cloze($w['syn'], $w, $namePool); // un second résumé à trous possible
  if (!empty($w['tag'])) $gen[] = function () use ($w, $others, $ti) {
    $fakes = array_values(array_filter(array_map(fn($o) => $o['tag'] ?? '', $others)));
    $fakes = array_merge($fakes, ['Certaines légendes ne meurent jamais.', 'Le monde ne sera plus jamais le même.', 'Tout commence par une rencontre.', 'La vérité est ailleurs.', 'Rien ne sera plus comme avant.']);
    $o = qz_opts($w['tag'], $fakes); return $o ? ['q' => "Quelle est l’accroche de $ti ?"] + $o : null;
  };
  shuffle($gen);
  $out = []; $seen = [];
  foreach ($gen as $g) { $r = $g(); if ($r && !isset($seen[$r['q']])) { $seen[$r['q']] = 1; $out[] = $r; } }
  return $out;
}

function make_quiz(array $work, array $picks, array $uids): array {
  // 4 questions sur ce qu'il se passe dans l'œuvre quand les données le permettent, complétées par des questions de fiche
  $full = function (array $w): array { try { return array_merge($w, catalog_work($w['id'])); } catch (Throwable $e) { return $w; } };
  $w = $full($work); $others = [];
  foreach ($picks as $p) if ($p['id'] !== $work['id']) $others[] = $full($p);
  $story = array_slice(story_questions($w, $others), 0, 4);
  $qs = $story;
  foreach (make_quiz_meta($work, $picks, $uids) as $m) if (count($qs) < 5) $qs[] = $m;
  shuffle($qs);
  return array_slice($qs, 0, 5);
}

function make_quiz_meta(array $work, array $picks, array $uids): array {
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
