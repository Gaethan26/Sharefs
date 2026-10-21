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

## Catalogue (clés dans `api/config.php`)

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
