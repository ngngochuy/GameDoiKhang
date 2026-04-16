<?php
// ============================================
// 🔐 Game Giải Mã Số — PHP API
// ============================================

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ─── Database Config ───
$DB_HOST = 'localhost';
$DB_NAME = 'sql_game_nghuy_vn';
$DB_USER = 'sql_game_nghuy_vn';
$DB_PASS = 'sql_game_nghuy_vn'; // 👉 ĐIỀN MẬT KHẨU DATABASE CỦA BẠN

try {
    $pdo = new PDO("mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4", $DB_USER, $DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    // ─── Auto Migration for Pause Feature ───
    try {
        $pdo->exec("ALTER TABLE rooms ADD COLUMN is_paused TINYINT(1) DEFAULT 0");
        $pdo->exec("ALTER TABLE rooms ADD COLUMN player1_pauses INT DEFAULT 5");
        $pdo->exec("ALTER TABLE rooms ADD COLUMN player2_pauses INT DEFAULT 5");
        $pdo->exec("ALTER TABLE rooms ADD COLUMN turn_pause_time BIGINT DEFAULT NULL");
        $pdo->exec("ALTER TABLE rooms ADD COLUMN resume_request_p1 BIGINT DEFAULT NULL");
        $pdo->exec("ALTER TABLE rooms ADD COLUMN resume_request_p2 BIGINT DEFAULT NULL");
    } catch (PDOException $e) { /* ignore duplicate col err */ }
} catch (PDOException $e) {
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

// ─── Parse JSON body once ───
$_JSON = json_decode(file_get_contents('php://input'), true) ?? [];

// ─── Router ───
$action = $_GET['action'] ?? $_POST['action'] ?? $_JSON['action'] ?? '';

switch ($action) {
    case 'create_room':
        createRoom();
        break;
    case 'join_room':
        joinRoom();
        break;
    case 'set_secret':
        setSecret();
        break;
    case 'submit_guess':
        submitGuess();
        break;
    case 'get_room':
        getRoom();
        break;
    case 'get_guesses':
        getGuesses();
        break;
    case 'cancel_room':
        cancelRoom();
        break;
    case 'pause_game':
        pauseGame();
        break;
    case 'resume_game':
        resumeGame();
        break;
    case 'skip_turn':
        skipTurn();
        break;
    case 'surrender':
        surrender();
        break;
    // ─── Battleship (Hải Chiến) ───
    case 'bs_create_room':
        bsCreateRoom();
        break;
    case 'bs_join_room':
        bsJoinRoom();
        break;
    case 'bs_place_ships':
        bsPlaceShips();
        break;
    case 'bs_get_room':
        bsGetRoom();
        break;
    case 'bs_fire':
        bsFire();
        break;
    case 'bs_get_shots':
        bsGetShots();
        break;
    case 'bs_cancel_room':
        bsCancelRoom();
        break;
    case 'bs_surrender':
        bsSurrender();
        break;
    default:
        // Không trả error — tránh spam toast khi bị gọi không có action
        echo json_encode(['ok' => true, 'info' => 'API ready']);
}

// ============================================
// TẠO PHÒNG
// ============================================
function createRoom()
{
    global $pdo;
    $playerId = getParam('player_id');
    if (!$playerId)
        return error('Missing player_id');

    // Xóa phòng cũ hơn 1 giờ
    $pdo->exec("DELETE FROM rooms WHERE created_at < NOW() - INTERVAL 1 HOUR");

    // Tạo mã 3 chữ số
    $maxAttempts = 20;
    $roomId = null;
    for ($i = 0; $i < $maxAttempts; $i++) {
        $id = rand(100, 999);
        $stmt = $pdo->prepare("SELECT id FROM rooms WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            $roomId = $id;
            break;
        }
    }

    if (!$roomId)
        return error('Không thể tạo phòng, thử lại sau');

    $stmt = $pdo->prepare("INSERT INTO rooms (id, player1_id, status, player1_pauses, player2_pauses) VALUES (?, ?, 'waiting', 5, 5)");
    $stmt->execute([$roomId, $playerId]);

    echo json_encode(['ok' => true, 'room_id' => $roomId]);
}

// ============================================
// VÀO PHÒNG
// ============================================
function joinRoom()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    if (!$roomId || !$playerId)
        return error('Missing room_id or player_id');

    $stmt = $pdo->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();

    if (!$room)
        return error('Không tìm thấy phòng ' . $roomId);
    if ($room['status'] !== 'waiting')
        return error('Phòng đã đầy hoặc đang chơi');

    $stmt = $pdo->prepare("UPDATE rooms SET player2_id = ?, status = 'setSecret' WHERE id = ?");
    $stmt->execute([$playerId, $roomId]);

    echo json_encode(['ok' => true, 'room_id' => (int) $roomId]);
}

// ============================================
// ĐẶT SỐ BÍ MẬT
// ============================================
function setSecret()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    $secret = getParam('secret');

    if (!$roomId || !$playerId || !$secret)
        return error('Missing params');
    if (!preg_match('/^\d{4}$/', $secret))
        return error('Secret phải là 4 chữ số');

    $stmt = $pdo->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    if (!$room)
        return error('Phòng không tồn tại');

    // Xác định player nào
    $playerKey = null;
    if ($room['player1_id'] === $playerId)
        $playerKey = 'player1_secret';
    elseif ($room['player2_id'] === $playerId)
        $playerKey = 'player2_secret';
    else
        return error('Bạn không ở trong phòng này');

    $stmt = $pdo->prepare("UPDATE rooms SET $playerKey = ? WHERE id = ?");
    $stmt->execute([$secret, $roomId]);

    // Kiểm tra cả 2 đã đặt xong chưa
    $stmt = $pdo->prepare("SELECT player1_secret, player2_secret FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $updated = $stmt->fetch();

    if ($updated['player1_secret'] && $updated['player2_secret']) {
        $now = round(microtime(true) * 1000); // milliseconds
        $stmt = $pdo->prepare("UPDATE rooms SET status = 'playing', current_turn = 'player1', turn_start_time = ? WHERE id = ?");
        $stmt->execute([$now, $roomId]);
    }

    echo json_encode(['ok' => true]);
}

// ============================================
// GỬI LƯỢT ĐOÁN
// ============================================
function submitGuess()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    $digits = getParam('digits');

    if (!$roomId || !$playerId || !$digits)
        return error('Missing params');
    if (!preg_match('/^\d{4}$/', $digits))
        return error('Digits phải là 4 chữ số');

    $stmt = $pdo->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    if (!$room)
        return error('Phòng không tồn tại');
    if ($room['status'] !== 'playing')
        return error('Game chưa bắt đầu');

    // Xác định player
    $myRole = null;
    if ($room['player1_id'] === $playerId)
        $myRole = 'player1';
    elseif ($room['player2_id'] === $playerId)
        $myRole = 'player2';
    else
        return error('Bạn không ở trong phòng này');

    if ($room['current_turn'] !== $myRole)
        return error('Chưa đến lượt bạn');

    // Lấy secret đối thủ
    $opponentSecret = ($myRole === 'player1') ? $room['player2_secret'] : $room['player1_secret'];

    // Tính kết quả
    $correct = checkGuess($digits, $opponentSecret);

    // Lưu lượt đoán
    $stmt = $pdo->prepare("INSERT INTO guesses (room_id, player, digits, correct) VALUES (?, ?, ?, ?)");
    $stmt->execute([$roomId, $myRole, $digits, $correct]);

    // Kiểm tra thắng
    if ($correct == 4) {
        $stmt = $pdo->prepare("UPDATE rooms SET status = 'finished', winner = ?, turn_start_time = NULL WHERE id = ?");
        $stmt->execute([$myRole, $roomId]);
        echo json_encode(['ok' => true, 'correct' => $correct, 'won' => true]);
        return;
    }

    // Chuyển lượt
    $nextTurn = ($myRole === 'player1') ? 'player2' : 'player1';
    $now = round(microtime(true) * 1000);
    $stmt = $pdo->prepare("UPDATE rooms SET current_turn = ?, turn_start_time = ? WHERE id = ?");
    $stmt->execute([$nextTurn, $now, $roomId]);

    echo json_encode(['ok' => true, 'correct' => $correct, 'won' => false]);
}

