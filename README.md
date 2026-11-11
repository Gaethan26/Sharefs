# Sharefs

Collection de films, séries, livres et jeux partagée entre amis, façon jeu de cartes.
Tout tourne sur un hébergement mutualisé o2switch : site web, API PHP (8.1 minimum), base MySQL ou MariaDB. Les apps iOS et Android (Capacitor 8) utilisent la même API.

## Structure

- `www/` : l'app (HTML/CSS/JS sans framework), servie telle quelle et embarquée dans les apps mobiles
- `server/api/` : API PHP (comptes, cercles, recommandations, catalogue TMDB / Google Books / IGDB avec cache MySQL)
- `server/schema.sql` : tables MySQL
- `.cpanel.yml` : déploiement automatique depuis Git dans cPanel
- `ios/`, `android/` : projets natifs

## Installation sur o2switch (une fois)

1. **Sous-domaine** : cPanel > Domaines > Créer, par exemple `sharefs.ton-domaine.fr`. Note le dossier racine créé (`/home/USER/sharefs.ton-domaine.fr`). Active le SSL dans cPanel > SSL/TLS Status (AutoSSL).
2. **Base de données** : cPanel > Assistant de base de données MySQL. Crée la base et un utilisateur avec tous les droits. Dans phpMyAdmin, importe `server/schema.sql`.
3. **E-mail** : cPanel > Comptes de messagerie, crée `sharefs@ton-domaine.fr` (expéditeur des codes de mot de passe oublié).
4. **Déploiement** : remplace `USER` et le dossier dans `.cpanel.yml`. Puis cPanel > Git Version Control > Create, clone `https://github.com/Gaethan26/Sharefs.git` dans `/home/USER/repositories/sharefs`. Dans « Manage » > « Pull or Deploy », clique sur **Update from Remote** puis **Deploy HEAD Commit**.
5. **Configuration** : dans le gestionnaire de fichiers, copie `api/config.sample.php` en `api/config.php` dans le dossier du sous-domaine et remplis-le. Ce fichier n'est jamais versionné ni écrasé par le déploiement.
6. **Mobile** : mets l'adresse du sous-domaine dans `www/config.js` (`apiBase`).

Mises à jour suivantes : `git push`, puis dans cPanel > Git Version Control : Update from Remote, puis Deploy HEAD Commit.

## Mise à jour : défis et commentaires

Les tables des défis et des commentaires sont créées automatiquement par l'API au premier appel. Le fichier `server/migration-002-defis-commentaires.sql` reste disponible pour une installation manuelle.

## Catalogues

- Films et séries : TMDB (`tmdb_token`)
- Jeux vidéo : IGDB via Twitch (`twitch_client_id`, `twitch_client_secret`)
- Livres : Google Books (`google_books_key`, facultatif), repli sur Open Library
- Jeux de société : BoardGameGeek (`bgg_token`, application à enregistrer sur boardgamegeek.com/applications). L'app affiche la mention « Powered by BGG ».
- Musique : Deezer, sans clé (albums et pochettes). Les œuvres musicales enregistrées avant la v37 (identifiants `mb-`) restent lisibles via MusicBrainz.

## Jeu 1v1 « Genre tu l'as vu !? »

Code serveur dans `server/api/match.php` (table `matches`, créée automatiquement). Tour par tour : chacun joue à son rythme ; les deux joueurs répondent aux mêmes 5 questions, chacun avec son propre chrono de 30 s par question. Le serveur fait foi : le coup de l'adversaire et les bonnes réponses ne sont envoyés qu'une fois joués. Mise à jour discrète en arrière-plan : la partie ouverte est vérifiée toutes les 2,5 s (réponse vide si rien n'a changé) et l'écran n'est redessiné que si la phase ou ton rôle change ; le score et l'avancée de l'adversaire sont mis à jour sur place. La liste des parties est vérifiée toutes les 15 s. Les parties créées par une ancienne version sont remises au bon format à la lecture.

### Questions sur le contenu des œuvres (facultatif)

Avec une clé de l'API Claude (`anthropic_key` dans `config.php`, créée sur console.anthropic.com), le questionnaire pose jusqu'à 4 questions sur l'œuvre elle-même (personnages, lieux, objets, scènes), complétées par des questions tirées de sa fiche. Les questions sont générées une seule fois par œuvre puis gardées 30 jours en cache. Sans clé, seules les questions tirées des fiches sont posées.

## Swipe et 5 par 5

Les œuvres proviennent de l'endpoint `discover`, qui parcourt les catalogues page après page (populaires d'abord, puis de plus en plus loin) : la pile ne s'épuise pas.

## Cartes secrètes

Déposer les images dans `www/eggs/` (voir `www/eggs/LISEZMOI.md`). Sans image, une illustration originale s'affiche.

## Configuration privée

La configuration est lue en priorité dans `/home/UTILISATEUR/app-private/config.php`, hors du dossier public. Les journaux PHP sont écrits dans `app-private/logs/`. L'ancien emplacement `api/config.php` reste accepté.

## Catalogue (clés dans `config.php`)

| Clé | Où l'obtenir |
|---|---|
| `tmdb_token` | themoviedb.org > Paramètres > API > « Jeton d'accès en lecture de l'API » |
| `twitch_client_id`, `twitch_client_secret` | dev.twitch.tv/console > Register Your Application (OAuth Redirect : `http://localhost`, catégorie Application Integration, double authentification Twitch requise) |
| `google_books_key` | facultatif, Google Cloud Console > Books API |

Test : `https://sharefs.ton-domaine.fr/api/search?type=f&q=dune`

## Mobile

`npm install`, puis `npm run ios` ou `npm run android`. Voir les étapes Xcode et Android Studio dans l'historique du projet (signature, mode développeur).

## Avant soumission aux stores

Icônes (`npx @capacitor/assets generate`), politique de confidentialité en ligne, signalement de contenu (guideline Apple 1.2). La suppression de compte est intégrée.
Les touches « jeu de cartes » de la collection sont originales : aucun élément graphique, nom ou police de Blizzard n’est utilisé.
