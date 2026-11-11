<?php
// Copie ce fichier en config.php (sur le serveur uniquement, jamais dans Git).
return [
  'db_host' => 'localhost',
  'db_name' => 'CPANELUSER_sharefs',
  'db_user' => 'CPANELUSER_sharefs',
  'db_pass' => 'MOT_DE_PASSE',

  'tmdb_token'           => '',   // themoviedb.org > Paramètres > API > jeton de lecture
  'twitch_client_id'     => '',   // dev.twitch.tv/console (pour IGDB)
  'twitch_client_secret' => '',
  'google_books_key'     => '',   // facultatif
  'bgg_token'            => '',   // jeux de société : boardgamegeek.com/applications (application non commerciale)

  // E-mails : boîte créée dans cPanel > Comptes de messagerie (recommandé : SMTP authentifié)
  'smtp_host'            => '',   // serveur sortant indiqué par cPanel > Comptes de messagerie > Connecter les appareils
  'smtp_port'            => 465,  // 465 (SSL) ou 587 (STARTTLS)
  'smtp_user'            => '',   // adresse complète de la boîte
  'smtp_pass'            => '',   // mot de passe de la boîte
  'mail_name'            => 'Sharefs',
  'mail_from' => 'sharefs@ton-domaine.fr', // adresse créée dans cPanel > Comptes de messagerie
];
