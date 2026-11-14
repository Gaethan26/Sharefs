# Publier sur l'App Store et Google Play

Le code est prêt. Les étapes ci-dessous ne peuvent se faire que sur ton Mac et dans tes comptes.

## 0. À décider avant le premier envoi (définitif)

| Point | Valeur actuelle | Où changer |
|---|---|---|
| Identifiant d'app | `fr.sharefs.app` | `capacitor.config.json`, `android/app/build.gradle` (applicationId), Xcode (Bundle Identifier) |
| Nom affiché | Sharefs | `capacitor.config.json` (appName), `android/app/src/main/res/values/strings.xml`, `ios/App/App/Info.plist` (CFBundleDisplayName) |

L'identifiant ne pourra plus jamais changer une fois publié. Le nom, si (par exemple pour passer à Panenka).

## 1. Côté serveur (config.php)

```php
'admin_email' => 'ton-adresse@…',   // reçoit les signalements (à traiter sous 24 h)
```
Créer aussi l'adresse `contact@gaethan-boyer.fr` (citée dans les pages légales), ou la remplacer dans `www/privacy.html` et `www/terms.html`.

## 2. Préparer les projets natifs (Mac)

```bash
cd ~/Sharefs && npm install && npx cap sync
```
Les icônes et l'écran de démarrage sont déjà générés (`assets/`). Pour les régénérer : `npm run assets`.

## 3. Android (Google Play)

1. Compte Google Play Console (25 $ une fois).
2. `npx cap open android`, puis dans Android Studio : Build > Generate Signed App Bundle > créer une clé (**sauvegarde le fichier .jks et ses mots de passe hors de l'ordinateur : sans eux, plus aucune mise à jour possible**).
3. Nouveau compte personnel : Google impose un **test fermé avec au moins 12 testeurs pendant 14 jours** avant la production. Ajoute tes amis du cercle comme testeurs.
4. Fiche : icône 512 px (`www/icon-512.png`), bannière 1024 × 500, au moins 2 captures de téléphone.
5. Sécurité des données : voir la section 6.
6. Classification (questionnaire IARC) : interactions entre utilisateurs = oui, pas de violence, pas d'achat.

## 4. iOS (App Store)

1. Compte Apple Developer (99 €/an).
2. `npx cap open ios`, puis dans Xcode : cible App > Signing & Capabilities > ton équipe. Version 1.0.0, build 1.
3. Product > Archive > Distribute App > App Store Connect.
4. Fiche : captures iPhone 6,9" (1320 × 2868), URL de confidentialité `https://sharefs.gaethan-boyer.fr/privacy.html`, URL d'assistance (la même ou une page contact).
5. Âge : 12+ (contenus créés par les utilisateurs, modérés).
6. Le manifeste de confidentialité (`PrivacyInfo.xcprivacy`) et l'exemption de chiffrement sont déjà en place.

## 5. Notes pour les vérificateurs (à coller dans les deux stores)

> Compte de démonstration : demo@… / mot de passe… (déjà membre d'un cercle avec des recommandations).
> Contenus entre utilisateurs limités à des cercles privés sur invitation. Chaque recommandation et chaque commentaire a un bouton ⋯ pour signaler ou bloquer l'auteur, et un ami peut être signalé ou bloqué depuis Collection > Mon compte. Les conditions d'utilisation (tolérance zéro) doivent être acceptées à l'inscription. Les signalements sont traités sous 24 h. Suppression du compte : Collection > Mon compte > Supprimer mon compte.

Crée ce compte de démo, avec un deuxième compte ami dans le même cercle et quelques recommandations.

## 6. Questionnaires de confidentialité

Données collectées, toutes **liées au compte**, **sans pistage** et **uniquement pour le fonctionnement de l'app** :
- adresse e-mail ;
- prénom ;
- identifiant utilisateur ;
- contenus créés : collection, recommandations, commentaires.

Pas de localisation, pas de contacts, pas de publicité, pas d'analytique, pas de partage avec des tiers. Chiffrement en transit : oui (HTTPS). Suppression du compte : oui, dans l'app.

## 7. Textes de la fiche (proposition)

**Sous-titre / description courte** : Ta collection de films, séries, livres, jeux et musique, partagée entre amis.

**Description** :
Garde une trace de tout ce que tu as vu, lu, joué et écouté, sous forme de cartes à collectionner. Donne une rareté à chaque œuvre, de « Une bouse frérot » à « Messi prime », range-les dans ton grimoire et sur ton étagère.
Recommande tes pépites à tes amis, lance-leur des défis, devine leur œuvre fétiche de la saison et affronte-les dans « Genre tu l'as vu !? », le quiz qui vérifie s'ils ont vraiment vu ce qu'ils prétendent.
Missions du jour, pépites à gagner, cadres et titres à débloquer : plus tu partages, plus ta collection brille.
Cercles privés sur invitation, sans publicité.
