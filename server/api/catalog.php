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
function clean_char($s): string {
  $s = trim((string) preg_replace('/\s*\((voice|voix|uncredited|non crédité)[^)]*\)/iu', '', (string) $s));
  $s = trim((string) preg_replace('#\s*/.*$#u', '', $s)); // « Lui-même / Narrateur » → premier rôle
  if (mb_strlen($s) < 2 || mb_strlen($s) > 40 || preg_match('/^(himself|herself|lui-même|elle-même|self|narrator|narrateur)$/iu', $s)) return '';
  return $s;
}
function ol_story(string $title, string $author): array {
  if ($title === '') return [];
  try {
    $d = http_json('https://openlibrary.org/search.json?' . http_build_query(['title' => $title, 'author' => $author, 'limit' => 1, 'fields' => 'person,place']));
    $doc = $d['docs'][0] ?? [];
    return ['chars' => array_slice(array_values(array_filter(array_map('clean_char', $doc['person'] ?? []))), 0, 12),
      'places' => array_slice(array_values(array_filter(array_map('clean_char', $doc['place'] ?? []))), 0, 8)];
  } catch (Throwable $e) { return []; }
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
  $x = tmdb("/$k/$id", ['append_to_response' => $k === 'tv' ? 'credits,aggregate_credits,images,season/1' : 'credits,images', 'include_image_language' => 'fr,en,null']);
  // personnages et rôles (acteur → personnage)
  $roles = [];
  if ($k === 'tv') foreach (array_slice($x['aggregate_credits']['cast'] ?? [], 0, 12) as $c) { $ch = $c['roles'][0]['character'] ?? ''; if ($ch !== '') $roles[] = [$c['name'] ?? '', $ch]; }
  foreach (array_slice($x['credits']['cast'] ?? [], 0, 12) as $c) if (!empty($c['character'])) $roles[] = [$c['name'] ?? '', $c['character']];
  $roles = array_values(array_filter(array_map(fn($r) => [$r[0], clean_char($r[1])], $roles), fn($r) => $r[0] !== '' && $r[1] !== ''));
  $seen = []; $roles = array_values(array_filter($roles, function ($r) use (&$seen) { $k2 = mb_strtolower($r[1]); if (isset($seen[$k2])) return false; $seen[$k2] = 1; return true; }));
  $eps = $k === 'tv' ? array_values(array_filter(array_map(fn($e) => trim((string) ($e['name'] ?? '')), $x['season/1']['episodes'] ?? []), fn($n) => $n !== '' && !preg_match('/^(épisode|episode)\s*\d+$/iu', $n))) : [];
  $w = from_tmdb(array_merge($x, ['genre_ids' => []]), $k);
  $cr = $k === 'movie' ? array_column(array_filter($x['credits']['crew'] ?? [], fn($c) => ($c['job'] ?? '') === 'Director'), 'name') : array_column($x['created_by'] ?? [], 'name');
  return clean(array_merge($w, [
    'g' => array_slice(array_values(array_unique(array_map(fn($g) => GM[$g['id']] ?? $g['name'], $x['genres'] ?? []))), 0, 3),
    'c' => implode(', ', array_slice($cr, 0, 2)) ?: ($x['networks'][0]['name'] ?? ''),
    'd' => $k === 'movie' ? ($x['runtime'] ?? null) : ($x['number_of_seasons'] ?? null),
    'p' => $x['production_countries'][0]['iso_3166_1'] ?? ($x['origin_country'][0] ?? ''),
    'syn' => mb_substr($x['overview'] ?? '', 0, 800),
    'cast' => array_slice(array_column($x['credits']['cast'] ?? [], 'name'), 0, 4),
    'roles' => array_slice($roles, 0, 10), 'chars' => array_slice(array_column($roles, 1), 0, 12), 'eps' => array_slice($eps, 0, 12),
    'tag' => trim((string) ($x['tagline'] ?? '')),
    'saga' => trim((string) preg_replace('/\s*[-–]?\s*(saga|collection)$/iu', '', (string) ($x['belongs_to_collection']['name'] ?? ''))),
    'studios' => array_slice(array_column($x['production_companies'] ?? [], 'name'), 0, 3),
    'neps' => $k === 'tv' ? (int) ($x['number_of_episodes'] ?? 0) : 0,
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
function search_google_books(string $q, int $page, int $lim): array {
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
  $story = ol_story((string) ($v['title'] ?? ''), (string) (($v['authors'] ?? [''])[0] ?? ''));
  return clean(array_merge($w, $story, ['syn' => mb_substr($syn, 0, 800), 'pub' => $v['publisher'] ?? '', 'img' => $big ?: ($w['img'] ?? ''), 'imgs' => $imgs]));
}

/* Open Library : sans clé, utilisé quand Google Books ne répond pas (quota partagé sur l'IP de l'hébergeur) */
function from_ol(array $x): array {
  $key = basename((string) ($x['key'] ?? ''));
  return clean(['id' => 'ol-' . $key, 't' => 'l', 'ti' => $x['title'] ?? '', 'y' => !empty($x['first_publish_year']) ? (int) $x['first_publish_year'] : null,
    'c' => implode(', ', array_slice($x['author_name'] ?? [], 0, 2)),
    'img' => !empty($x['cover_i']) ? 'https://covers.openlibrary.org/b/id/' . $x['cover_i'] . '-M.jpg' : '',
    'g' => array_slice($x['subject'] ?? [], 0, 2), 'd' => $x['number_of_pages_median'] ?? null]);
}
function search_ol(string $q, int $page, int $lim): array {
  if ($q === '') {
    $d = http_json('https://openlibrary.org/trending/weekly.json?' . http_build_query(['limit' => $lim, 'page' => $page]));
    $docs = $d['works'] ?? []; $more = count($docs) >= $lim;
  } else {
    $d = http_json('https://openlibrary.org/search.json?' . http_build_query(['q' => $q, 'limit' => $lim, 'page' => $page,
      'fields' => 'key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject']));
    $docs = $d['docs'] ?? []; $more = $page * $lim < ($d['numFound'] ?? 0);
  }
  return ['items' => array_values(array_filter(array_map('from_ol', $docs), fn($w) => !empty($w['ti']) && $w['id'] !== 'ol-')), 'more' => $more];
}
function work_ol(string $key): array {
  $x = http_json("https://openlibrary.org/works/$key.json");
  $desc = $x['description'] ?? '';
  if (is_array($desc)) $desc = $desc['value'] ?? '';
  $authors = [];
  foreach (array_slice($x['authors'] ?? [], 0, 2) as $a) {
    $ak = $a['author']['key'] ?? '';
    if ($ak !== '' && preg_match('#^/authors/OL\d+A$#', $ak)) {
      try { $ad = http_json("https://openlibrary.org$ak.json"); if (!empty($ad['name'])) $authors[] = $ad['name']; } catch (Throwable $e) {}
    }
  }
  $covers = array_values(array_filter($x['covers'] ?? [], fn($c) => (int) $c > 0));
  return clean(['id' => "ol-$key", 't' => 'l', 'ti' => $x['title'] ?? '', 'y' => yr($x['first_publish_date'] ?? ''), 'c' => implode(', ', $authors),
    'img' => $covers ? "https://covers.openlibrary.org/b/id/{$covers[0]}-L.jpg" : '',
    'imgs' => array_map(fn($c) => "https://covers.openlibrary.org/b/id/$c-L.jpg", array_slice($covers, 0, 6)),
    'g' => array_slice($x['subjects'] ?? [], 0, 3),
    'chars' => array_slice(array_values(array_filter(array_map('clean_char', $x['subject_people'] ?? []))), 0, 12),
    'places' => array_slice(array_values(array_filter(array_map('clean_char', $x['subject_places'] ?? []))), 0, 8),
    'syn' => mb_substr(trim((string) preg_replace('/\s+/', ' ', strip_tags((string) $desc))), 0, 800)]);
}
function search_books(string $q, int $page, int $lim): array {
  try { $r = search_google_books($q, $page, $lim); if (!empty($r['items'])) return $r; } catch (Throwable $e) { error_log('[sharefs] Google Books : ' . $e->getMessage()); }
  return search_ol($q, $page, $lim);
}

/* IGDB */
const IGDB_FR = ['Action' => 'Action', 'Fantasy' => 'Fantastique', 'Science fiction' => 'Science-fiction', 'Horror' => 'Horreur', 'Thriller' => 'Thriller', 'Survival' => 'Survie',
  'Historical' => 'Historique', 'Stealth' => 'Infiltration', 'Comedy' => 'Comédie', 'Business' => 'Gestion', 'Drama' => 'Drame', 'Non-fiction' => 'Documentaire', 'Sandbox' => 'Bac à sable',
  'Educational' => 'Éducatif', 'Kids' => 'Enfants', 'Open world' => 'Monde ouvert', 'Warfare' => 'Guerre', 'Party' => 'Jeu d’ambiance', 'Mystery' => 'Mystère', 'Romance' => 'Romance',
  'Single player' => 'Solo', 'Multiplayer' => 'Multijoueur', 'Co-operative' => 'Coopération', 'Split screen' => 'Écran partagé', 'Massively Multiplayer Online (MMO)' => 'MMO', 'Battle Royale' => 'Battle royale',
  'First person' => 'Vue à la première personne', 'Third person' => 'Vue à la troisième personne', 'Bird view / Isometric' => 'Vue isométrique', 'Side view' => 'Vue de côté', 'Virtual Reality' => 'Réalité virtuelle'];
const GF = 'name,first_release_date,cover.image_id,artworks.image_id,screenshots.image_id,genres.name,involved_companies.company.name,involved_companies.developer,total_rating_count';
function igdb_img(string $id, string $size): string { return "https://images.igdb.com/igdb/image/upload/$size/$id.jpg"; }
function twitch_token(): string {
  need_key('twitch_client_id', 'twitch_client_secret');
  if ($t = cache_get('twitch_token')) return $t;
  $d = http_json('https://id.twitch.tv/oauth2/token?' . http_build_query(['client_id' => cfg('twitch_client_id'), 'client_secret' => cfg('twitch_client_secret'), 'grant_type' => 'client_credentials']), [], '');
  if (empty($d['access_token'])) { error_log('[sharefs] Twitch : jeton refusé, vérifier twitch_client_id et twitch_client_secret'); fail(502, 'provider_auth'); }
  cache_set('twitch_token', $d['access_token'], max(60, (int) $d['expires_in'] - 600));
  return $d['access_token'];
}
// Requête IGDB ; si le jeton Twitch en cache est refusé (secret régénéré, jeton révoqué), on en redemande un et on réessaie une fois
function igdb(string $body, string $endpoint = 'games'): array {
  for ($try = 0; $try < 2; $try++) {
    $ch = curl_init('https://api.igdb.com/v4/' . $endpoint);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body,
      CURLOPT_HTTPHEADER => ['Accept: application/json', 'Client-ID: ' . cfg('twitch_client_id'), 'Authorization: Bearer ' . twitch_token(), 'Content-Type: text/plain'], CURLOPT_USERAGENT => 'Sharefs/1.0']);
    $res = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if (($code === 401 || $code === 403) && $try === 0) { cache_del('twitch_token'); continue; }
    if ($res === false || $code >= 400) { error_log('[sharefs] IGDB ' . $code . ' ' . substr((string) $res, 0, 200)); fail(502, 'provider_' . $code); }
    $j = json_decode($res, true);
    return is_array($j) ? $j : [];
  }
  return [];
}
function from_game(array $x): array {
  $ic = $x['involved_companies'] ?? []; $dev = null;
  foreach ($ic as $c) {
    if (!empty($c['developer'])) { $dev = $c; break; }
  }
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
  $d = igdb('fields ' . GF . ',summary,storyline,platforms.abbreviation,franchises.name,collection.name,themes.name,game_modes.name,player_perspectives.name; where id = ' . (int) $id . ';');
  $chars = [];
  try { $chars = array_values(array_filter(array_map(fn($c) => clean_char($c['name'] ?? ''), igdb('fields name; where games = (' . (int) $id . '); limit 15;', 'characters')))); } catch (Throwable $e) {}
  if (!$d) fail(404, 'not_found');
  $x = $d[0];
  $imgs = array_map(fn($i) => igdb_img($i['image_id'], 't_screenshot_big'), array_slice(array_merge($x['artworks'] ?? [], $x['screenshots'] ?? []), 0, 12));
  $w = from_game($x);
  if (!empty($x['cover']['image_id'])) $w['img'] = igdb_img($x['cover']['image_id'], 't_cover_big_2x');
  return clean(array_merge($w, ['syn' => mb_substr($x['summary'] ?? '', 0, 800), 'story' => mb_substr($x['storyline'] ?? '', 0, 800), 'chars' => array_slice($chars, 0, 12),
    'saga' => $x['franchises'][0]['name'] ?? ($x['collection']['name'] ?? ''),
    'themes' => array_values(array_filter(array_map(fn($t) => IGDB_FR[$t['name'] ?? ''] ?? '', $x['themes'] ?? []))),
    'modes' => array_values(array_filter(array_map(fn($t) => IGDB_FR[$t['name'] ?? ''] ?? '', array_merge($x['game_modes'] ?? [], $x['player_perspectives'] ?? [])))), 'imgs' => $imgs, 'plat' => array_slice(array_values(array_filter(array_column($x['platforms'] ?? [], 'abbreviation'))), 0, 6)]));
}

/* ---------- Jeux de société : BoardGameGeek (XML API2, jeton d'application requis) ---------- */
function http_raw(string $url, array $headers = []): string {
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_HTTPHEADER => $headers,
    CURLOPT_USERAGENT => 'Sharefs/1.0 (' . cfg('mail_from', 'contact') . ')']);
  $res = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  if ($res === false || $code >= 400 || $code === 202) fail(502, 'provider_' . $code);
  return (string) $res;
}
function bgg(string $path, array $p): SimpleXMLElement {
  need_key('bgg_token');
  $xml = @simplexml_load_string(http_raw('https://boardgamegeek.com/xmlapi2/' . $path . '?' . http_build_query($p), ['Authorization: Bearer ' . cfg('bgg_token')]));
  if (!$xml) fail(502, 'provider_xml');
  return $xml;
}
function bgg_attr($node, string $a = 'value'): string { return $node ? (string) $node[$a] : ''; }
function from_bgg(SimpleXMLElement $it): array {
  $name = '';
  foreach ($it->name as $n) { if ((string) $n['type'] === 'primary') { $name = (string) $n['value']; break; } }
  if ($name === '') $name = bgg_attr($it->name[0] ?? null);
  $designers = []; $cats = []; $mech = [];
  foreach ($it->link as $l) {
    if ((string) $l['type'] === 'boardgamedesigner' && count($designers) < 2) $designers[] = (string) $l['value'];
    if ((string) $l['type'] === 'boardgamecategory' && count($cats) < 3) $cats[] = (string) $l['value'];
    if ((string) $l['type'] === 'boardgamemechanic' && count($mech) < 6) $mech[] = (string) $l['value'];
  }
  $img = trim((string) ($it->image ?? '')) ?: trim((string) ($it->thumbnail ?? '')) ?: bgg_attr($it->thumbnail ?? null);
  return clean(['id' => 'bgg-' . (string) $it['id'], 't' => 'b', 'ti' => $name, 'y' => (int) bgg_attr($it->yearpublished ?? null) ?: null,
    'c' => implode(', ', $designers), 'img' => $img, 'g' => $cats, 'mech' => $mech, 'd' => (int) bgg_attr($it->playingtime ?? null) ?: null]);
}
function search_bgg(string $q, int $page, int $lim): array {
  if ($q === '') {
    $hot = bgg('hot', ['type' => 'boardgame']);
    $ids = [];
    foreach ($hot->item as $it) $ids[] = (string) $it['id'];
    $ids = array_slice($ids, ($page - 1) * $lim, $lim);
    $more = count($hot->item) > $page * $lim;
  } else {
    $res = bgg('search', ['query' => $q, 'type' => 'boardgame']);
    $all = [];
    foreach ($res->item as $it) $all[] = (string) $it['id'];
    $ids = array_slice($all, ($page - 1) * $lim, $lim); $more = count($all) > $page * $lim;
  }
  if (!$ids) return ['items' => [], 'more' => false];
  $things = bgg('thing', ['id' => implode(',', $ids)]);
  $items = []; foreach ($things->item as $it) $items[] = from_bgg($it);
  return ['items' => $items, 'more' => $more];
}
function work_bgg(string $id): array {
  $things = bgg('thing', ['id' => (int) $id, 'stats' => 1]);
  if (!isset($things->item[0])) fail(404, 'not_found');
  $it = $things->item[0];
  $syn = trim((string) preg_replace('/\s+/', ' ', html_entity_decode(strip_tags((string) $it->description), ENT_QUOTES | ENT_HTML5)));
  $w = from_bgg($it);
  $players = bgg_attr($it->minplayers ?? null) . '–' . bgg_attr($it->maxplayers ?? null);
  return clean(array_merge($w, ['syn' => mb_substr($syn, 0, 800), 'imgs' => array_values(array_filter([$w['img'] ?? ''])), 'plat' => [$players . ' joueurs']]));
}

