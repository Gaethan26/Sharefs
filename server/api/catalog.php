<?php
declare(strict_types=1);
// Catalogue : TMDB (films, séries), Google Books (livres), IGDB (jeux).

const GM = [28=>'Action',12=>'Aventure',16=>'Animation',35=>'Comédie',80=>'Policier',99=>'Documentaire',18=>'Drame',10751=>'Famille',14=>'Fantastique',36=>'Historique',27=>'Horreur',10402=>'Musical',9648=>'Mystère',10749=>'Romance',878=>'SF',10770=>'Téléfilm',53=>'Thriller',10752=>'Guerre',37=>'Western',10759=>'Action',10762=>'Jeunesse',10763=>'Info',10764=>'Téléréalité',10765=>'SF',10766=>'Feuilleton',10767=>'Talk-show',10768=>'Guerre'];
const GG = ['Adventure'=>'Aventure','Role-playing (RPG)'=>'RPG','Shooter'=>'Tir','Platform'=>'Plateforme','Puzzle'=>'Réflexion','Strategy'=>'Stratégie','Simulator'=>'Simulation','Sport'=>'Sport','Racing'=>'Course','Fighting'=>'Combat','Indie'=>'Indé','Arcade'=>'Arcade','Music'=>'Musique','Tactical'=>'Tactique',"Hack and slash/Beat 'em up"=>'Beat’em all','Point-and-click'=>'Point & click','Visual Novel'=>'Visual novel','Card & Board Game'=>'Cartes et plateau','MOBA'=>'MOBA','Real Time Strategy (RTS)'=>'Stratégie','Turn-based strategy (TBS)'=>'Tour par tour','Quiz/Trivia'=>'Quiz','Pinball'=>'Flipper'];

function http_json(string $url, array $headers = [], ?string $post = null): array {
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers), CURLOPT_USERAGENT => 'Sharefs/1.0']);
  if ($post !== null) { curl_setopt($ch, CURLOPT_POST, true); curl_setopt($ch, CURLOPT_POSTFIELDS, $post); }
  $res = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  if ($res === false || $code >= 400) fail(502, 'provider_' . $code);
  $j = json_decode($res, true);
  return is_array($j) ? $j : [];
}
function clean(array $o): array { return array_filter($o, fn($v) => $v !== '' && $v !== null && $v !== []); }
function yr($s): ?int { $y = (int) substr((string) $s, 0, 4); return $y > 1000 ? $y : null; }
function need_key(string ...$k): void { foreach ($k as $x) if (!cfg($x)) fail(503, 'missing_key:' . $x); }

/* TMDB */
function tmdb(string $path, array $p = []): array {
  need_key('tmdb_token');
  $tok = cfg('tmdb_token'); $h = [];
  $p['language'] = 'fr-FR';
  if (str_starts_with($tok, 'eyJ')) $h[] = 'Authorization: Bearer ' . $tok; else $p['api_key'] = $tok;
  return http_json('https://api.themoviedb.org/3' . $path . '?' . http_build_query($p), $h);
}
function from_tmdb(array $x, string $k): array {
  $g = array_values(array_unique(array_filter(array_map(fn($i) => GM[$i] ?? null, $x['genre_ids'] ?? []))));
  return clean(['id' => "tmdb-$k-{$x['id']}", 't' => $k === 'movie' ? 'f' : 's', 'ti' => $x['title'] ?? $x['name'] ?? '',
    'y' => yr($x['release_date'] ?? $x['first_air_date'] ?? ''),
    'img' => !empty($x['poster_path']) ? 'https://image.tmdb.org/t/p/w342' . $x['poster_path'] : (!empty($x['backdrop_path']) ? 'https://image.tmdb.org/t/p/w500' . $x['backdrop_path'] : ''),
    'g' => array_slice($g, 0, 3)]);
}
function search_tmdb(string $k, string $q, int $page, int $lim): array {
  $d = $q !== '' ? tmdb("/search/$k", ['query' => $q, 'page' => $page, 'include_adult' => 'false']) : tmdb("/trending/$k/week", ['page' => $page]);
  $items = array_values(array_filter($d['results'] ?? [], fn($x) => !empty($x['poster_path']) || !empty($x['backdrop_path']) || ($x['vote_count'] ?? 0) > 0));
  return ['items' => array_map(fn($x) => from_tmdb($x, $k), array_slice($items, 0, $lim)), 'more' => ($d['page'] ?? 1) < ($d['total_pages'] ?? 1)];
}
function work_tmdb(string $k, string $id): array {
  $x = tmdb("/$k/$id", ['append_to_response' => 'credits,images', 'include_image_language' => 'fr,en,null']);
  $w = from_tmdb(array_merge($x, ['genre_ids' => []]), $k);
  $cr = $k === 'movie' ? array_column(array_filter($x['credits']['crew'] ?? [], fn($c) => ($c['job'] ?? '') === 'Director'), 'name') : array_column($x['created_by'] ?? [], 'name');
  return clean(array_merge($w, [
    'g' => array_slice(array_values(array_unique(array_map(fn($g) => GM[$g['id']] ?? $g['name'], $x['genres'] ?? []))), 0, 3),
    'c' => implode(', ', array_slice($cr, 0, 2)) ?: ($x['networks'][0]['name'] ?? ''),
    'd' => $k === 'movie' ? ($x['runtime'] ?? null) : ($x['number_of_seasons'] ?? null),
    'p' => $x['production_countries'][0]['iso_3166_1'] ?? ($x['origin_country'][0] ?? ''),
    'syn' => mb_substr($x['overview'] ?? '', 0, 800),
    'cast' => array_slice(array_column($x['credits']['cast'] ?? [], 'name'), 0, 4),
    'img' => !empty($x['poster_path']) ? 'https://image.tmdb.org/t/p/w500' . $x['poster_path'] : ($w['img'] ?? ''),
    'imgs' => array_values(array_unique(array_merge(
      array_map(fn($i) => 'https://image.tmdb.org/t/p/w780' . $i['file_path'], array_slice($x['images']['backdrops'] ?? [], 0, 10)),
      array_map(fn($i) => 'https://image.tmdb.org/t/p/w500' . $i['file_path'], array_slice($x['images']['posters'] ?? [], 0, 4)))))]));
}

