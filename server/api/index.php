<?php
declare(strict_types=1);
if (PHP_VERSION_ID < 80100) {
  http_response_code(500); header('Content-Type: application/json');
  echo '{"error":"php_8_1_required"}'; exit;
}
require __DIR__ . '/lib.php';
require __DIR__ . '/catalog.php';
require __DIR__ . '/match.php';

cors();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$M = $_SERVER['REQUEST_METHOD'];
$path = trim((string) preg_replace('#^.*?/api(/|$)#', '', (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)), '/');

if (preg_match('#^(state|challenges|fetish|matches|match/|recs/[0-9a-f-]{36}/comments|comments/)#', $path)) { try { ensure_schema(); migrate_rarities(); } catch (Throwable $e) { error_log('[sharefs] schema : ' . $e->getMessage()); } }

const EMAIL_RE = '/^[^\s@]+@[^\s@]+\.[^\s@]+$/';

function mates(string $uid): array {
  return q('SELECT DISTINCT b.user_id FROM circle_members a JOIN circle_members b ON a.circle_id = b.circle_id WHERE a.user_id = ?', [$uid])->fetchAll(PDO::FETCH_COLUMN);
}
function rec_out(array $r): array {
  return ['id' => $r['id'], 'from_id' => $r['from_id'], 'to_ids' => $r['to_ids'] ? explode(',', $r['to_ids']) : [],
    'work' => json_decode($r['work']), 'note' => $r['note'], 'created_at' => iso($r['created_at'])];
}
function chal_out(array $c): array {
  return ['id' => $c['id'], 'from_id' => $c['from_id'], 'to_id' => $c['to_id'], 'works' => json_decode($c['works']), 'note' => $c['note'],
    'created_at' => iso($c['created_at']), 'deadline' => iso($c['deadline'])];
}
function visible_rec(string $uid, string $recId): bool {
  $r = q('SELECT from_id, (SELECT GROUP_CONCAT(user_id) FROM rec_targets WHERE rec_id = recs.id) AS t FROM recs WHERE id = ?', [$recId])->fetch();
  if (!$r) return false;
  if ($r['from_id'] === $uid) return true;
  $to = $r['t'] ? explode(',', $r['t']) : [];
  if ($to) return in_array($uid, $to, true);
  return in_array($r['from_id'], mates($uid), true);
}
/* État des œuvres fétiches vu par $me : sa propre œuvre, le statut de celles des autres, jamais leur contenu avant d'être trouvé */
function fetish_state(string $me, array $ids): array {
  [$season, $label, $until] = current_season();
  $mine = q('SELECT work FROM fetishes WHERE user_id = ? AND season = ?', [$me, $season])->fetchColumn();
  $others = [];
  $today = paris_day();
  foreach ($ids as $id) {
    if ($id === $me) continue;
    $f = q('SELECT work FROM fetishes WHERE user_id = ? AND season = ?', [$id, $season])->fetchColumn();
    $row = ['user_id' => $id, 'has' => (bool) $f];
    if ($f) {
      $w = json_decode($f, true);
      $found = (bool) q('SELECT 1 FROM fetish_guesses WHERE guesser_id = ? AND target_id = ? AND season = ? AND correct = 1', [$me, $id, $season])->fetchColumn();
      $fails = (int) q('SELECT COUNT(*) FROM fetish_guesses WHERE guesser_id = ? AND target_id = ? AND season = ? AND correct = 0', [$me, $id, $season])->fetchColumn();
      $row += ['found' => $found, 'fails' => $fails,
        'guessedToday' => (bool) q('SELECT 1 FROM fetish_guesses WHERE guesser_id = ? AND target_id = ? AND day = ?', [$me, $id, $today])->fetchColumn()];
      if ($found) $row['work'] = $w;
    }
    $others[] = $row;
  }
  $found = array_map(fn($r) => ['target_id' => $r['target_id'], 'season' => $r['season'], 'work' => json_decode($r['work']), 'at' => iso($r['created_at'])],
    q('SELECT g.target_id, g.season, f.work, g.created_at FROM fetish_guesses g JOIN fetishes f ON f.user_id = g.target_id AND f.season = g.season WHERE g.guesser_id = ? AND g.correct = 1 ORDER BY g.created_at DESC', [$me])->fetchAll());
  $in = implode(',', array_fill(0, count($ids), '?'));
  $counts = [];
  foreach (q("SELECT guesser_id, COUNT(*) n FROM fetish_guesses WHERE correct = 1 AND guesser_id IN ($in) GROUP BY guesser_id", $ids)->fetchAll() as $c) $counts[$c['guesser_id']] = (int) $c['n'];
  return ['season' => $season, 'label' => $label, 'until' => $until, 'mine' => $mine ? json_decode($mine) : null, 'others' => $others, 'found' => $found, 'counts' => (object) $counts];
}
function login_out(string $uid): void {
  $u = q('SELECT id, name, data FROM users WHERE id = ?', [$uid])->fetch();
  out(['token' => new_session($uid), 'user' => user_out($u)]);
}