/* ---------- Musique : Deezer (sans clé, pochettes fiables) ---------- */
function dz(string $path, array $p = [], bool $soft = false): array {
  try { $raw = http_raw('https://api.deezer.com/' . $path . ($p ? '?' . http_build_query($p) : ''), ['Accept: application/json']); }
  catch (Throwable $e) { if ($soft) return []; throw $e; }
  $j = json_decode($raw, true);
  if (!is_array($j)) return [];
  if (isset($j['error'])) { if ($soft) return []; fail(502, 'provider_dz'); }
  return $j;
}
function from_dz(array $x): array {
  $genres = array_slice(array_map(fn($g) => $g['name'] ?? '', $x['genres']['data'] ?? []), 0, 3);
  return clean(['id' => 'dz-' . ($x['id'] ?? ''), 't' => 'm', 'ti' => $x['title'] ?? '', 'y' => yr($x['release_date'] ?? ''),
    'c' => $x['artist']['name'] ?? '', 'img' => $x['cover_xl'] ?? ($x['cover_big'] ?? ($x['cover_medium'] ?? '')),
    'g' => array_values(array_filter($genres)), 'd' => isset($x['nb_tracks']) ? (int) $x['nb_tracks'] : null]);
}
const DZ_NOT_ALBUM = ['single'];
function dz_is_album(array $x): bool { return !in_array($x['record_type'] ?? 'album', DZ_NOT_ALBUM, true); }
// titre « nu » : sans (feat. …), [Remastered], - Radio Edit…
function dz_bare(string $t): string {
  $t = preg_replace('/\s*[\(\[][^\)\]]*[\)\]]/u', '', $t); $t = preg_replace('/\s+-\s+.*$/u', '', $t);
  return mb_strtolower(trim($t));
}
function search_dz(string $q, int $page, int $lim, bool $songs = false): array {
  if ($q === '') {
    $d = dz('chart/0/albums', ['limit' => $lim, 'index' => ($page - 1) * $lim]);
    $items = array_values(array_filter(array_map('from_dz', array_filter($d['data'] ?? [], 'dz_is_album')), fn($w) => !empty($w['ti']) && $w['id'] !== 'dz-'));
    return ['items' => $items, 'more' => count($items) > 0 && $page < 5];
  }
  $d = dz('search/album', ['q' => $q, 'limit' => $lim * 2, 'index' => ($page - 1) * $lim * 2]);
  $albums = array_values(array_filter(array_map('from_dz', array_filter($d['data'] ?? [], 'dz_is_album')), fn($w) => !empty($w['ti']) && $w['id'] !== 'dz-'));
  $more = isset($d['next']);
  if (!$songs) return ['items' => array_slice($albums, 0, $lim), 'more' => $more];
  $sl = dz_songs($q, $page, $lim);
  // moitié albums, moitié chansons ; l'une comble l'autre si elle manque
  $na = max((int) ceil($lim / 2), $lim - count($sl['items']));
  $items = array_merge(array_slice($albums, 0, $na), array_slice($sl['items'], 0, $lim - min($na, count($albums))));
  return ['items' => $items, 'more' => $more || $sl['more']];
}
// chansons : on garde une entrée par chanson, rattachée de préférence à un vrai album plutôt qu'au single
function dz_songs(string $q, int $page, int $lim): array {
  $d = dz('search/track', ['q' => $q, 'limit' => 40, 'index' => ($page - 1) * 40], true);
  $best = [];
  foreach ($d['data'] ?? [] as $x) {
    if (empty($x['album']['id']) || empty($x['title'])) continue;
    $k = mb_strtolower(($x['artist']['name'] ?? '') . '|' . dz_bare($x['title']));
    $isSingle = dz_bare($x['album']['title'] ?? '') === dz_bare($x['title']);
    if (!isset($best[$k]) || ($best[$k]['single'] && !$isSingle)) $best[$k] = ['x' => $x, 'single' => $isSingle];
  }
  $out = []; $fixes = 0;
  foreach ($best as $b) {
    $x = $b['x'];
    // seulement trouvée sur un single : on cherche l'album qui la contient (2 tentatives max)
    if ($b['single'] && $fixes < 2) { $fixes++; $p = dz_parent_track($x); if ($p) $x = $p; elseif (!empty($x['album']['id'])) continue; }
    $out[] = clean(['id' => 'dzt-' . $x['id'], 't' => 'm', 'ti' => $x['title'], 'c' => $x['artist']['name'] ?? '',
      'img' => $x['album']['cover_xl'] ?? ($x['album']['cover_big'] ?? ($x['album']['cover_medium'] ?? '')),
      'alb' => 'dz-' . $x['album']['id'], 'at' => $x['album']['title'] ?? '', 'sid' => (string) $x['id']]);
    if (count($out) >= $lim) break;
  }
  return ['items' => $out, 'more' => isset($d['next'])];
}
// la même chanson sur un album (pas un single) du même artiste
function dz_parent_track(array $x): ?array {
  $art = $x['artist']['name'] ?? ''; $bare = dz_bare($x['title'] ?? '');
  if ($art === '' || $bare === '') return null;
  $key = 'dzp|' . ($x['id'] ?? '');
  if (($c = cache_get($key)) !== null) return $c ?: null;
  $r = dz('search/track', ['q' => 'artist:"' . $art . '" track:"' . $bare . '"', 'limit' => 25], true)['data'] ?? [];
  $found = null;
  foreach ($r as $y) {
    if (mb_strtolower($y['artist']['name'] ?? '') !== mb_strtolower($art) || dz_bare($y['title'] ?? '') !== $bare) continue;
    if (dz_bare($y['album']['title'] ?? '') === $bare || ($y['album']['id'] ?? 0) == ($x['album']['id'] ?? -1)) continue;
    $al = dz('album/' . (int) $y['album']['id'], [], true);
    if (!empty($al['id']) && dz_is_album($al) && (int) ($al['nb_tracks'] ?? 0) >= 4) { $found = $y; break; }
  }
  cache_set($key, $found ?: [], 30 * 86400);
  return $found;
}
function work_dz(string $id): array {
  $x = dz('album/' . (int) $id);
  if (empty($x['id'])) fail(404, 'not_found');
  $w = from_dz($x);
  $tracks = array_slice(array_map(fn($t) => $t['title'] ?? '', $x['tracks']['data'] ?? []), 0, 6);
  $allTracks = array_values(array_filter(array_map(fn($t) => $t['title'] ?? '', $x['tracks']['data'] ?? [])));
  $tdur = array_values(array_filter(array_map(fn($t) => [$t['title'] ?? '', (int) ($t['duration'] ?? 0)], $x['tracks']['data'] ?? []), fn($t) => $t[0] !== '' && $t[1] > 0));
  $tl = array_values(array_filter(array_map(fn($t) => [(string) ($t['id'] ?? ''), $t['title'] ?? '', (int) ($t['duration'] ?? 0)], $x['tracks']['data'] ?? []), fn($t) => $t[0] !== '' && $t[1] !== ''));
  $rt = $x['record_type'] ?? 'album'; $parent = '';
  // un single ou un EP : on cherche l'album qui contient son premier titre (pour remplacer les anciennes cartes)
  if (in_array($rt, ['single', 'ep'], true) && $tl) {
    $par = dz_parent_track(['id' => $tl[0][0], 'title' => $tl[0][1], 'artist' => $x['artist'] ?? [], 'album' => ['id' => $x['id'], 'title' => $x['title'] ?? '']]);
    if ($par && !empty($par['album']['id'])) $parent = 'dz-' . $par['album']['id'];
  }
  return clean(array_merge($w, ['tracks' => array_slice($allTracks, 0, 20), 'tdur' => array_slice($tdur, 0, 20), 'tl' => array_slice($tl, 0, 80), 'rt' => $rt, 'parent' => $parent, 'imgs' => array_values(array_filter([$w['img'] ?? ''])), 'syn' => $tracks ? 'Titres : ' . implode(', ', $tracks) . (count($x['tracks']['data'] ?? []) > 6 ? '…' : '') : '',
    'plat' => array_values(array_filter([$x['label'] ?? '']))]));
}

