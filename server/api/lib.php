<?php
declare(strict_types=1);

/* ---------- Dossier privé (hors du dossier public) : configuration et journaux ---------- */
define('PRIVATE_DIR', dirname(__DIR__, 2) . '/app-private');
ini_set('display_errors', '0');
ini_set('log_errors', '1');
if (is_dir(PRIVATE_DIR) && (is_dir(PRIVATE_DIR . '/logs') || @mkdir(PRIVATE_DIR . '/logs', 0700, true))) {
  ini_set('error_log', PRIVATE_DIR . '/logs/php-error.log');
}

function cfg(string $k, $d = null) {
  static $c = null;
  if ($c === null) {
    // Priorité au fichier hors du dossier public ; l'ancien emplacement reste accepté
    $file = is_file(PRIVATE_DIR . '/config.php') ? PRIVATE_DIR . '/config.php' : __DIR__ . '/config.php';
    $c = is_file($file) ? require $file : [];
  }
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
// Seuls le site et l'app mobile peuvent appeler l'API depuis un navigateur
const DEFAULT_ORIGINS = ['https://sharefs.gaethan-boyer.fr', 'https://panenka.gaethan-boyer.fr', 'https://sharefs.vercel.app',
  'capacitor://localhost', 'https://localhost', 'http://localhost'];
function cors(): void {
  header('X-Content-Type-Options: nosniff');
  header('Cache-Control: no-store');
  header('Vary: Origin');
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin !== '' && in_array($origin, (array) cfg('cors_origins', DEFAULT_ORIGINS), true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Sharefs-Token');
    header('Access-Control-Max-Age: 86400');
  }
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
  $last = strtotime($u['last_used'] . ' UTC');
  // Session expirée après 90 jours sans activité
  if ($last < time() - 90 * 86400) { q('DELETE FROM sessions WHERE token_hash = ?', [$h]); return null; }
  if ($last < time() - 3600) q('UPDATE sessions SET last_used = UTC_TIMESTAMP() WHERE token_hash = ?', [$h]);
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
function cache_del(string $k): void { q('DELETE FROM cache WHERE k = ?', [hash('sha256', $k)]); }
function cache_set(string $k, $v, int $ttl): void {
  q('REPLACE INTO cache (k, v, exp) VALUES (?, ?, ?)', [hash('sha256', $k), json_encode($v, JSON_UNESCAPED_UNICODE), time() + $ttl]);
  if (random_int(1, 200) === 1) q('DELETE FROM cache WHERE exp < ?', [time()]);
}

/* ---------- Mise à niveau automatique du schéma (défis, commentaires) ---------- */
function ensure_schema(): void {
  static $done = false;
  if ($done) return;
  $done = true;
  $flag = __DIR__ . '/.schema-v4';
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
  db()->exec("CREATE TABLE IF NOT EXISTS fetishes (
    user_id CHAR(36) NOT NULL, season VARCHAR(16) NOT NULL, work TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, season), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  db()->exec("CREATE TABLE IF NOT EXISTS fetish_guesses (
    id CHAR(36) PRIMARY KEY, guesser_id CHAR(36) NOT NULL, target_id CHAR(36) NOT NULL, season VARCHAR(16) NOT NULL, day DATE NOT NULL,
    work TEXT NOT NULL, correct TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY one_per_day (guesser_id, target_id, day), INDEX (target_id, season), INDEX (guesser_id, season),
    FOREIGN KEY (guesser_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  db()->exec("CREATE TABLE IF NOT EXISTS fetish_options (
    guesser_id CHAR(36) NOT NULL, target_id CHAR(36) NOT NULL, season VARCHAR(16) NOT NULL, options TEXT NOT NULL, day DATE NOT NULL,
    PRIMARY KEY (guesser_id, target_id, season),
    FOREIGN KEY (guesser_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  @file_put_contents($flag, date('c'));
}

/* ---------- Mots de passe ---------- */
function check_password(string $pass): void {
  if (mb_strlen($pass) < 10) fail(400, 'weak_password');
  // Mot de passe déjà fuité ? (Have I Been Pwned, k-anonymat : seuls 5 caractères de l'empreinte quittent le serveur)
  $sha = strtoupper(sha1($pass));
  $ch = curl_init('https://api.pwnedpasswords.com/range/' . substr($sha, 0, 5));
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3, CURLOPT_CONNECTTIMEOUT => 2,
    CURLOPT_HTTPHEADER => ['Add-Padding: true'], CURLOPT_USERAGENT => 'Sharefs/1.0']);
  $res = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  if ($res === false || $code !== 200) return; // service indisponible : on n'empêche pas l'inscription
  foreach (explode("\n", (string) $res) as $line) {
    [$suffix, $count] = array_pad(explode(':', trim($line)), 2, '0');
    if ($suffix === substr($sha, 5) && (int) $count > 0) fail(400, 'pwned_password');
  }
}

/* ---------- Validation des données envoyées par l'app ---------- */
const IMG_HOSTS = ['image.tmdb.org', 'images.igdb.com', 'books.google.com', 'books.googleusercontent.com', 'covers.openlibrary.org', 'cf.geekdo-images.com', 'coverartarchive.org', 'archive.org', 'dzcdn.net'];
function clean_str($v, int $max): string {
  return mb_substr(trim((string) preg_replace('/[\x00-\x1F\x7F]/u', '', (string) $v)), 0, $max);
}
function clean_id($v): ?string {
  $v = (string) $v;
  return preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$/', $v) ? $v : null;
}
function clean_img($v): string {
  $v = (string) $v;
  $p = parse_url($v);
  if (!$p || ($p['scheme'] ?? '') !== 'https') return '';
  $h = strtolower($p['host'] ?? '');
  foreach (IMG_HOSTS as $ok) if ($h === $ok || str_ends_with($h, '.' . $ok)) return mb_substr($v, 0, 500);
  return '';
}
function clean_work($w): ?array {
  $w = (array) $w;
  $id = clean_id($w['id'] ?? ''); $t = (string) ($w['t'] ?? ''); $ti = clean_str($w['ti'] ?? '', 200);
  if (!$id || !in_array($t, ['f', 's', 'l', 'j', 'b', 'm'], true) || $ti === '') return null;
  $o = ['id' => $id, 't' => $t, 'ti' => $ti];
  if (isset($w['y']) && is_numeric($w['y'])) $o['y'] = (int) $w['y'];
  if (!empty($w['c'])) $o['c'] = clean_str($w['c'], 120);
  if (!empty($w['img']) && ($img = clean_img($w['img'])) !== '') $o['img'] = $img;
  if (!empty($w['g']) && is_array($w['g'])) $o['g'] = array_slice(array_values(array_filter(array_map(fn($g) => clean_str($g, 40), $w['g']))), 0, 3);
  if (isset($w['d']) && is_numeric($w['d'])) $o['d'] = (int) $w['d'];
  if (!empty($w['p'])) $o['p'] = clean_str($w['p'], 3);
  return $o;
}
function clean_map($m, bool $timestamps): object {
  $out = [];
  foreach ((array) $m as $k => $v) {
    if (!clean_id($k) || !is_numeric($v)) continue;
    $v = (int) $v;
    if ($timestamps ? $v < 0 : ($v < 1 || $v > 5)) continue;
    $out[$k] = $v;
    if (count($out) >= 5000) break;
  }
  return (object) $out;
}
function clean_data(object $d): object {
  $works = [];
  foreach ((array) ($d->works ?? []) as $k => $w) {
    $cw = clean_work($w);
    if ($cw && $cw['id'] === (string) $k) $works[$k] = $cw;
    if (count($works) >= 5000) break;
  }
  return (object) ['done' => clean_map($d->done ?? [], true), 'want' => clean_map($d->want ?? [], true),
    'rate' => clean_map($d->rate ?? [], false), 'works' => (object) $works,
    'eggs' => clean_map($d->eggs ?? [], true)];
}

/* ---------- Œuvres fétiches : saisons et jours à l'heure française ---------- */
function paris_now(): DateTimeImmutable { return new DateTimeImmutable('now', new DateTimeZone('Europe/Paris')); }
function current_season(): array {
  $d = paris_now(); $y = (int) $d->format('Y'); $md = (int) $d->format('md');
  if ($md >= 320 && $md <= 620) return ["$y-printemps", 'printemps', "$y-06-20"];
  if ($md >= 621 && $md <= 922) return ["$y-ete", 'été', "$y-09-22"];
  if ($md >= 923 && $md <= 1220) return ["$y-automne", 'automne', "$y-12-20"];
  if ($md >= 1221) return ["$y-hiver", 'hiver', ($y + 1) . '-03-19'];
  return [($y - 1) . '-hiver', 'hiver', "$y-03-19"];
}
function paris_day(): string { return paris_now()->format('Y-m-d'); }
function norm_title(string $s): string {
  $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
  return trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower($t === false ? $s : $t)));
}
function same_work(array $a, array $b): bool {
  if (($a['id'] ?? '') === ($b['id'] ?? '')) return true;
  return ($a['t'] ?? '') === ($b['t'] ?? '') && norm_title($a['ti'] ?? '') !== '' && norm_title($a['ti'] ?? '') === norm_title($b['ti'] ?? '');
}

/* ---------- Envoi d'e-mails : SMTP authentifié si configuré, sinon mail() avec expéditeur d'enveloppe ---------- */
function send_mail(string $to, string $subject, string $text): bool {
  $from = (string) cfg('mail_from', 'no-reply@' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
  $domain = substr((string) strrchr($from, '@'), 1) ?: 'localhost';
  $headers = [
    'From' => mb_encode_mimeheader((string) cfg('mail_name', 'Sharefs'), 'UTF-8') . " <$from>",
    'Reply-To' => $from, 'MIME-Version' => '1.0', 'Content-Type' => 'text/plain; charset=UTF-8', 'Content-Transfer-Encoding' => '8bit',
    'Date' => date(DATE_RFC2822), 'Message-ID' => '<' . bin2hex(random_bytes(12)) . '@' . $domain . '>',
  ];
  $text = str_replace("\n", "\r\n", str_replace("\r\n", "\n", $text));
  if (cfg('smtp_host')) return smtp_send($to, $subject, $text, $headers, $from);
  $h = '';
  foreach ($headers as $k => $v) $h .= "$k: $v\r\n";
  $ok = mail($to, mb_encode_mimeheader($subject, 'UTF-8'), $text, rtrim($h), '-f' . $from);
  if (!$ok) error_log('[sharefs] mail() a échoué pour ' . $to);
  return $ok;
}
function smtp_send(string $to, string $subject, string $text, array $headers, string $from): bool {
  $host = (string) cfg('smtp_host'); $port = (int) cfg('smtp_port', 465);
  $fp = @stream_socket_client(($port === 465 ? 'ssl://' : 'tcp://') . $host . ':' . $port, $errno, $errstr, 12);
  if (!$fp) { error_log("[sharefs] SMTP : connexion impossible à $host:$port ($errstr)"); return false; }
  stream_set_timeout($fp, 12);
  $read = function () use ($fp): string { $r = ''; while (($l = fgets($fp, 515)) !== false) { $r .= $l; if (strlen($l) < 4 || $l[3] === ' ') break; } return $r; };
  $cmd = function (?string $c, int $expect) use ($fp, $read): string {
    if ($c !== null) fwrite($fp, $c . "\r\n");
    $r = $read();
    if ((int) substr($r, 0, 3) !== $expect) throw new RuntimeException(trim($r) ?: 'pas de réponse');
    return $r;
  };
  try {
    $cmd(null, 220);
    $me = gethostname() ?: 'localhost';
    $cmd("EHLO $me", 250);
    if ($port === 587) { $cmd('STARTTLS', 220); stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT); $cmd("EHLO $me", 250); }
    $cmd('AUTH LOGIN', 334); $cmd(base64_encode((string) cfg('smtp_user', $from)), 334); $cmd(base64_encode((string) cfg('smtp_pass', '')), 235);
    $cmd("MAIL FROM:<$from>", 250); $cmd("RCPT TO:<$to>", 250); $cmd('DATA', 354);
    $msg = "To: <$to>\r\nSubject: " . mb_encode_mimeheader($subject, 'UTF-8') . "\r\n";
    foreach ($headers as $k => $v) $msg .= "$k: $v\r\n";
    $msg .= "\r\n" . preg_replace('/^\./m', '..', $text);
    $cmd($msg . "\r\n.", 250);
    fwrite($fp, "QUIT\r\n");
  } catch (Throwable $e) {
    error_log('[sharefs] SMTP : ' . $e->getMessage());
    fclose($fp);
    return false;
  }
  fclose($fp);
  return true;
}

/* ---------- Passage à 5 raretés : les anciennes notes 2, 3, 4 deviennent 3, 4, 5 (une seule fois) ---------- */
function migrate_rarities(): void {
  $flag = __DIR__ . '/.rarities-v5';
  if (is_file($flag)) return;
  foreach (q('SELECT id, data FROM users WHERE data IS NOT NULL')->fetchAll() as $u) {
    $d = json_decode((string) $u['data'], true);
    if (!is_array($d) || empty($d['rate']) || !is_array($d['rate'])) continue;
    foreach ($d['rate'] as $k => $v) if (in_array((int) $v, [2, 3, 4], true)) $d['rate'][$k] = (int) $v + 1;
    q('UPDATE users SET data = ? WHERE id = ?', [json_encode($d, JSON_UNESCAPED_UNICODE), $u['id']]);
  }
  @file_put_contents($flag, date('c'));
}

/* ---------- Œuvres fétiches : 5 propositions par ami, dont la bonne ---------- */
function fetish_options(string $me, string $target, string $season, array $answer, array $mates): array {
  $row = q('SELECT options, day FROM fetish_options WHERE guesser_id = ? AND target_id = ? AND season = ?', [$me, $target, $season])->fetch();
  $today = paris_day();
  $opts = $row ? (json_decode($row['options'], true) ?: []) : [];
  $used = array_map(fn($w) => $w['id'], $opts);
  foreach (q('SELECT work FROM fetish_guesses WHERE guesser_id = ? AND target_id = ? AND season = ?', [$me, $target, $season])->fetchAll() as $g) $used[] = json_decode($g['work'], true)['id'] ?? '';
  // Œuvres plausibles : celles des collections du cercle, en priorité celles de l'ami
  $pool = [];
  foreach (array_merge([$target], $mates) as $uid) {
    $d = json_decode((string) q('SELECT data FROM users WHERE id = ?', [$uid])->fetchColumn(), true);
    foreach (($d['works'] ?? []) as $w) if (is_array($w) && ($cw = clean_work($w)) && !same_work($cw, $answer) && !in_array($cw['id'], $used, true)) $pool[$cw['id']] = $cw;
  }
  $pool = array_values($pool); shuffle($pool);
  $decoy = function () use (&$pool, &$used) { $w = array_shift($pool); if ($w) $used[] = $w['id']; return $w; };
  if (!$opts) {
    $opts = [$answer];
    while (count($opts) < 5 && ($w = $decoy())) $opts[] = $w;
    shuffle($opts);
  } elseif ($row['day'] !== $today) {
    // Le lendemain d'un essai raté : seule l'œuvre choisie à tort est remplacée, à la même place
    $last = q('SELECT work FROM fetish_guesses WHERE guesser_id = ? AND target_id = ? AND season = ? AND correct = 0 ORDER BY created_at DESC LIMIT 1', [$me, $target, $season])->fetchColumn();
    $lastId = $last ? (json_decode($last, true)['id'] ?? '') : '';
    foreach ($opts as $i => $w) if (($w['id'] ?? '') === $lastId && ($n = $decoy())) $opts[$i] = $n;
  }
  q('REPLACE INTO fetish_options (guesser_id, target_id, season, options, day) VALUES (?, ?, ?, ?, ?)', [$me, $target, $season, enc($opts), $today]);
  return $opts;
}

