<?php
/**
 * MojAbble - Global Leaderboard Backend
 *
 * Drop next to index.html on any PHP server.
 * Creates _scores/ folder for flat-file JSON storage.
 * No database, no dependencies, no accounts.
 *
 * API:
 *   GET  ?action=scores              -> { scores: [...], rare: [...] }
 *   GET  ?action=daily&date=Y-m-d    -> { scores: [...] } for that day's seeded board
 *   POST ?action=submit              -> { name, score, ... } -> { ok, rank }
 *                                       (with m=daily & dd=Y-m-d, also stored on that day's board)
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$dir = __DIR__ . '/_scores';
if (!is_dir($dir)) { mkdir($dir, 0755, true); }

$scoresFile = "$dir/scores.json";
$rareFile   = "$dir/rare.json";
$rateFile   = "$dir/rate.json";

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

// Rate limit: 1 submission per 5 seconds per IP
function checkRate() {
    global $rateFile;
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $rates = readJSON($rateFile) ?? [];
    $now = time();

    // Clean entries older than 60 seconds
    foreach ($rates as $k => $t) {
        if ($now - $t > 60) unset($rates[$k]);
    }

    if (isset($rates[$ip]) && $now - $rates[$ip] < 5) {
        return false;
    }

    $rates[$ip] = $now;
    writeJSON($rateFile, $rates);
    return true;
}

// Sanitize player name
function cleanName($name) {
    $name = trim($name);
    $name = preg_replace('/[^\w\s\-.]/', '', $name);
    $name = substr($name, 0, 16);
    return $name ?: 'Anonymous';
}

$action = $_GET['action'] ?? 'scores';

switch ($action) {

    case 'scores':
        $scores = readJSON($scoresFile) ?? [];
        $rare   = readJSON($rareFile) ?? [];
        echo json_encode(['scores' => $scores, 'rare' => $rare]);
        break;

    case 'daily':
        $date = $_GET['date'] ?? '';
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid date']);
            exit;
        }
        $daily = readJSON("$dir/daily_$date.json") ?? [];
        echo json_encode(['scores' => $daily]);
        break;

    case 'submit':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid JSON']);
            exit;
        }

        // Rate limit
        if (!checkRate()) {
            http_response_code(429);
            echo json_encode(['error' => 'Too fast']);
            exit;
        }

        // Validate required fields
        $score = (int)($input['s'] ?? 0);
        $name  = cleanName($input['n'] ?? '');
        $words = (int)($input['w'] ?? 0);
        $bestWord = substr(preg_replace('/[^A-Z]/', '', strtoupper($input['bw'] ?? '')), 0, 30);
        $bestWordScore = (int)($input['bws'] ?? 0);
        $maxCombo = (int)($input['mc'] ?? 0);
        $diff = in_array($input['d'] ?? '', ['easy','normal','hard']) ? $input['d'] : 'normal';

        // Basic sanity checks
        if ($score < 1 || $score > 999999) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid score']);
            exit;
        }
        if ($words < 1 || $words > 500) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid word count']);
            exit;
        }
        if ($maxCombo < 0 || $maxCombo > 200) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid combo']);
            exit;
        }

        $entry = [
            'n'  => $name,
            's'  => $score,
            'w'  => $words,
            'bw' => $bestWord,
            'bws'=> $bestWordScore,
            'mc' => $maxCombo,
            'd'  => $diff,
            'dt' => date('Y-m-d'),
            'ts' => time()
        ];

        // Daily challenge entry: also store on that day's board
        $mode = $input['m'] ?? '';
        $dd = $input['dd'] ?? '';
        if ($mode === 'daily' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dd)) {
            $dailyFile = "$dir/daily_$dd.json";
            $daily = readJSON($dailyFile) ?? [];
            $daily[] = $entry;
            usort($daily, function($a, $b) { return $b['s'] - $a['s']; });
            $daily = array_slice($daily, 0, 50);
            writeJSON($dailyFile, $daily);
        }

        // Insert into scores list, keep top 50
        $scores = readJSON($scoresFile) ?? [];
        $scores[] = $entry;
        usort($scores, function($a, $b) { return $b['s'] - $a['s']; });
        $scores = array_slice($scores, 0, 50);
        writeJSON($scoresFile, $scores);

        // Find rank (0-indexed, -1 if not in top 50)
        $rank = -1;
        for ($i = 0; $i < count($scores); $i++) {
            if ($scores[$i]['ts'] === $entry['ts'] && $scores[$i]['n'] === $entry['n'] && $scores[$i]['s'] === $entry['s']) {
                $rank = $i;
                break;
            }
        }

        // Handle rare word submission
        if (!empty($input['rw']) && !empty($input['rr'])) {
            $rareWord = substr(preg_replace('/[^A-Z]/', '', strtoupper($input['rw'])), 0, 30);
            $rareScore = (int)$input['rr'];
            if ($rareWord && $rareScore > 0 && $rareScore < 9999) {
                $rare = readJSON($rareFile) ?? [];
                // Only add if this word isn't already on the board
                $exists = false;
                foreach ($rare as $r) {
                    if ($r['w'] === $rareWord) { $exists = true; break; }
                }
                if (!$exists) {
                    $rare[] = [
                        'w'  => $rareWord,
                        'r'  => $rareScore,
                        'n'  => $name,
                        'd'  => $diff,
                        'dt' => date('Y-m-d')
                    ];
                    usort($rare, function($a, $b) { return $b['r'] - $a['r']; });
                    $rare = array_slice($rare, 0, 50);
                    writeJSON($rareFile, $rare);
                }
            }
        }

        echo json_encode(['ok' => true, 'rank' => $rank]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
}