// ============================================
// LẤY TRẠNG THÁI PHÒNG (polling)
// ============================================
function getRoom()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    if (!$roomId)
        return error('Missing room_id');

    $stmt = $pdo->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    if (!$room)
        return error('Phòng không tồn tại');

    // Clean up expired resume requests (> 10s)
    $now = round(microtime(true) * 1000);
    if ($room['is_paused']) {
        if ($room['resume_request_p1'] && ($now - $room['resume_request_p1']) > 10000) {
            $pdo->exec("UPDATE rooms SET resume_request_p1 = NULL WHERE id = " . (int)$roomId);
            $room['resume_request_p1'] = null;
        }
        if ($room['resume_request_p2'] && ($now - $room['resume_request_p2']) > 10000) {
            $pdo->exec("UPDATE rooms SET resume_request_p2 = NULL WHERE id = " . (int)$roomId);
            $room['resume_request_p2'] = null;
        }
    }

    // Auto-skip turn if timeout (> 61 seconds to allow network latency)
    if ($room['status'] === 'playing' && !$room['is_paused'] && $room['turn_start_time']) {
        if (($now - $room['turn_start_time']) > 61000) {
            $newTurn = ($room['current_turn'] === 'player1') ? 'player2' : 'player1';
            $pdo->exec("UPDATE rooms SET current_turn = '$newTurn', turn_start_time = $now WHERE id = " . (int)$roomId);
            $room['current_turn'] = $newTurn;
            $room['turn_start_time'] = $now;
        }
    }

    echo json_encode([
        'ok' => true,
        'room' => [
            'id' => (int) $room['id'],
            'player1_id' => $room['player1_id'],
            'player2_id' => $room['player2_id'],
            'player1_secret' => $room['player1_secret'] ? true : false,
            'player2_secret' => $room['player2_secret'] ? true : false,
            'current_turn' => $room['current_turn'],
            'turn_start_time' => $room['turn_start_time'] ? (int) $room['turn_start_time'] : null,
            'status' => $room['status'],
            'winner' => $room['winner'],
            'my_secret' => ($room['player1_id'] === $playerId) ? $room['player1_secret'] : (($room['player2_id'] === $playerId) ? $room['player2_secret'] : null),
            'is_paused' => $room['is_paused'] ? true : false,
            'player1_pauses' => (int)$room['player1_pauses'],
            'player2_pauses' => (int)$room['player2_pauses'],
            'resume_request_p1' => $room['resume_request_p1'] ? (int)$room['resume_request_p1'] : null,
            'resume_request_p2' => $room['resume_request_p2'] ? (int)$room['resume_request_p2'] : null,
        ]
    ]);
}

