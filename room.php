<?php
/**
 * MojAbble - Multiplayer Room Backend
 *
 * Head-to-head race mode: both players get the same seeded board,
 * play simultaneously, poll each other's score live.
 *
 * API:
 *   POST ?action=create   -> body: { name, difficulty }       -> { room, seed, playerId }
 *   POST ?action=join      -> body: { name, room }            -> { ok, seed, difficulty, opponent, playerId }
 *   GET  ?action=poll&room=XXXX&player=ID                     -> { opponent, status, countdown }
 *   POST ?action=update    -> body: { room, player, score, words, bestWord, bestWordScore, maxCombo }
 *   POST ?action=finish    -> body: { room, player, score, words, bestWord, bestWordScore, maxCombo }
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$dir = __DIR__ . '/_rooms';
if (!is_dir($dir)) { mkdir($dir, 0755, true); }

// --- Helpers ---

function readJSON($path) {
    if (!file_exists($path)) return null;
    $fp = fopen($path, 'r');
    if (!$fp) return null;
    flock($fp, LOCK_SH);
    $raw = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return json_decode($raw, true);
}

function writeJSON($path, $data) {
    $fp = fopen($path, 'c');
    if (!$fp) return false;
    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return true;
}

function roomPath($code) {
    global $dir;
    $safe = preg_replace('/[^A-Z0-9]/', '', strtoupper($code));
    return "$dir/$safe.json";
}

function generateCode() {
    $chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    $code = '';
    for ($i = 0; $i < 4; $i++) {
        $code .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $code;
}

function generatePlayerId() {
    return bin2hex(random_bytes(8));
}

function cleanName($name) {
    $name = trim($name);
    $name = preg_replace('/[^\w\s\-.]/', '', $name);
    $name = substr($name, 0, 16);
    return $name ?: 'Anonymous';
}

// Clean up rooms older than 30 minutes (run occasionally)
function cleanupStaleRooms() {
    global $dir;
    $now = time();
    $files = glob("$dir/*.json");
    $cleaned = 0;
    foreach ($files as $f) {
        $room = readJSON($f);
        if (!$room) { unlink($f); $cleaned++; continue; }
        // Remove rooms older than 30 minutes
        if ($now - ($room['created'] ?? 0) > 1800) {
            unlink($f);
            $cleaned++;
        }
    }
    return $cleaned;
}

// Run cleanup ~5% of requests
if (random_int(1, 20) === 1) {
    cleanupStaleRooms();
}

$action = $_GET['action'] ?? '';

switch ($action) {

    case 'create':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid JSON']);
            exit;
        }

        $name = cleanName($input['name'] ?? '');
        $diff = in_array($input['difficulty'] ?? '', ['easy','normal','hard']) ? $input['difficulty'] : 'normal';

        // Generate unique room code
        $code = '';
        for ($attempts = 0; $attempts < 20; $attempts++) {
            $candidate = generateCode();
            if (!file_exists(roomPath($candidate))) {
                $code = $candidate;
                break;
            }
        }
        if (!$code) {
            http_response_code(500);
            echo json_encode(['error' => 'Could not generate room code']);
            exit;
        }

        $seed = random_int(1, 2147483647);
        $playerId = generatePlayerId();

        $room = [
            'code'       => $code,
            'seed'       => $seed,
            'difficulty'  => $diff,
            'status'     => 'waiting',  // waiting, playing, finished
            'created'    => time(),
            'countdown'  => null,       // timestamp when countdown started
            'players'    => [
                $playerId => [
                    'name'     => $name,
                    'score'    => 0,
                    'words'    => 0,
                    'bestWord' => '',
                    'bestWordScore' => 0,
                    'maxCombo' => 0,
                    'status'   => 'waiting',
                    'lastSeen' => time(),
                    'slot'     => 1
                ]
            ]
        ];

        writeJSON(roomPath($code), $room);
        echo json_encode([
            'room'     => $code,
            'seed'     => $seed,
            'playerId' => $playerId
        ]);
        break;

    case 'join':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || empty($input['room'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing room code']);
            exit;
        }

        $code = strtoupper(trim($input['room']));
        $name = cleanName($input['name'] ?? '');
        $path = roomPath($code);
        $room = readJSON($path);

        if (!$room) {
            http_response_code(404);
            echo json_encode(['error' => 'Room not found']);
            exit;
        }

        if ($room['status'] !== 'waiting') {
            http_response_code(409);
            echo json_encode(['error' => 'Game already in progress']);
            exit;
        }

        if (count($room['players']) >= 2) {
            http_response_code(409);
            echo json_encode(['error' => 'Room is full']);
            exit;
        }

        $playerId = generatePlayerId();

        // Find opponent name
        $opponentName = 'Opponent';
        foreach ($room['players'] as $p) {
            $opponentName = $p['name'];
        }

        $room['players'][$playerId] = [
            'name'     => $name,
            'score'    => 0,
            'words'    => 0,
            'bestWord' => '',
            'bestWordScore' => 0,
            'maxCombo' => 0,
            'status'   => 'ready',
            'lastSeen' => time(),
            'slot'     => 2
        ];

        // Both players present -> start game
        $room['status'] = 'playing';
        foreach ($room['players'] as &$p) {
            $p['status'] = 'playing';
        }
        unset($p);

        writeJSON($path, $room);

        echo json_encode([
            'ok'         => true,
            'seed'       => $room['seed'],
            'difficulty'  => $room['difficulty'],
            'opponent'   => $opponentName,
            'playerId'   => $playerId
        ]);
        break;

    case 'poll':
        $code = strtoupper(trim($_GET['room'] ?? ''));
        $playerId = $_GET['player'] ?? '';
        $path = roomPath($code);
        $room = readJSON($path);

        if (!$room) {
            http_response_code(404);
            echo json_encode(['error' => 'Room not found']);
            exit;
        }

        // Update last seen
        if (isset($room['players'][$playerId])) {
            $room['players'][$playerId]['lastSeen'] = time();
            writeJSON($path, $room);
        }

        // Build opponent info
        $opponent = null;
        foreach ($room['players'] as $pid => $p) {
            if ($pid !== $playerId) {
                $opponent = [
                    'name'     => $p['name'],
                    'score'    => $p['score'],
                    'words'    => $p['words'],
                    'status'   => $p['status'],
                    'bestWord' => $p['bestWord'],
                    'bestWordScore' => $p['bestWordScore'],
                    'maxCombo' => $p['maxCombo']
                ];
                break;
            }
        }

        // Calculate countdown remaining
        $countdown = null;
        if ($room['countdown']) {
            $remaining = 30 - (time() - $room['countdown']);
            if ($remaining <= 0) {
                // Time's up - force finish
                $room['status'] = 'finished';
                foreach ($room['players'] as &$p) {
                    if ($p['status'] === 'playing') $p['status'] = 'finished';
                }
                unset($p);
                writeJSON($path, $room);
                $countdown = 0;
            } else {
                $countdown = $remaining;
            }
        }

        // Check for disconnected opponent (no poll in 15s)
        $opponentDisconnected = false;
        if ($opponent) {
            foreach ($room['players'] as $pid => $p) {
                if ($pid !== $playerId && (time() - $p['lastSeen']) > 15) {
                    $opponentDisconnected = true;
                    break;
                }
            }
        }

        echo json_encode([
            'status'    => $room['status'],
            'opponent'  => $opponent,
            'countdown' => $countdown,
            'disconnected' => $opponentDisconnected
        ]);
        break;

    case 'update':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || empty($input['room']) || empty($input['player'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing fields']);
            exit;
        }

        $code = strtoupper(trim($input['room']));
        $playerId = $input['player'];
        $path = roomPath($code);
        $room = readJSON($path);

        if (!$room || !isset($room['players'][$playerId])) {
            http_response_code(404);
            echo json_encode(['error' => 'Room or player not found']);
            exit;
        }

        // Update player stats
        $room['players'][$playerId]['score'] = (int)($input['score'] ?? 0);
        $room['players'][$playerId]['words'] = (int)($input['words'] ?? 0);
        $room['players'][$playerId]['bestWord'] = substr(preg_replace('/[^A-Z]/', '', strtoupper($input['bestWord'] ?? '')), 0, 30);
        $room['players'][$playerId]['bestWordScore'] = (int)($input['bestWordScore'] ?? 0);
        $room['players'][$playerId]['maxCombo'] = (int)($input['maxCombo'] ?? 0);
        $room['players'][$playerId]['lastSeen'] = time();

        writeJSON($path, $room);
        echo json_encode(['ok' => true]);
        break;

    case 'finish':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || empty($input['room']) || empty($input['player'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing fields']);
            exit;
        }

        $code = strtoupper(trim($input['room']));
        $playerId = $input['player'];
        $path = roomPath($code);
        $room = readJSON($path);

        if (!$room || !isset($room['players'][$playerId])) {
            http_response_code(404);
            echo json_encode(['error' => 'Room or player not found']);
            exit;
        }

        // Update final stats
        $room['players'][$playerId]['score'] = (int)($input['score'] ?? 0);
        $room['players'][$playerId]['words'] = (int)($input['words'] ?? 0);
        $room['players'][$playerId]['bestWord'] = substr(preg_replace('/[^A-Z]/', '', strtoupper($input['bestWord'] ?? '')), 0, 30);
        $room['players'][$playerId]['bestWordScore'] = (int)($input['bestWordScore'] ?? 0);
        $room['players'][$playerId]['maxCombo'] = (int)($input['maxCombo'] ?? 0);
        $room['players'][$playerId]['status'] = 'finished';
        $room['players'][$playerId]['lastSeen'] = time();

        // Check if both players finished
        $allFinished = true;
        foreach ($room['players'] as $p) {
            if ($p['status'] === 'playing') {
                $allFinished = false;
                break;
            }
        }

        if ($allFinished) {
            $room['status'] = 'finished';
        } else if (!$room['countdown']) {
            // Start 30-second countdown for the other player
            $room['countdown'] = time();
        }

        writeJSON($path, $room);

        echo json_encode([
            'ok'       => true,
            'finished' => $allFinished
        ]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
}