try {
  switch (true) {

    /* ---------- Authentification ---------- */
    case $M === 'POST' && $path === 'auth/signup':
      $b = body(); $email = strtolower(trim((string) ($b['email'] ?? ''))); $pass = (string) ($b['password'] ?? '');
      if (!preg_match(EMAIL_RE, $email) || strlen($email) > 190) fail(400, 'bad_email');
      throttle('signup|' . client_ip(), 10, 3600);
      check_password($pass);
      if (q('SELECT 1 FROM users WHERE email = ?', [$email])->fetch()) fail(409, 'email_taken');
      $id = uuid();
      q('INSERT INTO users (id, email, pass) VALUES (?, ?, ?)', [$id, $email, password_hash($pass, PASSWORD_DEFAULT)]);
      login_out($id);

    case $M === 'POST' && $path === 'auth/login':
      $b = body(); $email = strtolower(trim((string) ($b['email'] ?? '')));
      throttle('login|' . $email, 8, 900); throttle('loginip|' . client_ip(), 30, 900);
      $u = q('SELECT id, pass FROM users WHERE email = ?', [$email])->fetch();
      if (!$u || !password_verify((string) ($b['password'] ?? ''), $u['pass'])) fail(401, 'bad_credentials');
      login_out($u['id']);

    case $M === 'POST' && $path === 'auth/logout':
      q('DELETE FROM sessions WHERE token_hash = ?', [hash('sha256', token_in())]);
      out(['ok' => true]);

    case $M === 'POST' && $path === 'auth/logout-all':
      $u = need_user();
      q('DELETE FROM sessions WHERE user_id = ?', [$u['id']]);
      out(['ok' => true]);

    case $M === 'POST' && $path === 'auth/forgot':
      $email = strtolower(trim((string) (body()['email'] ?? '')));
      throttle('forgot|' . client_ip(), 5, 3600);
      if (q('SELECT 1 FROM users WHERE email = ?', [$email])->fetch()) {
        $code = (string) random_int(100000, 999999);
        q('REPLACE INTO resets (email, code_hash, exp, tries) VALUES (?, ?, ?, 0)', [$email, hash('sha256', $email . '|' . $code), time() + 900]);
        send_mail($email, 'Ton code Sharefs', "Salut !\n\nTon code pour choisir un nouveau mot de passe : $code\n\nIl expire dans 15 minutes. Si tu n'as rien demandé, ignore cet e-mail.\n\nSharefs");
      }
      out(['ok' => true]);

    case $M === 'POST' && $path === 'auth/reset':
      $b = body(); $email = strtolower(trim((string) ($b['email'] ?? ''))); $pass = (string) ($b['password'] ?? '');
      $r = q('SELECT * FROM resets WHERE email = ?', [$email])->fetch();
      if (!$r || $r['exp'] < time() || $r['tries'] >= 5) fail(400, 'bad_code');
      if (!hash_equals($r['code_hash'], hash('sha256', $email . '|' . trim((string) ($b['code'] ?? ''))))) {
        q('UPDATE resets SET tries = tries + 1 WHERE email = ?', [$email]); fail(400, 'bad_code');
      }
      check_password($pass);
      $uid = q('SELECT id FROM users WHERE email = ?', [$email])->fetchColumn();
      q('UPDATE users SET pass = ? WHERE id = ?', [password_hash($pass, PASSWORD_DEFAULT), $uid]);
      q('DELETE FROM resets WHERE email = ?', [$email]);
      q('DELETE FROM sessions WHERE user_id = ?', [$uid]);
      login_out($uid);

    /* ---------- Profil ---------- */
    case $M === 'GET' && $path === 'me':
      out(user_out(need_user()));

    case $M === 'PUT' && $path === 'me':
      $u = need_user(); $b = body();
      if (array_key_exists('name', $b)) {
        $n = trim((string) $b['name']);
        if ($n === '' || mb_strlen($n) > 40) fail(400, 'bad_name');
        q('UPDATE users SET name = ? WHERE id = ?', [$n, $u['id']]);
      }
      if (array_key_exists('data', $b)) {
        $o = body_obj();
        if (!is_object($o->data ?? null)) fail(400, 'bad_data');
        $json = enc(clean_data($o->data));
        if (strlen($json) > 500000) fail(413, 'too_large');
        q('UPDATE users SET data = ? WHERE id = ?', [$json, $u['id']]);
      }
      out(['ok' => true]);

    case $M === 'DELETE' && $path === 'me':
      $u = need_user();
      q('DELETE FROM users WHERE id = ?', [$u['id']]);
      out(['ok' => true]);

    /* ---------- État complet (fil, amis, cercles) ---------- */
    case $M === 'GET' && $path === 'state':
      $u = need_user(); $me = $u['id'];
      $ids = array_values(array_unique(array_merge([$me], mates($me))));
      $in = implode(',', array_fill(0, count($ids), '?'));
      $members = array_map('user_out', q("SELECT id, name, data FROM users WHERE id IN ($in)", $ids)->fetchAll());
      $circles = q('SELECT c.code FROM circles c JOIN circle_members m ON m.circle_id = c.id WHERE m.user_id = ? ORDER BY c.created_at', [$me])->fetchAll(PDO::FETCH_COLUMN);
      $recs = q("SELECT r.*, (SELECT GROUP_CONCAT(t.user_id) FROM rec_targets t WHERE t.rec_id = r.id) AS to_ids
        FROM recs r
        WHERE r.from_id = ?
           OR EXISTS (SELECT 1 FROM rec_targets t WHERE t.rec_id = r.id AND t.user_id = ?)
           OR (NOT EXISTS (SELECT 1 FROM rec_targets t WHERE t.rec_id = r.id) AND r.from_id IN ($in))
        ORDER BY r.created_at DESC LIMIT 300", array_merge([$me, $me], $ids))->fetchAll();
      $recIds = array_column($recs, 'id');
      $comments = [];
      if ($recIds) {
        $rin = implode(',', array_fill(0, count($recIds), '?'));
        $comments = array_map(fn($c) => ['id' => $c['id'], 'rec_id' => $c['rec_id'], 'from_id' => $c['from_id'], 'text' => $c['text'], 'created_at' => iso($c['created_at'])],
          q("SELECT * FROM comments WHERE rec_id IN ($rin) ORDER BY created_at", $recIds)->fetchAll());
      }
      $chals = array_map('chal_out', q("SELECT * FROM challenges WHERE from_id IN ($in) AND to_id IN ($in) ORDER BY created_at DESC LIMIT 300", array_merge($ids, $ids))->fetchAll());
      // Membres de chaque cercle (les cercles n'ont pas de nom : l'app les présente par leurs membres)
      $circleMembers = [];
      foreach (q('SELECT c.code, m2.user_id FROM circles c JOIN circle_members m ON m.circle_id = c.id AND m.user_id = ? JOIN circle_members m2 ON m2.circle_id = c.id', [$me])->fetchAll() as $row)
        $circleMembers[$row['code']][] = $row['user_id'];
      out(['me' => user_out($u), 'members' => $members, 'circles' => $circles, 'circleMembers' => $circleMembers, 'recs' => array_map('rec_out', $recs),
        'comments' => $comments, 'challenges' => $chals, 'fetish' => fetish_state($me, $ids),
        'catalogs' => ['b' => (bool) cfg('bgg_token')], 'matches' => match_list($me)]);

    /* ---------- Cercles ---------- */
    case $M === 'POST' && $path === 'circles':
      $u = need_user();
      do { $code = strtoupper(substr(bin2hex(random_bytes(4)), 0, 6)); } while (q('SELECT 1 FROM circles WHERE code = ?', [$code])->fetch());
      $cid = uuid();
      q('INSERT INTO circles (id, code, created_by) VALUES (?, ?, ?)', [$cid, $code, $u['id']]);
      q('INSERT INTO circle_members (circle_id, user_id) VALUES (?, ?)', [$cid, $u['id']]);
      out(['code' => $code]);

    case $M === 'POST' && $path === 'circles/join':
      $u = need_user(); throttle('join|' . $u['id'], 20, 3600);
      $cid = q('SELECT id FROM circles WHERE code = ?', [strtoupper(trim((string) (body()['code'] ?? '')))])->fetchColumn();
      if (!$cid) fail(404, 'unknown_code');
      q('INSERT IGNORE INTO circle_members (circle_id, user_id) VALUES (?, ?)', [$cid, $u['id']]);
      out(['ok' => true]);

    /* ---------- Recommandations ---------- */
    case $M === 'POST' && $path === 'recs':
      $u = need_user(); $b = body(); throttle('rec|' . $u['id'], 60, 3600);
      $work = clean_work($b['work'] ?? null);
      if (!$work) fail(400, 'bad_work');
      $to = array_values(array_unique(array_filter(array_map('strval', (array) ($b['to_ids'] ?? [])))));
      if (count($to) > 50 || array_diff($to, mates($u['id']))) fail(400, 'bad_recipients');
      $note = mb_substr(trim((string) ($b['note'] ?? '')), 0, 280) ?: null;
      $id = uuid();
      db()->beginTransaction();
      q('INSERT INTO recs (id, from_id, work, note) VALUES (?, ?, ?, ?)', [$id, $u['id'], enc($work), $note]);
      foreach ($to as $t) q('INSERT INTO rec_targets (rec_id, user_id) VALUES (?, ?)', [$id, $t]);
      db()->commit();
      $r = q('SELECT r.*, (SELECT GROUP_CONCAT(t.user_id) FROM rec_targets t WHERE t.rec_id = r.id) AS to_ids FROM recs r WHERE id = ?', [$id])->fetch();
      out(rec_out($r));

    case $M === 'DELETE' && preg_match('#^recs/([0-9a-f-]{36})$#', $path, $m):
      $u = need_user();
      q('DELETE FROM recs WHERE id = ? AND from_id = ?', [$m[1], $u['id']]);
      out(['ok' => true]);

    /* ---------- Défis ---------- */
    case $M === 'POST' && $path === 'challenges':
      $u = need_user(); $b = body(); throttle('chal|' . $u['id'], 30, 3600);
      $to = (string) ($b['to_id'] ?? '');
      if ($to === $u['id'] || !in_array($to, mates($u['id']), true)) fail(400, 'bad_recipient');
      $works = $b['works'] ?? null;
      if (!is_array($works) || count($works) < 1 || count($works) > 4) fail(400, 'bad_works');
      $works = array_map('clean_work', array_values($works));
      if (in_array(null, $works, true)) fail(400, 'bad_works');
      $note = mb_substr(trim((string) ($b['note'] ?? '')), 0, 280) ?: null;
      $id = uuid();
      q('INSERT INTO challenges (id, from_id, to_id, works, note, deadline) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL 30 DAY)',
        [$id, $u['id'], $to, enc($works), $note]);
      out(chal_out(q('SELECT * FROM challenges WHERE id = ?', [$id])->fetch()));

    case $M === 'DELETE' && preg_match('#^challenges/([0-9a-f-]{36})$#', $path, $m):
      $u = need_user();
      q('DELETE FROM challenges WHERE id = ? AND from_id = ?', [$m[1], $u['id']]);
      out(['ok' => true]);

    /* ---------- Jeu 1v1 « Genre tu l'as vu !? » ---------- */
    case $M === 'GET' && $path === 'matches':
      $u = need_user();
      out(['matches' => match_list($u['id'])]);

    case $M === 'POST' && $path === 'matches':
      $u = need_user();
      $to = (string) (body()['to'] ?? '');
      if ($to === $u['id'] || !in_array($to, mates($u['id']), true)) fail(400, 'bad_recipient');
      throttle('match|' . $u['id'], 30, 3600);
      // une seule partie en cours par paire de joueurs : on la reprend
      $live = q("SELECT id FROM matches WHERE status = 'live' AND ((a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?)) LIMIT 1", [$u['id'], $to, $to, $u['id']])->fetchColumn();
      if ($live) out(['match' => match_view(match_row($live), $u['id'])]);
      $id = uuid();
      q('INSERT INTO matches (id, a_id, b_id, state) VALUES (?, ?, ?, ?)', [$id, $u['id'], $to, enc(match_new_state())]);
      out(['match' => match_view(match_row($id), $u['id'])]);

    case $M === 'GET' && preg_match('#^match/([0-9a-f-]{36})$#', $path, $mm):
      $u = need_user();
      $v = (int) ($_GET['v'] ?? -1);
      $ver = q('SELECT version, a_id, b_id FROM matches WHERE id = ?', [$mm[1]])->fetch();
      if (!$ver) fail(404, 'not_found');
      if ($ver['a_id'] !== $u['id'] && $ver['b_id'] !== $u['id']) fail(403, 'forbidden');
      if ((int) $ver['version'] === $v) out(['same' => true]);
      out(['match' => match_view(match_row($mm[1]), $u['id'])]);

    case $M === 'POST' && preg_match('#^match/([0-9a-f-]{36})/(rps|pick|choose|answer|qnext|forfeit)$#', $path, $mm):
      $u = need_user(); $b = body();
      $act = $mm[2];
      $view = match_tx($mm[1], $u['id'], function (array &$st, string $side, array $m) use ($act, $b) {
        if ($act === 'rps') rps_play($st, $side, (string) ($b['c'] ?? ''));
        elseif ($act === 'pick') match_pick($st, $side, $b['works'] ?? null);
        elseif ($act === 'choose') match_choose($st, $side, (string) ($b['id'] ?? ''), [$m['a_id'], $m['b_id']]);
        elseif ($act === 'answer') match_answer($st, $side, (int) ($b['i'] ?? -1), (int) ($b['opt'] ?? -1));
        elseif ($act === 'qnext') match_qnext($st, $side);
        else { $st['phase'] = 'done'; $st['forfeit'] = $side; $st['winner'] = op_side($side); }
      });
      out(['match' => $view]);

    /* ---------- Œuvres fétiches ---------- */
    case $M === 'POST' && $path === 'fetish':
      $u = need_user();
      $work = clean_work(body()['work'] ?? null);
      if (!$work) fail(400, 'bad_work');
      [$season] = current_season();
      if (q('SELECT 1 FROM fetishes WHERE user_id = ? AND season = ?', [$u['id'], $season])->fetchColumn()) fail(409, 'fetish_locked');
      q('INSERT INTO fetishes (user_id, season, work) VALUES (?, ?, ?)', [$u['id'], $season, enc($work)]);
      out(['ok' => true, 'season' => $season]);

    case $M === 'GET' && $path === 'fetish/options':
      $u = need_user();
      $target = (string) ($_GET['target'] ?? '');
      $mates = mates($u['id']);
      if ($target === $u['id'] || !in_array($target, $mates, true)) fail(400, 'bad_recipient');
      [$season] = current_season();
      $f = q('SELECT work FROM fetishes WHERE user_id = ? AND season = ?', [$target, $season])->fetchColumn();
      if (!$f) fail(404, 'no_fetish');
      $opts = fetish_options($u['id'], $target, $season, json_decode($f, true), array_values(array_filter($mates, fn($m) => $m !== $target)));
      $today = (bool) q('SELECT 1 FROM fetish_guesses WHERE guesser_id = ? AND target_id = ? AND day = ?', [$u['id'], $target, paris_day()])->fetchColumn();
      out(['options' => $opts, 'guessedToday' => $today]);

    case $M === 'POST' && $path === 'fetish/guess':
      $u = need_user(); $b = body();
      $target = (string) ($b['target_id'] ?? '');
      if ($target === $u['id'] || !in_array($target, mates($u['id']), true)) fail(400, 'bad_recipient');
      $work = clean_work($b['work'] ?? null);
      if (!$work) fail(400, 'bad_work');
      [$season] = current_season();
      $f = q('SELECT work FROM fetishes WHERE user_id = ? AND season = ?', [$target, $season])->fetchColumn();
      if (!$f) fail(404, 'no_fetish');
      if (q('SELECT 1 FROM fetish_guesses WHERE guesser_id = ? AND target_id = ? AND season = ? AND correct = 1', [$u['id'], $target, $season])->fetchColumn()) fail(409, 'already_found');
      $day = paris_day();
      if (q('SELECT 1 FROM fetish_guesses WHERE guesser_id = ? AND target_id = ? AND day = ?', [$u['id'], $target, $day])->fetchColumn()) fail(429, 'guess_used');
      $fw = json_decode($f, true);
      // La réponse doit faire partie des 5 propositions affichées
      $optRow = q('SELECT options FROM fetish_options WHERE guesser_id = ? AND target_id = ? AND season = ?', [$u['id'], $target, $season])->fetchColumn();
      if ($optRow && !in_array($work['id'], array_map(fn($w) => $w['id'] ?? '', json_decode($optRow, true) ?: []), true)) fail(400, 'bad_work');
      $ok = same_work($fw, $work);
      q('INSERT INTO fetish_guesses (id, guesser_id, target_id, season, day, work, correct) VALUES (?, ?, ?, ?, ?, ?, ?)', [uuid(), $u['id'], $target, $season, $day, enc($work), $ok ? 1 : 0]);
      out(['correct' => $ok, 'work' => $ok ? $fw : null]);

    /* ---------- Commentaires ---------- */
    case $M === 'POST' && preg_match('#^recs/([0-9a-f-]{36})/comments$#', $path, $m):
      $u = need_user(); throttle('cmt|' . $u['id'], 120, 3600);
      if (!visible_rec($u['id'], $m[1])) fail(404, 'not_found');
      $text = mb_substr(trim((string) (body()['text'] ?? '')), 0, 500);
      if ($text === '') fail(400, 'empty');
      $id = uuid();
      q('INSERT INTO comments (id, rec_id, from_id, text) VALUES (?, ?, ?, ?)', [$id, $m[1], $u['id'], $text]);
      $c = q('SELECT * FROM comments WHERE id = ?', [$id])->fetch();
      out(['id' => $c['id'], 'rec_id' => $c['rec_id'], 'from_id' => $c['from_id'], 'text' => $c['text'], 'created_at' => iso($c['created_at'])]);

    case $M === 'DELETE' && preg_match('#^comments/([0-9a-f-]{36})$#', $path, $m):
      $u = need_user();
      q('DELETE FROM comments WHERE id = ? AND from_id = ?', [$m[1], $u['id']]);
      out(['ok' => true]);

    /* ---------- Catalogue ---------- */
    case $M === 'GET' && $path === 'search':
      $u = need_user(); throttle('cat|' . $u['id'], 900, 600);
      $r = catalog_search((string) ($_GET['type'] ?? 'f'), mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 100),
        max(1, min(50, (int) ($_GET['page'] ?? 1))), max(1, min(40, (int) ($_GET['limit'] ?? 20))));
      header('Cache-Control: private, max-age=600');
      out($r);

    case $M === 'GET' && $path === 'discover':
      $u = need_user(); throttle('cat|' . $u['id'], 900, 600);
      out(catalog_discover((string) ($_GET['type'] ?? ''), (int) ($_GET['page'] ?? 1), max(1, min(20, (int) ($_GET['limit'] ?? 12)))));

    case $M === 'GET' && $path === 'work':
      $u = need_user(); throttle('cat|' . $u['id'], 900, 600);
      $r = catalog_work((string) ($_GET['id'] ?? ''));
      header('Cache-Control: private, max-age=86400');
      out($r);

    default:
      fail(404, 'not_found');
  }
} catch (HttpError $e) {
  if (db_in_tx()) db()->rollBack();
  out(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
  if (db_in_tx()) db()->rollBack();
  error_log('[sharefs] ' . $e);
  out(['error' => 'server_error'], 500);
}
function db_in_tx(): bool { try { return db()->inTransaction(); } catch (Throwable $e) { return false; } }