// ============================================
// LẤY LỊCH SỬ ĐOÁN
// ============================================
function getGuesses()
{
    global $pdo;
    $roomId = getParam('room_id');
    $afterId = getParam('after_id', 0);
    if (!$roomId)
        return error('Missing room_id');

    $stmt = $pdo->prepare("SELECT id, player, digits, correct FROM guesses WHERE room_id = ? AND id > ? ORDER BY id ASC");
    $stmt->execute([$roomId, $afterId]);
    $guesses = $stmt->fetchAll();

    echo json_encode(['ok' => true, 'guesses' => $guesses]);
}

// ============================================
// HUỶ PHÒNG
// ============================================
function cancelRoom()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    if (!$roomId)
        return error('Missing room_id');

    $stmt = $pdo->prepare("DELETE FROM rooms WHERE id = ? AND (player1_id = ? OR player2_id = ?)");
    $stmt->execute([$roomId, $playerId, $playerId]);

    echo json_encode(['ok' => true]);
}

// ============================================
// TẠM DỪNG GAME
// ============================================
function pauseGame()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    if (!$roomId || !$playerId) return error('Missing params');

    $stmt = $pdo->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    
    if (!$room || $room['status'] !== 'playing') return error('Không thể tạm dừng lúc này');
    if ($room['is_paused']) return error('Trò chơi đang dừng rồi');

    $myRole = ($room['player1_id'] === $playerId) ? 'player1' : (($room['player2_id'] === $playerId) ? 'player2' : null);
    if (!$myRole) return error('Bạn không ở trong phòng này');

    $pausesLeft = (int)$room[$myRole . '_pauses'];
    if ($pausesLeft <= 0) return error('Bạn đã hết số lần tạm dừng (tối đa 5 lần)');

    $now = round(microtime(true) * 1000);
    $stmt = $pdo->prepare("UPDATE rooms SET 
        is_paused = 1,
        {$myRole}_pauses = {$myRole}_pauses - 1,
        turn_pause_time = ?,
        resume_request_p1 = NULL,
        resume_request_p2 = NULL
        WHERE id = ?");
    $stmt->execute([$now, $roomId]);

    echo json_encode(['ok' => true]);
}