/* ---------- Musique (ancien catalogue) : MusicBrainz + Cover Art Archive, gardé pour les œuvres déjà enregistrées ---------- */
function mb(string $path, array $p): array {
  $j = json_decode(http_raw('https://musicbrainz.org/ws/2/' . $path . '?' . http_build_query($p + ['fmt' => 'json']), ['Accept: application/json']), true);
  return is_array($j) ? $j : [];
}
function from_mb(array $x): array {
  $artists = array_map(fn($a) => $a['name'] ?? '', array_slice($x['artist-credit'] ?? [], 0, 2));
  $tags = array_slice(array_map(fn($t) => $t['name'] ?? '', $x['tags'] ?? []), 0, 3);
  return clean(['id' => 'mb-' . ($x['id'] ?? ''), 't' => 'm', 'ti' => $x['title'] ?? '', 'y' => yr($x['first-release-date'] ?? ''),
    'c' => implode(', ', array_filter($artists)), 'img' => !empty($x['id']) ? 'https://coverartarchive.org/release-group/' . $x['id'] . '/front-250' : '',
    'g' => array_values(array_filter($tags))]);
}
function search_mb(string $q, int $page, int $lim): array {
  $clean = trim(str_replace(['+', '-', '&', '|', '!', '(', ')', '{', '}', '[', ']', '^', '"', '~', '*', '?', ':', '\\', '/'], ' ', $q));
  $query = $clean === '' ? 'primarytype:album AND firstreleasedate:[' . (date('Y') - 1) . ' TO *]'
    : '(releasegroup:(' . $clean . ') OR artist:(' . $clean . ')) AND (primarytype:album OR primarytype:ep)';
  $d = mb('release-group', ['query' => $query, 'limit' => $lim, 'offset' => ($page - 1) * $lim]);
  return ['items' => array_values(array_filter(array_map('from_mb', $d['release-groups'] ?? []), fn($w) => !empty($w['ti']) && $w['id'] !== 'mb-')),
    'more' => ($page * $lim) < ($d['count'] ?? 0)];
}
function work_mb(string $id): array {
  $x = mb('release-group/' . $id, ['inc' => 'artist-credits+tags']);
  if (empty($x['id'])) fail(404, 'not_found');
  $w = from_mb($x);
  $big = 'https://coverartarchive.org/release-group/' . $x['id'] . '/front-500';
  return clean(array_merge($w, ['img' => $big, 'imgs' => [$big]]));
}

