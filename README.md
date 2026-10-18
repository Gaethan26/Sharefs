# Sharefs

App mobile (iOS et Android) de partage de films, séries, livres et jeux entre amis.
Stack : HTML/JS sans framework dans `www/`, empaqueté par Capacitor 8, backend Supabase (auth par code e-mail, Postgres + RLS, temps réel).

## Structure

- `www/index.html` : l'app complète (UI, catalogue, recherche, collection)
- `www/config.js` : URL et clé anon Supabase
- `supabase/schema.sql` : tables, règles RLS, fonctions (cercles, suppression de compte)
- `ios/`, `android/` : projets natifs générés par Capacitor

## Mise en route

1. Supabase : créer un projet, puis exécuter `supabase/schema.sql` dans SQL Editor.
2. Supabase > Authentication > Email Templates > Magic Link : remplacer le lien par le code `{{ .Token }}` (l'app demande un code à 6 chiffres).
3. Supabase > Authentication > SMTP : brancher un SMTP réel (Brevo, Resend…). Le SMTP par défaut est limité à quelques e-mails par heure.
4. Renseigner `www/config.js`.
5. `npm install` puis `npx cap sync`.
6. Tester dans le navigateur : `npm run serve`.

## Build

- Android : `npm run android` (ouvre Android Studio) > Build > Generate Signed App Bundle > publication sur la Play Console.
- iOS (Mac + Xcode requis) : `npm run ios` > régler l'équipe de signature > Product > Archive > envoi vers App Store Connect.

Changer `appId` (`fr.sharefs.app`) dans `capacitor.config.json` avant le premier `cap add` si tu as un autre identifiant. Sinon, modifie-le aussi dans les projets natifs.

## Avant soumission aux stores

- Icônes et splash : `npx @capacitor/assets generate` à partir d'un `assets/icon.png` de 1024 px.
- Politique de confidentialité en ligne (URL demandée par les deux stores).
- Apple, guideline 1.2 (contenu généré par les utilisateurs) : les notes de recommandation sont du contenu utilisateur. Apple peut exiger un moyen de signaler du contenu ou de bloquer quelqu'un, en plus de quitter un cercle.
- Apple, guideline 4.2 : une app trop proche d'un site web peut être refusée. Le catalogue, la collection et le temps réel aident, mais un catalogue branché sur des API (TMDB, Google Books, IGDB via un proxy serveur) renforcera le dossier.
- La suppression de compte est déjà intégrée (Collection > Mon compte), comme l'exige l'App Store.