// ============================================
// TIẾP TỤC GAME
// ============================================
function resumeGame()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    if (!$roomId || !$playerId) return error('Missing params');

    $stmt = $pdo->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    
    if (!$room || $room['status'] !== 'playing') return error('Không hợp lệ');
    if (!$room['is_paused']) return error('Trò chơi đang không bị dừng');

    $myRole = ($room['player1_id'] === $playerId) ? 'player1' : (($room['player2_id'] === $playerId) ? 'player2' : null);
    if (!$myRole) return error('Bạn không ở trong phòng này');

    $now = round(microtime(true) * 1000);
    $reqField = 'resume_request_' . ($myRole === 'player1' ? 'p1' : 'p2');
    $otherReqField = 'resume_request_' . ($myRole === 'player1' ? 'p2' : 'p1');

    // Cập nhật request của tôi
    $stmt = $pdo->prepare("UPDATE rooms SET $reqField = ? WHERE id = ?");
    $stmt->execute([$now, $roomId]);

    // Lấy lại dữ liệu xem người kia đã request chưa
    $stmt = $pdo->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $updatedRoom = $stmt->fetch();

    $otherTime = $updatedRoom[$otherReqField];
    if ($otherTime && ($now - $otherTime) <= 10000) {
        $pauseDuration = $now - $updatedRoom['turn_pause_time'];
        
        $stmt = $pdo->prepare("UPDATE rooms SET 
            is_paused = 0,
            turn_start_time = turn_start_time + ?,
            turn_pause_time = NULL,
            resume_request_p1 = NULL,
            resume_request_p2 = NULL
            WHERE id = ?");
        $stmt->execute([$pauseDuration, $roomId]);
    }

    echo json_encode(['ok' => true]);
}

// ============================================
// BỎ LƯỢT GAME
// ============================================
function skipTurn()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    if (!$roomId || !$playerId) return error('Missing params');

    $stmt = $pdo->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    
    if (!$room || $room['status'] !== 'playing' || $room['is_paused']) return error('Chưa thể thao tác');
    $myRole = ($room['player1_id'] === $playerId) ? 'player1' : (($room['player2_id'] === $playerId) ? 'player2' : null);
    if ($room['current_turn'] !== $myRole) return error('Không phải lượt của bạn');

    $newTurn = ($myRole === 'player1') ? 'player2' : 'player1';
    $now = round(microtime(true) * 1000);
    $stmt = $pdo->prepare("UPDATE rooms SET current_turn = ?, turn_start_time = ? WHERE id = ?");
    $stmt->execute([$newTurn, $now, $roomId]);

    echo json_encode(['ok' => true]);
}

