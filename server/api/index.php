<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
require __DIR__ . '/catalog.php';

cors();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$M = $_SERVER['REQUEST_METHOD'];
$path = trim((string) preg_replace('#^.*?/api(/|$)#', '', (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)), '/');

const EMAIL_RE = '/^[^\s@]+@[^\s@]+\.[^\s@]+$/';

function mates(string $uid): array {
  return q('SELECT DISTINCT b.user_id FROM circle_members a JOIN circle_members b ON a.circle_id = b.circle_id WHERE a.user_id = ?', [$uid])->fetchAll(PDO::FETCH_COLUMN);
}
function rec_out(array $r): array {
  return ['id' => $r['id'], 'from_id' => $r['from_id'], 'to_ids' => $r['to_ids'] ? explode(',', $r['to_ids']) : [],
    'work' => json_decode($r['work']), 'note' => $r['note'], 'created_at' => iso($r['created_at'])];
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
      if (strlen($pass) < 8) fail(400, 'weak_password');
      throttle('signup|' . client_ip(), 10, 3600);
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

    case $M === 'POST' && $path === 'auth/forgot':
      $email = strtolower(trim((string) (body()['email'] ?? '')));
      throttle('forgot|' . client_ip(), 5, 3600);
      if (q('SELECT 1 FROM users WHERE email = ?', [$email])->fetch()) {
        $code = (string) random_int(100000, 999999);
        q('REPLACE INTO resets (email, code_hash, exp, tries) VALUES (?, ?, ?, 0)', [$email, hash('sha256', $email . '|' . $code), time() + 900]);
        $from = cfg('mail_from', 'no-reply@' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
        @mail($email, mb_encode_mimeheader('Ton code Sharefs', 'UTF-8'),
          "Ton code pour choisir un nouveau mot de passe : $code\n\nIl expire dans 15 minutes. Si tu n'as rien demandé, ignore cet e-mail.",
          "From: Sharefs <$from>\r\nContent-Type: text/plain; charset=UTF-8");
      }
      out(['ok' => true]);

    case $M === 'POST' && $path === 'auth/reset':
      $b = body(); $email = strtolower(trim((string) ($b['email'] ?? ''))); $pass = (string) ($b['password'] ?? '');
      if (strlen($pass) < 8) fail(400, 'weak_password');
      $r = q('SELECT * FROM resets WHERE email = ?', [$email])->fetch();
      if (!$r || $r['exp'] < time() || $r['tries'] >= 5) fail(400, 'bad_code');
      if (!hash_equals($r['code_hash'], hash('sha256', $email . '|' . trim((string) ($b['code'] ?? ''))))) {
        q('UPDATE resets SET tries = tries + 1 WHERE email = ?', [$email]); fail(400, 'bad_code');
      }
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
        $json = enc($o->data);
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
      out(['me' => user_out($u), 'members' => $members, 'circles' => $circles, 'recs' => array_map('rec_out', $recs)]);

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
      $work = $b['work'] ?? null;
      if (!is_array($work) || empty($work['id']) || empty($work['ti'])) fail(400, 'bad_work');
      $to = array_values(array_unique(array_filter(array_map('strval', (array) ($b['to_ids'] ?? [])))));
      if (count($to) > 50 || array_diff($to, mates($u['id']))) fail(400, 'bad_recipients');
      $note = mb_substr(trim((string) ($b['note'] ?? '')), 0, 280) ?: null;
      $id = uuid();
      db()->beginTransaction();
      q('INSERT INTO recs (id, from_id, work, note) VALUES (?, ?, ?, ?)', [$id, $u['id'], enc(body_obj()->work), $note]);
      foreach ($to as $t) q('INSERT INTO rec_targets (rec_id, user_id) VALUES (?, ?)', [$id, $t]);
      db()->commit();
      $r = q('SELECT r.*, (SELECT GROUP_CONCAT(t.user_id) FROM rec_targets t WHERE t.rec_id = r.id) AS to_ids FROM recs r WHERE id = ?', [$id])->fetch();
      out(rec_out($r));

    case $M === 'DELETE' && preg_match('#^recs/([0-9a-f-]{36})$#', $path, $m):
      $u = need_user();
      q('DELETE FROM recs WHERE id = ? AND from_id = ?', [$m[1], $u['id']]);
      out(['ok' => true]);

    /* ---------- Catalogue ---------- */
    case $M === 'GET' && $path === 'search':
      $r = catalog_search((string) ($_GET['type'] ?? 'f'), mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 100),
        max(1, min(50, (int) ($_GET['page'] ?? 1))), max(1, min(40, (int) ($_GET['limit'] ?? 20))));
      header('Cache-Control: public, max-age=600');
      out($r);

    case $M === 'GET' && $path === 'work':
      $r = catalog_work((string) ($_GET['id'] ?? ''));
      header('Cache-Control: public, max-age=86400');
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
