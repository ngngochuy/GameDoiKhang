-- ============================================
-- Game Giải Mã Số — Database Schema
-- Import vào database sql_game_nghuy_vn
-- ============================================

USE sql_game_nghuy_vn;

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
  `is_paused` TINYINT(1) DEFAULT 0,
  `player1_pauses` INT DEFAULT 5,
  `player2_pauses` INT DEFAULT 5,
  `turn_pause_time` BIGINT DEFAULT NULL,
  `resume_request_p1` BIGINT DEFAULT NULL,
  `resume_request_p2` BIGINT DEFAULT NULL,
  `secret_length` TINYINT DEFAULT 4,
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

-- ============================================
-- Battleship (Hải Chiến) Tables
-- ============================================

-- Bảng phòng Battleship
CREATE TABLE IF NOT EXISTS `bs_rooms` (
  `id` INT(3) UNSIGNED NOT NULL,
  `player1_id` VARCHAR(32) NOT NULL,
  `player2_id` VARCHAR(32) DEFAULT NULL,
  `player1_ready` TINYINT(1) DEFAULT 0,
  `player2_ready` TINYINT(1) DEFAULT 0,
  `current_turn` ENUM('player1','player2') DEFAULT 'player1',
  `status` ENUM('waiting','placement','playing','finished') DEFAULT 'waiting',
  `winner` ENUM('player1','player2') DEFAULT NULL,
  `player1_hits` INT DEFAULT 0,
  `player2_hits` INT DEFAULT 0,
  `map_size` TINYINT DEFAULT 10,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

-- Bảng tàu đã đặt
CREATE TABLE IF NOT EXISTS `bs_ships` (
  `id` INT UNSIGNED AUTO_INCREMENT,
  `room_id` INT(3) UNSIGNED NOT NULL,
  `player` ENUM('player1','player2') NOT NULL,
  `ship_id` VARCHAR(20) NOT NULL,
  `ship_name` VARCHAR(30) NOT NULL,
  `size` TINYINT UNSIGNED NOT NULL,
  `start_row` TINYINT UNSIGNED NOT NULL,
  `start_col` TINYINT UNSIGNED NOT NULL,
  `is_vertical` TINYINT(1) NOT NULL DEFAULT 0,
  `is_sunk` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_bs_room` (`room_id`),
  CONSTRAINT `fk_bs_room_ship` FOREIGN KEY (`room_id`) REFERENCES `bs_rooms`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Bảng lịch sử bắn
CREATE TABLE IF NOT EXISTS `bs_shots` (
  `id` INT UNSIGNED AUTO_INCREMENT,
  `room_id` INT(3) UNSIGNED NOT NULL,
  `player` ENUM('player1','player2') NOT NULL,
  `row` TINYINT UNSIGNED NOT NULL,
  `col` TINYINT UNSIGNED NOT NULL,
  `is_hit` TINYINT(1) NOT NULL DEFAULT 0,
  `ship_id` VARCHAR(20) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bs_room_shot` (`room_id`),
  CONSTRAINT `fk_bs_room_shot` FOREIGN KEY (`room_id`) REFERENCES `bs_rooms`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- Higher/Lower (Đoán Trúng Số) Tables
-- ============================================

-- Bảng phòng Higher/Lower
CREATE TABLE IF NOT EXISTS `hl_rooms` (
  `id` INT(3) UNSIGNED NOT NULL,
  `player1_id` VARCHAR(32) NOT NULL,
  `player2_id` VARCHAR(32) DEFAULT NULL,
  `player1_secret` INT DEFAULT NULL,
  `player2_secret` INT DEFAULT NULL,
  `current_turn` ENUM('player1','player2') DEFAULT 'player1',
  `turn_start_time` BIGINT DEFAULT NULL,
  `status` ENUM('waiting','setSecret','playing','finished') DEFAULT 'waiting',
  `winner` ENUM('player1','player2') DEFAULT NULL,
  `difficulty` TINYINT DEFAULT 2, -- 2: 10-99, 3: 100-999, 4: 1000-9999
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

-- Bảng lịch sử đoán Higher/Lower
CREATE TABLE IF NOT EXISTS `hl_guesses` (
  `id` INT UNSIGNED AUTO_INCREMENT,
  `room_id` INT(3) UNSIGNED NOT NULL,
  `player` ENUM('player1','player2') NOT NULL,
  `guess` INT NOT NULL,
  `result` ENUM('lower','higher','correct') NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hl_room` (`room_id`),
  CONSTRAINT `fk_hl_room` FOREIGN KEY (`room_id`) REFERENCES `hl_rooms`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
