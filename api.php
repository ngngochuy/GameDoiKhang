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
} catch (PDOException $e) {
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

// ─── Router ───
$action = $_GET['action'] ?? $_POST['action'] ?? '';

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

    $stmt = $pdo->prepare("INSERT INTO rooms (id, player1_id, status) VALUES (?, ?, 'waiting')");
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
    if (!$roomId)
        return error('Missing room_id');

    $stmt = $pdo->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    if (!$room)
        return error('Phòng không tồn tại');

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
// HELPERS
// ============================================
function getParam($name, $default = null)
{
    if (isset($_POST[$name]))
        return $_POST[$name];
    if (isset($_GET[$name]))
        return $_GET[$name];
    // JSON body
    $json = json_decode(file_get_contents('php://input'), true);
    return $json[$name] ?? $default;
}

function error($msg)
{
    echo json_encode(['error' => $msg]);
}