/* ---------- Découverte sans fin (swipe et 5 par 5) : on parcourt les catalogues page après page ---------- */
// Genres Deezer : classements d'albums par genre, puis albums des artistes phares du genre
const DZ_GENRES = [0, 132, 116, 152, 113, 165, 85, 106, 129, 169, 144, 466, 464, 197, 2, 98];
// Sujets Open Library : les œuvres y sont classées par nombre d'éditions (donc par notoriété)
const OL_SUBJECTS = ['fantasy', 'science_fiction', 'mystery_and_detective_stories', 'thrillers', 'romance', 'horror', 'historical_fiction', 'classic_literature',
  'young_adult_fiction', 'french_literature', 'comic_books_strips_etc', 'manga', 'biography', 'adventure_stories', 'dystopias', 'humor'];
function from_ol_doc(array $x): ?array {
  $key = (string) ($x['key'] ?? ''); if (!preg_match('#/works/(OL\d+W)$#', $key, $m)) return null;
  $cover = $x['cover_i'] ?? ($x['cover_id'] ?? null); if (!$cover) return null;
  $authors = $x['author_name'] ?? array_map(fn($a) => $a['name'] ?? '', $x['authors'] ?? []);
  return clean(['id' => 'ol-' . $m[1], 't' => 'l', 'ti' => $x['title'] ?? '', 'y' => (int) ($x['first_publish_year'] ?? 0) ?: null,
    'c' => implode(', ', array_slice(array_filter($authors), 0, 2)), 'img' => "https://covers.openlibrary.org/b/id/$cover-L.jpg"]);
}
function discover_books(int $page, int $lim): array {
  $n = count(OL_SUBJECTS); $round = intdiv($page - 1, $n + 1); $slot = ($page - 1) % ($n + 1);
  if ($slot === $n) { // une page sur 17 : tendances du moment
    $period = ['weekly', 'monthly', 'yearly', 'forever'][$round % 4];
    $d = http_json("https://openlibrary.org/trending/$period.json?" . http_build_query(['limit' => $lim, 'page' => intdiv($round, 4) + 1]));
  } else {
    $d = http_json('https://openlibrary.org/subjects/' . OL_SUBJECTS[$slot] . '.json?' . http_build_query(['limit' => $lim, 'offset' => $round * $lim]));
  }
  return ['items' => array_values(array_filter(array_map('from_ol_doc', $d['works'] ?? []))), 'more' => true];
}
function discover_music(int $page, int $lim): array {
  $n = count(DZ_GENRES); $g = DZ_GENRES[($page - 1) % $n]; $round = intdiv($page - 1, $n);
  if ($round < 4) { // classements du genre (jusqu'à 4 pages)
    $items = array_filter(dz("chart/$g/albums", ['limit' => $lim, 'index' => $round * $lim])['data'] ?? [], 'dz_is_album');
  } else { // puis les albums d'artistes phares du genre
    $arts = dz("chart/$g/artists", ['limit' => 100])['data'] ?? [];
    $a = $arts[($round - 4) % max(1, count($arts))] ?? null; $items = [];
    if ($a) foreach ((dz('artist/' . (int) $a['id'] . '/albums', ['limit' => 25])['data'] ?? []) as $al)
      if (($al['record_type'] ?? 'album') === 'album') $items[] = $al + ['artist' => ['name' => $a['name'] ?? '']];
    $items = array_slice($items, 0, $lim);
  }
  return ['items' => array_values(array_filter(array_map('from_dz', $items), fn($w) => !empty($w['ti']) && !empty($w['img']) && $w['id'] !== 'dz-')), 'more' => true];
}
function catalog_discover(string $type, int $page, int $lim): array {
  $page = max(1, $page);
  $key = "d3|$type|$page|$lim";
  if (($c = cache_get($key)) !== null) return $c;
  $r = match ($type) {
    'f', 's' => (function () use ($type, $page, $lim) {
      $k = $type === 'f' ? 'movie' : 'tv';
      $d = tmdb("/discover/$k", ['sort_by' => 'popularity.desc', 'vote_count.gte' => $type === 'f' ? 150 : 80, 'page' => min(500, $page), 'include_adult' => 'false']);
      $items = array_values(array_filter($d['results'] ?? [], fn($x) => !empty($x['poster_path'])));
      return ['items' => array_map(fn($x) => from_tmdb($x, $k), array_slice($items, 0, $lim)), 'more' => $page < min(500, (int) ($d['total_pages'] ?? 1))];
    })(),
    'j' => (function () use ($page, $lim) {
      $off = ($page - 1) * $lim; $n = $lim + 1;
      $d = igdb('fields ' . GF . "; where total_rating_count > 15 & cover != null; sort total_rating_count desc; limit $n; offset $off;");
      return ['items' => array_map('from_game', array_slice($d, 0, $lim)), 'more' => count($d) > $lim];
    })(),
    'l' => discover_books($page, $lim),
    'm' => discover_music($page, $lim),
    'b' => search_bgg('', $page, $lim),
    default => fail(400, 'bad_type'),
  };
  cache_set($key, $r, 6 * 3600);
  return $r;
}

