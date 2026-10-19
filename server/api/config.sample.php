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

  'mail_from' => 'sharefs@ton-domaine.fr', // adresse créée dans cPanel > Comptes de messagerie
];