/* Google Books */
function gbooks(string $path, array $p = []): array {
  if (cfg('google_books_key')) $p['key'] = cfg('google_books_key');
  return http_json('https://www.googleapis.com/books/v1' . $path . ($p ? '?' . http_build_query($p) : ''));
}
function isbn_of(array $v): string {
  $ids = array_column($v['industryIdentifiers'] ?? [], 'identifier', 'type');
  return $ids['ISBN_13'] ?? $ids['ISBN_10'] ?? '';
}
function gb_img(string $u): string { return str_replace(['http:', '&edge=curl'], ['https:', ''], $u); }
function from_book(array $x): array {
  $v = $x['volumeInfo'] ?? []; $im = $v['imageLinks'] ?? [];
  $img = gb_img($im['thumbnail'] ?? $im['smallThumbnail'] ?? '');
  if ($img === '' && ($isbn = isbn_of($v)) !== '') $img = "https://covers.openlibrary.org/b/isbn/$isbn-L.jpg?default=false";
  return clean(['id' => 'gb-' . $x['id'], 't' => 'l', 'ti' => $v['title'] ?? '', 'y' => yr($v['publishedDate'] ?? ''),
    'c' => implode(', ', array_slice($v['authors'] ?? [], 0, 2)), 'img' => $img,
    'g' => array_slice(array_map(fn($c) => trim(explode('/', $c)[0]), $v['categories'] ?? []), 0, 2), 'd' => $v['pageCount'] ?? null]);
}
function search_books(string $q, int $page, int $lim): array {
  $p = ['q' => $q !== '' ? $q : 'subject:fiction', 'maxResults' => min(40, $lim), 'startIndex' => ($page - 1) * $lim, 'printType' => 'books', 'orderBy' => $q !== '' ? 'relevance' : 'newest'];
  $d = gbooks('/volumes', $p + ['langRestrict' => 'fr']);
  if (empty($d['items']) && $q !== '') $d = gbooks('/volumes', $p);
  $items = array_values(array_filter(array_map('from_book', $d['items'] ?? []), fn($w) => !empty($w['ti'])));
  return ['items' => $items, 'more' => $p['startIndex'] + $lim < ($d['totalItems'] ?? 0)];
}
function work_book(string $id): array {
  $x = gbooks('/volumes/' . rawurlencode($id));
  $syn = trim(preg_replace('/\s+/', ' ', strip_tags($x['volumeInfo']['description'] ?? '')));
  $v = $x['volumeInfo'] ?? []; $im = $v['imageLinks'] ?? []; $isbn = isbn_of($v);
  $big = gb_img($im['extraLarge'] ?? $im['large'] ?? $im['medium'] ?? '');
  $imgs = array_values(array_unique(array_filter([$big, gb_img($im['thumbnail'] ?? ''), $isbn ? "https://covers.openlibrary.org/b/isbn/$isbn-L.jpg?default=false" : ''])));
  $w = from_book($x);
  return clean(array_merge($w, ['syn' => mb_substr($syn, 0, 800), 'pub' => $v['publisher'] ?? '', 'img' => $big ?: ($w['img'] ?? ''), 'imgs' => $imgs]));
}