function catalog_search(string $type, string $q, int $page, int $lim, bool $songs = false): array {
  $key = "s4|$type|$q|$page|$lim|" . (int) $songs;
  if (($c = cache_get($key)) !== null) return $c;
  $r = match ($type) {
    'f' => search_tmdb('movie', $q, $page, $lim), 's' => search_tmdb('tv', $q, $page, $lim),
    'l' => search_books($q, $page, $lim), 'j' => search_games($q, $page, $lim),
    'b' => search_bgg($q, $page, $lim), 'm' => search_dz($q, $page, $lim, $songs), default => fail(400, 'bad_type') };
  cache_set($key, $r, 3600);
  return $r;
}
function catalog_work(string $id): array {
  if (($c = cache_get("w6|$id")) !== null) return $c;
  if (preg_match('/^tmdb-(movie|tv)-(\d+)$/', $id, $m)) $r = work_tmdb($m[1], $m[2]);
  elseif (preg_match('/^gb-([\w-]+)$/', $id, $m)) $r = work_book($m[1]);
  elseif (preg_match('/^ol-(OL\d+W)$/', $id, $m)) $r = work_ol($m[1]);
  elseif (preg_match('/^bgg-(\d+)$/', $id, $m)) $r = work_bgg($m[1]);
  elseif (preg_match('/^mb-([0-9a-f-]{36})$/', $id, $m)) $r = work_mb($m[1]);
  elseif (preg_match('/^dz-(\d+)$/', $id, $m)) $r = work_dz($m[1]);
  elseif (preg_match('/^igdb-(\d+)$/', $id, $m)) $r = work_game($m[1]);
  else fail(400, 'bad_id');
  cache_set("w6|$id", $r, 7 * 86400);
  return $r;
}
