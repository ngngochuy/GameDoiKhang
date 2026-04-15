-- ============================================
-- Game Giải Mã Số — Database Schema
-- Import vào database sql_game_nghuy_vn
-- ============================================

-- Bảng phòng chơi
CREATE TABLE IF NOT EXISTS `rooms` (
  `id` INT(3) UNSIGNED NOT NULL,
  `player1_id` VARCHAR(32) NOT NULL,
  `player2_id` VARCHAR(32) DEFAULT NULL,
  `player1_secret` VARCHAR(4) DEFAULT NULL,
  `player2_secret` VARCHAR(4) DEFAULT NULL,
  `current_turn` ENUM('player1','player2') DEFAULT 'player1',
  `turn_start_time` BIGINT DEFAULT NULL,
  `status` ENUM('waiting','setSecret','playing','finished') DEFAULT 'waiting',
  `winner` ENUM('player1','player2') DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

-- Bảng lịch sử đoán
CREATE TABLE IF NOT EXISTS `guesses` (
  `id` INT UNSIGNED AUTO_INCREMENT,
  `room_id` INT(3) UNSIGNED NOT NULL,
  `player` ENUM('player1','player2') NOT NULL,
  `digits` VARCHAR(4) NOT NULL,
  `correct` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_room` (`room_id`),
  CONSTRAINT `fk_room` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