/* IGDB */
const GF = 'name,first_release_date,cover.image_id,artworks.image_id,screenshots.image_id,genres.name,involved_companies.company.name,involved_companies.developer,total_rating_count';
function igdb_img(string $id, string $size): string { return "https://images.igdb.com/igdb/image/upload/$size/$id.jpg"; }
function twitch_token(): string {
  need_key('twitch_client_id', 'twitch_client_secret');
  if ($t = cache_get('twitch_token')) return $t;
  $d = http_json('https://id.twitch.tv/oauth2/token?' . http_build_query(['client_id' => cfg('twitch_client_id'), 'client_secret' => cfg('twitch_client_secret'), 'grant_type' => 'client_credentials']), [], '');
  cache_set('twitch_token', $d['access_token'], max(60, (int) $d['expires_in'] - 600));
  return $d['access_token'];
}
function igdb(string $body): array {
  return http_json('https://api.igdb.com/v4/games', ['Client-ID: ' . cfg('twitch_client_id'), 'Authorization: Bearer ' . twitch_token(), 'Content-Type: text/plain'], $body);
}
function from_game(array $x): array {
  $ic = $x['involved_companies'] ?? []; $dev = null;
  foreach ($ic as $c) if (!empty($c['developer'])) { $dev = $c; break; }
  $dev = $dev ?? ($ic[0] ?? null);
  return clean(['id' => 'igdb-' . $x['id'], 't' => 'j', 'ti' => $x['name'] ?? '', 'y' => !empty($x['first_release_date']) ? (int) gmdate('Y', $x['first_release_date']) : null,
    'c' => $dev['company']['name'] ?? '',
    'img' => !empty($x['cover']['image_id']) ? igdb_img($x['cover']['image_id'], 't_cover_big')
           : (!empty($x['artworks'][0]['image_id']) ? igdb_img($x['artworks'][0]['image_id'], 't_screenshot_med')
           : (!empty($x['screenshots'][0]['image_id']) ? igdb_img($x['screenshots'][0]['image_id'], 't_screenshot_med') : '')),
    'g' => array_slice(array_values(array_unique(array_map(fn($g) => GG[$g['name']] ?? $g['name'], $x['genres'] ?? []))), 0, 3)]);
}
function search_games(string $q, int $page, int $lim): array {
  $off = ($page - 1) * $lim; $s = str_replace(['"', '\\', ';'], ' ', $q); $n = $lim + 1;
  $body = $q !== '' ? "search \"$s\"; fields " . GF . "; limit $n; offset $off;" : 'fields ' . GF . "; where total_rating_count > 300; sort total_rating_count desc; limit $n; offset $off;";
  $d = igdb($body);
  return ['items' => array_map('from_game', array_slice($d, 0, $lim)), 'more' => count($d) > $lim];
}
function work_game(string $id): array {
  $d = igdb('fields ' . GF . ',summary,platforms.abbreviation; where id = ' . (int) $id . ';');
  if (!$d) fail(404, 'not_found');
  $x = $d[0];
  $imgs = array_map(fn($i) => igdb_img($i['image_id'], 't_screenshot_big'), array_slice(array_merge($x['artworks'] ?? [], $x['screenshots'] ?? []), 0, 12));
  $w = from_game($x);
  if (!empty($x['cover']['image_id'])) $w['img'] = igdb_img($x['cover']['image_id'], 't_cover_big_2x');
  return clean(array_merge($w, ['syn' => mb_substr($x['summary'] ?? '', 0, 800), 'imgs' => $imgs, 'plat' => array_slice(array_values(array_filter(array_column($x['platforms'] ?? [], 'abbreviation'))), 0, 6)]));
}

function catalog_search(string $type, string $q, int $page, int $lim): array {
  $key = "s2|$type|$q|$page|$lim";
  if (($c = cache_get($key)) !== null) return $c;
  $r = match ($type) {
    'f' => search_tmdb('movie', $q, $page, $lim), 's' => search_tmdb('tv', $q, $page, $lim),
    'l' => search_books($q, $page, $lim), 'j' => search_games($q, $page, $lim), default => fail(400, 'bad_type') };
  cache_set($key, $r, 3600);
  return $r;
}
function catalog_work(string $id): array {
  if (($c = cache_get("w2|$id")) !== null) return $c;
  if (preg_match('/^tmdb-(movie|tv)-(\d+)$/', $id, $m)) $r = work_tmdb($m[1], $m[2]);
  elseif (preg_match('/^gb-([\w-]+)$/', $id, $m)) $r = work_book($m[1]);
  elseif (preg_match('/^igdb-(\d+)$/', $id, $m)) $r = work_game($m[1]);
  else fail(400, 'bad_id');
  cache_set("w2|$id", $r, 7 * 86400);
  return $r;
}
