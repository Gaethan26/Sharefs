# Le Cercle

Une référence par mois à tes amis (livre, film, série, jeu). Ils ont un mois pour la vivre.
Les avis restent scellés tant qu’on n’a pas fini. L’expéditeur parie sur la note. Un salon s’ouvre à ceux qui ont fini.

**Stack** : Next.js 15 (App Router, Server Actions) · Supabase (Postgres + RLS, Auth, Realtime) · Vercel.
**Coût** : 0 € au démarrage (offres gratuites Supabase, Vercel, TMDB, RAWG, Resend).

## Mise en ligne (≈ 20 min)

### 1. Supabase
1. Crée un projet sur supabase.com : région Europe, *Enable Data API* coché, *Automatically expose new tables* décoché (le schéma donne les droits lui-même), *Enable automatic RLS* coché, Postgres standard.
2. **SQL Editor** : colle puis exécute `supabase/schema.sql`.
3. **Authentication > URL Configuration**
   - Site URL : `https://ton-domaine`
   - Redirect URLs : `https://ton-domaine/auth/callback` et `http://localhost:3000/auth/callback`
4. **Authentication > Email Templates > Magic Link** : ajoute `Ton code : {{ .Token }}` au modèle. Le code sert quand le lien s’ouvre dans un autre navigateur, par exemple sur mobile ou dans l’app installée.
5. **Authentication > SMTP** : branche Resend ou un autre SMTP. L’envoi par défaut de Supabase est limité à quelques e-mails par heure et ne convient qu’aux tests.
6. Google (facultatif) : **Authentication > Providers > Google**, avec un client OAuth créé sur Google Cloud. L’URI de redirection à déclarer côté Google est celle qu’affiche Supabase. Mets ensuite `NEXT_PUBLIC_GOOGLE_ENABLED=1`.

### 2. Clés facultatives
| Variable | Rôle | Où l’obtenir |
|---|---|---|
| `TMDB_API_KEY` | Recherche films et séries, affiches, plateformes en France | themoviedb.org > Paramètres > API > *API Read Access Token* |
| `RAWG_API_KEY` | Recherche jeux | rawg.io/apidocs |
| `GOOGLE_BOOKS_API_KEY` | Livres (marche sans clé, avec un quota réduit) | console.cloud.google.com |
| `ANTHROPIC_API_KEY` | Pitch sans spoiler et temps estimé | console.anthropic.com |
| `RESEND_API_KEY`, `EMAIL_FROM` | E-mail quotidien | resend.com, après vérification du domaine |

Sans clé, la saisie manuelle prend le relais et le bouton Claude est masqué.

### 3. Vercel
1. Pousse ce dossier sur GitHub, puis importe le dépôt dans Vercel.
2. Renseigne les variables de `.env.example`, et mets un `CRON_SECRET` aléatoire.
3. Déploie. Le cron de `vercel.json` envoie l’e-mail quotidien à 7 h UTC : nouvelles recos, échéances à J-7 et J-1, nouveaux avis.

### En local
```bash
cp .env.example .env.local   # puis remplis les valeurs
npm install
npm run dev
```

## Règles garanties par la base (pas seulement par l’interface)
- Une reco par cercle et par mois ; une seule réponse par reco reçue, hors quota.
- Les avis, la note et le pari de l’expéditeur restent invisibles tant que tu n’as pas noté (RLS).
- Le salon n’est lisible et accessible en écriture que pour l’expéditeur et ceux qui ont fini.
- Le délai ne bouge que par le joker (+15 jours, une fois). Aucune écriture directe n’est possible sur les défis.
- Les listes et profils ne sont visibles qu’entre membres d’un même cercle.

## Structure
```
supabase/schema.sql      tables, fonctions RPC, policies RLS, temps réel
app/actions.ts           server actions (envoi, défis, cercles, liste, profil)
app/(app)/               pages connectées : a-faire, liste, cercles, c/[id], r/[id], envoyer, profil, u/[id]
app/api/                 catalog (TMDB, Google Books, RAWG), pitch (Claude), cron/digest (Resend)
components/              UI ; Salon.tsx pour le temps réel, SendForm.tsx pour l’envoi
lib/                     clients Supabase, catalogue, formats, stats d’affinité
```