// ============================================
// ĐẦU HÀNG (Giải Mã Số)
// ============================================
function surrender()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    if (!$roomId || !$playerId) return error('Missing params');

    $stmt = $pdo->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    if (!$room || $room['status'] !== 'playing') return error('Không thể đầu hàng lúc này');

    $myRole = ($room['player1_id'] === $playerId) ? 'player1' : (($room['player2_id'] === $playerId) ? 'player2' : null);
    if (!$myRole) return error('Bạn không ở trong phòng này');

    $winner = ($myRole === 'player1') ? 'player2' : 'player1';
    $stmt = $pdo->prepare("UPDATE rooms SET status = 'finished', winner = ?, turn_start_time = NULL WHERE id = ?");
    $stmt->execute([$winner, $roomId]);

    echo json_encode(['ok' => true, 'winner' => $winner]);
}

// ============================================
// MASTERMIND CHECK — chỉ đếm tổng số đúng
// ============================================
function checkGuess($guess, $secret)
{
    $correct = 0;
    $secretUsed = array_fill(0, 4, false);

    for ($i = 0; $i < 4; $i++) {
        for ($j = 0; $j < 4; $j++) {
            if ($secretUsed[$j])
                continue;
            if ($guess[$i] === $secret[$j]) {
                $correct++;
                $secretUsed[$j] = true;
                break;
            }
        }
    }
    return $correct;
}

// ============================================
// ===== BATTLESHIP (HẢI CHIẾN) ENDPOINTS =====
// ============================================

