<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

$file = __DIR__ . '/_signups/signups.json';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $email = filter_var(trim($input['email'] ?? ''), FILTER_VALIDATE_EMAIL);
    $platform = preg_replace('/[^a-z]/', '', strtolower($input['platform'] ?? 'both'));

    if (!$email) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid email']);
        exit;
    }

    if (!in_array($platform, ['ios', 'android', 'both'])) {
        $platform = 'both';
    }

    if (!is_dir(__DIR__ . '/_signups')) {
        mkdir(__DIR__ . '/_signups', 0755, true);
    }

    $signups = [];
    if (file_exists($file)) {
        $signups = json_decode(file_get_contents($file), true) ?: [];
    }

    foreach ($signups as $s) {
        if ($s['email'] === $email) {
            echo json_encode(['ok' => true, 'msg' => 'Already signed up']);
            exit;
        }
    }

    $signups[] = [
        'email' => $email,
        'platform' => $platform,
        'date' => date('c'),
        'ip' => $_SERVER['REMOTE_ADDR']
    ];

    file_put_contents($file, json_encode($signups, JSON_PRETTY_PRINT));
    echo json_encode(['ok' => true, 'msg' => 'Signed up']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['list'])) {
    if (!file_exists($file)) {
        echo json_encode([]);
        exit;
    }
    echo file_get_contents($file);
    exit;
}

echo json_encode(['error' => 'POST an email and platform']);
