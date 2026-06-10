<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

/**
 * SSE streaming proxy: forwards /api/tutor/stream requests to the Node.js
 * middleware and passes SSE chunks through to the browser.
 * The MOODLE_SECRET is injected server-side and never reaches the client.
 */

define('AJAX_SCRIPT', true);
define('NO_MOODLE_COOKIES', false);

require_once(__DIR__ . '/../../config.php');

require_login();

// CSRF: validate sesskey from the POST body before starting the stream.
$sesskey = required_param('sesskey', PARAM_ALPHANUM);
if (!confirm_sesskey($sesskey)) {
    http_response_code(403);
    echo "data: " . json_encode(['error' => 'Invalid session key']) . "\n\n";
    die();
}

$middlewareUrl = get_config('block_pharos_tutor', 'middleware_url');
$secret        = get_config('block_pharos_tutor', 'moodle_secret');

if (empty($middlewareUrl) || empty($secret)) {
    http_response_code(503);
    echo "data: " . json_encode(['error' => 'Middleware not configured']) . "\n\n";
    die();
}

// Read and validate incoming JSON.
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo "data: " . json_encode(['error' => 'Invalid JSON']) . "\n\n";
    die();
}

// Force userId to authenticated user.
$data['userId'] = (string) $USER->id;
$data['level']  = max(1, min(3, (int) ($data['level'] ?? 1)));
$data['lang']   = in_array($data['lang'] ?? '', ['es', 'it'], true) ? $data['lang'] : 'es';
unset($data['sesskey']); // Already validated above.

// Disable all output buffering so chunks reach the browser immediately.
while (ob_get_level() > 0) {
    ob_end_flush();
}

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Accel-Buffering: no'); // Tell Nginx not to buffer.
header('Connection: keep-alive');

$postBody = json_encode($data);

$ch = curl_init(rtrim($middlewareUrl, '/') . '/api/tutor/stream');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $postBody,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $secret,
    ],
    CURLOPT_TIMEOUT        => 120,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_WRITEFUNCTION  => function ($ch, $chunk) {
        echo $chunk;
        if (ob_get_level() > 0) {
            ob_flush();
        }
        flush();
        return strlen($chunk);
    },
]);

$ok       = curl_exec($ch);
$curlError = curl_error($ch);
curl_close($ch);

if (!$ok && $curlError) {
    echo "data: " . json_encode(['error' => 'Could not reach AI middleware']) . "\n\n";
    flush();
}
