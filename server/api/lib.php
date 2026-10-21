<?php
declare(strict_types=1);

function cfg(string $k, $d = null) {
  static $c = null;
  if ($c === null) $c = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
  return $c[$k] ?? $d;
}
function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $pdo = new PDO('mysql:host=' . cfg('db_host', 'localhost') . ';dbname=' . cfg('db_name') . ';charset=utf8mb4',
    cfg('db_user'), cfg('db_pass'),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
  $pdo->exec("SET time_zone = '+00:00'");
  return $pdo;
}
function q(string $sql, array $p = []): PDOStatement { $s = db()->prepare($sql); $s->execute($p); return $s; }

class HttpError extends Exception { public int $status; function __construct(int $s, string $m) { parent::__construct($m); $this->status = $s; } }
function fail(int $code, string $msg) { throw new HttpError($code, $msg); }
function out($data, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function raw_body(): string {
  static $raw = null;
  if ($raw === null) { $raw = file_get_contents('php://input') ?: ''; if (strlen($raw) > 600000) fail(413, 'too_large'); }
  return $raw;
}
function body(): array { $j = json_decode(raw_body(), true); return is_array($j) ? $j : []; }
// Lecture en objets : conserve la différence entre {} et [] lors du ré-encodage
function body_obj(): object { $j = json_decode(raw_body()); return is_object($j) ? $j : new stdClass(); }
function enc($v): string { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
function cors(): void {
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, X-Sharefs-Token');
  header('Access-Control-Max-Age: 86400');
}
function uuid(): string {
  $b = random_bytes(16);
  $b[6] = chr((ord($b[6]) & 0x0f) | 0x40); $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
  return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}
function iso(?string $dt): ?string { return $dt ? gmdate('Y-m-d\TH:i:s\Z', strtotime($dt . ' UTC')) : null; }
function client_ip(): string { return substr($_SERVER['REMOTE_ADDR'] ?? '0', 0, 64); }

/* ---------- Limitation des essais ---------- */
function throttle(string $k, int $max, int $window): void {
  $now = time();
  if (random_int(1, 50) === 1) q('DELETE FROM throttle WHERE at < ?', [$now - 86400]);
  $n = (int) q('SELECT COUNT(*) FROM throttle WHERE k = ? AND at > ?', [$k, $now - $window])->fetchColumn();
  if ($n >= $max) fail(429, 'too_many_attempts');
  q('INSERT INTO throttle (k, at) VALUES (?, ?)', [$k, $now]);
}

/* ---------- Sessions ---------- */
function token_in(): string {
  return $_SERVER['HTTP_X_SHAREFS_TOKEN'] ?? '';
}
function new_session(string $uid): string {
  $t = bin2hex(random_bytes(32));
  q('INSERT INTO sessions (token_hash, user_id) VALUES (?, ?)', [hash('sha256', $t), $uid]);
  return $t;
}
function current_user(): ?array {
  $t = token_in();
  if (strlen($t) !== 64) return null;
  $h = hash('sha256', $t);
  $u = q('SELECT u.id, u.email, u.name, u.data, s.last_used FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?', [$h])->fetch();
  if (!$u) return null;
  if (strtotime($u['last_used'] . ' UTC') < time() - 3600) q('UPDATE sessions SET last_used = UTC_TIMESTAMP() WHERE token_hash = ?', [$h]);
  return $u;
}
function need_user(): array { $u = current_user(); if (!$u) fail(401, 'unauthorized'); return $u; }
function user_out(array $u): array {
  return ['id' => $u['id'], 'name' => $u['name'], 'data' => $u['data'] ? json_decode($u['data']) : null];
}

/* ---------- Cache ---------- */
function cache_get(string $k) {
  $r = q('SELECT v FROM cache WHERE k = ? AND exp > ?', [hash('sha256', $k), time()])->fetchColumn();
  return $r === false ? null : json_decode($r, true);
}
function cache_set(string $k, $v, int $ttl): void {
  q('REPLACE INTO cache (k, v, exp) VALUES (?, ?, ?)', [hash('sha256', $k), json_encode($v, JSON_UNESCAPED_UNICODE), time() + $ttl]);
  if (random_int(1, 200) === 1) q('DELETE FROM cache WHERE exp < ?', [time()]);
}

/* ---------- Mise à niveau automatique du schéma (défis, commentaires) ---------- */
function ensure_schema(): void {
  static $done = false;
  if ($done) return;
  $done = true;
  $flag = __DIR__ . '/.schema-v2';
  if (is_file($flag)) return;
  db()->exec("CREATE TABLE IF NOT EXISTS challenges (
    id CHAR(36) PRIMARY KEY, from_id CHAR(36) NOT NULL, to_id CHAR(36) NOT NULL, works TEXT NOT NULL, note VARCHAR(280) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, deadline DATETIME NOT NULL, INDEX (from_id), INDEX (to_id),
    FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  db()->exec("CREATE TABLE IF NOT EXISTS comments (
    id CHAR(36) PRIMARY KEY, rec_id CHAR(36) NOT NULL, from_id CHAR(36) NOT NULL, text VARCHAR(500) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX (rec_id),
    FOREIGN KEY (rec_id) REFERENCES recs(id) ON DELETE CASCADE, FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  @file_put_contents($flag, date('c'));
}

