-- Sharefs : défis et commentaires. À importer une fois dans phpMyAdmin (rejouable).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS challenges (
  id CHAR(36) PRIMARY KEY,
  from_id CHAR(36) NOT NULL,
  to_id CHAR(36) NOT NULL,
  works TEXT NOT NULL,
  note VARCHAR(280) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deadline DATETIME NOT NULL,
  INDEX (from_id), INDEX (to_id),
  FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comments (
  id CHAR(36) PRIMARY KEY,
  rec_id CHAR(36) NOT NULL,
  from_id CHAR(36) NOT NULL,
  text VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (rec_id),
  FOREIGN KEY (rec_id) REFERENCES recs(id) ON DELETE CASCADE,
  FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