// ─── Auto Migration for Battleship tables ───
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `bs_rooms` (
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
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `bs_ships` (
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
        KEY `idx_bs_room` (`room_id`)
    ) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `bs_shots` (
        `id` INT UNSIGNED AUTO_INCREMENT,
        `room_id` INT(3) UNSIGNED NOT NULL,
        `player` ENUM('player1','player2') NOT NULL,
        `row` TINYINT UNSIGNED NOT NULL,
        `col` TINYINT UNSIGNED NOT NULL,
        `is_hit` TINYINT(1) NOT NULL DEFAULT 0,
        `ship_id` VARCHAR(20) DEFAULT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_bs_room_shot` (`room_id`)
    ) ENGINE=InnoDB");
} catch (PDOException $e) { /* tables already exist */ }

// ============================================
// BS: TẠO PHÒNG
// ============================================
function bsCreateRoom()
{
    global $pdo;
    $playerId = getParam('player_id');
    if (!$playerId) return error('Missing player_id');

    $pdo->exec("DELETE FROM bs_rooms WHERE created_at < NOW() - INTERVAL 1 HOUR");

    $roomId = null;
    for ($i = 0; $i < 20; $i++) {
        $id = rand(100, 999);
        $stmt = $pdo->prepare("SELECT id FROM bs_rooms WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) { $roomId = $id; break; }
    }
    if (!$roomId) return error('Không thể tạo phòng');

    $stmt = $pdo->prepare("INSERT INTO bs_rooms (id, player1_id, status) VALUES (?, ?, 'waiting')");
    $stmt->execute([$roomId, $playerId]);

    echo json_encode(['ok' => true, 'room_id' => $roomId]);
}

// ============================================
// BS: VÀO PHÒNG
// ============================================
function bsJoinRoom()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    if (!$roomId || !$playerId) return error('Missing params');

    $stmt = $pdo->prepare("SELECT * FROM bs_rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    if (!$room) return error('Không tìm thấy phòng');
    if ($room['status'] !== 'waiting') return error('Phòng đã đầy');

    $stmt = $pdo->prepare("UPDATE bs_rooms SET player2_id = ?, status = 'placement' WHERE id = ?");
    $stmt->execute([$playerId, $roomId]);

    echo json_encode(['ok' => true, 'room_id' => (int)$roomId]);
}

// ============================================
// BS: ĐẶT TÀU
// ============================================
function bsPlaceShips()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    $ships = getParam('ships'); // JSON array of ships

    if (!$roomId || !$playerId || !$ships) return error('Missing params');

    $stmt = $pdo->prepare("SELECT * FROM bs_rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    if (!$room) return error('Phòng không tồn tại');

    $myRole = null;
    if ($room['player1_id'] === $playerId) $myRole = 'player1';
    elseif ($room['player2_id'] === $playerId) $myRole = 'player2';
    else return error('Bạn không ở trong phòng');

    $readyField = $myRole . '_ready';
    if ($room[$readyField]) return error('Bạn đã đặt tàu rồi');

    // Validate ships
    $expectedSizes = [5, 4, 3, 3, 2];
    if (count($ships) !== 5) return error('Cần đặt 5 tàu');

    $grid = array_fill(0, 10, array_fill(0, 10, false));

    foreach ($ships as $idx => $ship) {
        $size = (int)$ship['size'];
        $sr = (int)$ship['start_row'];
        $sc = (int)$ship['start_col'];
        $vert = !empty($ship['is_vertical']);

        if ($size !== $expectedSizes[$idx]) return error('Kích thước tàu không hợp lệ');

        // Check bounds + overlap
        for ($i = 0; $i < $size; $i++) {
            $r = $vert ? $sr + $i : $sr;
            $c = $vert ? $sc : $sc + $i;
            if ($r < 0 || $r >= 10 || $c < 0 || $c >= 10) return error('Tàu nằm ngoài bản đồ');
            if ($grid[$r][$c]) return error('Tàu bị đè lên nhau');
            $grid[$r][$c] = true;
        }
    }

    // Save ships to DB
    $pdo->prepare("DELETE FROM bs_ships WHERE room_id = ? AND player = ?")->execute([$roomId, $myRole]);

    $stmt = $pdo->prepare("INSERT INTO bs_ships (room_id, player, ship_id, ship_name, size, start_row, start_col, is_vertical) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($ships as $ship) {
        $stmt->execute([
            $roomId, $myRole,
            $ship['ship_id'], $ship['ship_name'], (int)$ship['size'],
            (int)$ship['start_row'], (int)$ship['start_col'],
            !empty($ship['is_vertical']) ? 1 : 0
        ]);
    }

    // Mark ready
    $pdo->prepare("UPDATE bs_rooms SET {$readyField} = 1 WHERE id = ?")->execute([$roomId]);

    // Check if both ready
    $stmt = $pdo->prepare("SELECT player1_ready, player2_ready FROM bs_rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $updated = $stmt->fetch();

    if ($updated['player1_ready'] && $updated['player2_ready']) {
        $pdo->prepare("UPDATE bs_rooms SET status = 'playing', current_turn = 'player1' WHERE id = ?")->execute([$roomId]);
    }

    echo json_encode(['ok' => true]);
}

// ============================================
// BS: LẤY TRẠNG THÁI PHÒNG
// ============================================
function bsGetRoom()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    if (!$roomId) return error('Missing room_id');

    $stmt = $pdo->prepare("SELECT * FROM bs_rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    if (!$room) return error('Phòng không tồn tại');

    $myRole = null;
    if ($room['player1_id'] === $playerId) $myRole = 'player1';
    elseif ($room['player2_id'] === $playerId) $myRole = 'player2';

    // Get sunk ships info for opponent
    $opponentRole = ($myRole === 'player1') ? 'player2' : 'player1';
    $stmt = $pdo->prepare("SELECT ship_id, ship_name, size, is_sunk FROM bs_ships WHERE room_id = ? AND player = ?");
    $stmt->execute([$roomId, $opponentRole]);
    $opponentShips = $stmt->fetchAll();

    // Get my ships (with positions)
    $stmt = $pdo->prepare("SELECT ship_id, ship_name, size, start_row, start_col, is_vertical, is_sunk FROM bs_ships WHERE room_id = ? AND player = ?");
    $stmt->execute([$roomId, $myRole]);
    $myShips = $stmt->fetchAll();

    echo json_encode([
        'ok' => true,
        'room' => [
            'id' => (int)$room['id'],
            'player1_id' => $room['player1_id'],
            'player2_id' => $room['player2_id'],
            'player1_ready' => (bool)$room['player1_ready'],
            'player2_ready' => (bool)$room['player2_ready'],
            'current_turn' => $room['current_turn'],
            'status' => $room['status'],
            'winner' => $room['winner'],
            'player1_hits' => (int)$room['player1_hits'],
            'player2_hits' => (int)$room['player2_hits'],
            'my_role' => $myRole,
            'my_ships' => $myShips,
            'opponent_ships' => $opponentShips,
        ]
    ]);
}

// ============================================
// BS: BẮN
// ============================================
function bsFire()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    $row = getParam('row');
    $col = getParam('col');

    if (!$roomId || !$playerId || $row === null || $col === null) return error('Missing params');
    $row = (int)$row;
    $col = (int)$col;
    if ($row < 0 || $row >= 10 || $col < 0 || $col >= 10) return error('Vị trí không hợp lệ');

    $stmt = $pdo->prepare("SELECT * FROM bs_rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    if (!$room || $room['status'] !== 'playing') return error('Game chưa bắt đầu');

    $myRole = null;
    if ($room['player1_id'] === $playerId) $myRole = 'player1';
    elseif ($room['player2_id'] === $playerId) $myRole = 'player2';
    else return error('Bạn không ở trong phòng');

    if ($room['current_turn'] !== $myRole) return error('Chưa đến lượt bạn');

    // Check already shot
    $stmt = $pdo->prepare("SELECT id FROM bs_shots WHERE room_id = ? AND player = ? AND `row` = ? AND `col` = ?");
    $stmt->execute([$roomId, $myRole, $row, $col]);
    if ($stmt->fetch()) return error('Bạn đã bắn ô này rồi');

    // Check hit
    $opponentRole = ($myRole === 'player1') ? 'player2' : 'player1';
    $stmt = $pdo->prepare("SELECT * FROM bs_ships WHERE room_id = ? AND player = ?");
    $stmt->execute([$roomId, $opponentRole]);
    $ships = $stmt->fetchAll();

    $isHit = false;
    $hitShipId = null;
    $hitShipName = null;
    $shipSunk = false;

    foreach ($ships as $ship) {
        $sr = (int)$ship['start_row'];
        $sc = (int)$ship['start_col'];
        $sz = (int)$ship['size'];
        $vert = (bool)$ship['is_vertical'];

        for ($i = 0; $i < $sz; $i++) {
            $cr = $vert ? $sr + $i : $sr;
            $cc = $vert ? $sc : $sc + $i;
            if ($cr === $row && $cc === $col) {
                $isHit = true;
                $hitShipId = $ship['ship_id'];
                $hitShipName = $ship['ship_name'];
                break 2;
            }
        }
    }

    // Record shot
    $stmt = $pdo->prepare("INSERT INTO bs_shots (room_id, player, `row`, `col`, is_hit, ship_id) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->execute([$roomId, $myRole, $row, $col, $isHit ? 1 : 0, $hitShipId]);

    $result = ['ok' => true, 'is_hit' => $isHit, 'ship_sunk' => false, 'ship_name' => null, 'won' => false];

    if ($isHit) {
        // Update hit count
        $hitsField = $myRole . '_hits';
        $pdo->prepare("UPDATE bs_rooms SET {$hitsField} = {$hitsField} + 1 WHERE id = ?")->execute([$roomId]);

        // Check if ship sunk: all cells of this ship hit?
        $targetShip = null;
        foreach ($ships as $ship) {
            if ($ship['ship_id'] === $hitShipId) { $targetShip = $ship; break; }
        }

        if ($targetShip) {
            $allHit = true;
            $sr = (int)$targetShip['start_row'];
            $sc = (int)$targetShip['start_col'];
            $sz = (int)$targetShip['size'];
            $vert = (bool)$targetShip['is_vertical'];

            for ($i = 0; $i < $sz; $i++) {
                $cr = $vert ? $sr + $i : $sr;
                $cc = $vert ? $sc : $sc + $i;
                if ($cr === $row && $cc === $col) continue; // current shot
                $stmt = $pdo->prepare("SELECT id FROM bs_shots WHERE room_id = ? AND player = ? AND `row` = ? AND `col` = ? AND is_hit = 1");
                $stmt->execute([$roomId, $myRole, $cr, $cc]);
                if (!$stmt->fetch()) { $allHit = false; break; }
            }

            if ($allHit) {
                $pdo->prepare("UPDATE bs_ships SET is_sunk = 1 WHERE room_id = ? AND player = ? AND ship_id = ?")->execute([$roomId, $opponentRole, $hitShipId]);
                $result['ship_sunk'] = true;
                $result['ship_name'] = $hitShipName;
            }
        }

        // Check win (17 hits total)
        $stmt = $pdo->prepare("SELECT {$hitsField} FROM bs_rooms WHERE id = ?");
        $stmt->execute([$roomId]);
        $currentHits = (int)$stmt->fetchColumn();

        if ($currentHits >= 17) {
            $pdo->prepare("UPDATE bs_rooms SET status = 'finished', winner = ? WHERE id = ?")->execute([$myRole, $roomId]);
            $result['won'] = true;
        }
        // HIT = same player continues (don't switch turn)
    } else {
        // MISS = switch turn
        $nextTurn = ($myRole === 'player1') ? 'player2' : 'player1';
        $pdo->prepare("UPDATE bs_rooms SET current_turn = ? WHERE id = ?")->execute([$nextTurn, $roomId]);
    }

    echo json_encode($result);
}

// ============================================
// BS: LẤY LỊCH SỬ BẮN
// ============================================
function bsGetShots()
{
    global $pdo;
    $roomId = getParam('room_id');
    $afterId = getParam('after_id', 0);
    if (!$roomId) return error('Missing room_id');

    $stmt = $pdo->prepare("SELECT id, player, `row`, `col`, is_hit, ship_id FROM bs_shots WHERE room_id = ? AND id > ? ORDER BY id ASC");
    $stmt->execute([$roomId, $afterId]);
    $shots = $stmt->fetchAll();

    echo json_encode(['ok' => true, 'shots' => $shots]);
}

// ============================================
// BS: HUỶ PHÒNG
// ============================================
function bsCancelRoom()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    if (!$roomId) return error('Missing room_id');

    $pdo->prepare("DELETE FROM bs_rooms WHERE id = ? AND (player1_id = ? OR player2_id = ?)")->execute([$roomId, $playerId, $playerId]);
    echo json_encode(['ok' => true]);
}

// ============================================
// BS: ĐẦU HÀNG
// ============================================
function bsSurrender()
{
    global $pdo;
    $roomId = getParam('room_id');
    $playerId = getParam('player_id');
    if (!$roomId || !$playerId) return error('Missing params');

    $stmt = $pdo->prepare("SELECT * FROM bs_rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    if (!$room || $room['status'] !== 'playing') return error('Không thể đầu hàng lúc này');

    $myRole = null;
    if ($room['player1_id'] === $playerId) $myRole = 'player1';
    elseif ($room['player2_id'] === $playerId) $myRole = 'player2';
    else return error('Bạn không ở trong phòng này');

    $winner = ($myRole === 'player1') ? 'player2' : 'player1';
    $pdo->prepare("UPDATE bs_rooms SET status = 'finished', winner = ? WHERE id = ?")->execute([$winner, $roomId]);

    echo json_encode(['ok' => true, 'winner' => $winner]);
}

// ============================================
// HELPERS
// ============================================
function getParam($name, $default = null)
{
    global $_JSON;
    if (isset($_POST[$name]))
        return $_POST[$name];
    if (isset($_GET[$name]))
        return $_GET[$name];
    return $_JSON[$name] ?? $default;
}

function error($msg)
{
    echo json_encode(['error' => $msg]);
}

