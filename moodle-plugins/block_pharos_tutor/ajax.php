<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

/**
 * AJAX proxy: forwards /api/tutor/chat requests to the Node.js middleware,
 * injecting the MOODLE_SECRET on the server side so it never reaches the browser.
 */

define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');

require_login();

// The request uses Content-Type: application/json so $_POST is empty.
// Read the raw body first, then validate sesskey from the parsed JSON.
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    die();
}

if (empty($data['sesskey']) || !confirm_sesskey($data['sesskey'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid session key']);
    die();
}

$middlewareUrl = get_config('block_pharos_tutor', 'middleware_url');
$secret        = get_config('block_pharos_tutor', 'moodle_secret');

if (empty($middlewareUrl) || empty($secret)) {
    http_response_code(503);
    echo json_encode(['error' => 'Middleware not configured']);
    die();
}

// Force userId to the authenticated user — never trust the browser for this.
$data['userId'] = (string) $USER->id;

$level = isset($data['level']) ? (int) $data['level'] : 1;
$data['level'] = max(1, min(3, $level));

$allowedLangs = ['es', 'it'];
$data['lang']  = in_array($data['lang'] ?? '', $allowedLangs, true) ? $data['lang'] : 'es';

// Load learner memory from DB and inject server-side — never expose to browser.
$learnerMemory = null;
// courseId can come as 'courseId' or 'course_id' depending on caller.
$courseId = (int) ($data['courseId'] ?? $data['course_id'] ?? 0);
if ($courseId > 0) {
    try {
        if ($DB->get_manager()->table_exists('block_pharos_tutor_memory')) {
            $memRow = $DB->get_record('block_pharos_tutor_memory', [
                'userid'   => $USER->id,
                'courseid' => $courseId,
            ], 'profile_json');
            if ($memRow && $memRow->profile_json) {
                $learnerMemory = json_decode($memRow->profile_json, true) ?: null;
            }
        }
    } catch (Exception $e) {
        // Memory table not yet installed; tutor works without it.
    }
}

// Whitelist keys before forwarding — never relay unknown browser-supplied fields.
$payload = [
    'userId'        => $data['userId'],
    'level'         => $data['level'],
    'lang'          => $data['lang'],
    'messages'      => is_array($data['messages'] ?? null) ? $data['messages'] : [],
    'learnerMemory' => $learnerMemory,
];

// Forward to middleware.
$ch = curl_init(rtrim($middlewareUrl, '/') . '/api/tutor/chat');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $secret,
    ],
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    echo json_encode(['error' => 'Could not reach AI middleware']);
    die();
}

http_response_code($httpCode);
header('Content-Type: application/json');
echo $response;
