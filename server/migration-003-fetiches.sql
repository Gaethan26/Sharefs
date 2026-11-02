-- Œuvres fétiches : créées automatiquement par l'API au premier appel.
-- Ce fichier sert uniquement à une installation manuelle via phpMyAdmin.
CREATE TABLE IF NOT EXISTS fetishes (
  user_id CHAR(36) NOT NULL, season VARCHAR(16) NOT NULL, work TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, season), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS fetish_guesses (
  id CHAR(36) PRIMARY KEY, guesser_id CHAR(36) NOT NULL, target_id CHAR(36) NOT NULL, season VARCHAR(16) NOT NULL, day DATE NOT NULL,
  work TEXT NOT NULL, correct TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY one_per_day (guesser_id, target_id, day), INDEX (target_id, season), INDEX (guesser_id, season),
  FOREIGN KEY (guesser_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
