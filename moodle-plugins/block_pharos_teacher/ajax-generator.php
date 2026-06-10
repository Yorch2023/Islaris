<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

/**
 * AJAX proxy: forwards /api/generator/activity requests to the Node.js middleware,
 * injecting MOODLE_SECRET server-side so it never reaches the browser.
 */

define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');

require_login();

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

$courseId = isset($data['courseid']) ? (int) $data['courseid'] : 0;

if ($courseId < 1) {
    http_response_code(400);
    echo json_encode(['error' => 'courseid missing or invalid']);
    die();
}

try {
    $context = context_course::instance($courseId);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid course: ' . $e->getMessage()]);
    die();
}

require_capability('block/pharos_teacher:view', $context);

$middlewareUrl = get_config('block_pharos_tutor', 'middleware_url');
$secret        = get_config('block_pharos_tutor', 'moodle_secret');

if (empty($middlewareUrl) || empty($secret)) {
    http_response_code(503);
    echo json_encode(['error' => 'Middleware not configured']);
    die();
}

// Force server-side values — never trust the browser for identity.
$data['userId'] = (string) $USER->id;
$data['level']  = max(1, min(3, (int) ($data['level'] ?? 1)));

$allowedLangs = ['es', 'it'];
$data['lang'] = in_array($data['lang'] ?? '', $allowedLangs, true) ? $data['lang'] : 'es';

if (empty($data['topic']) || !is_string($data['topic'])) {
    http_response_code(400);
    echo json_encode(['error' => 'topic is required']);
    die();
}
$data['topic'] = substr(trim($data['topic']), 0, 500);

if (!empty($data['objective'])) {
    $data['objective'] = substr(trim((string) $data['objective']), 0, 300);
}

// Strip any extra keys the browser might send.
$payload = array_intersect_key($data, array_flip(['userId', 'level', 'topic', 'objective', 'lang']));

$ch = curl_init(rtrim($middlewareUrl, '/') . '/api/generator/activity');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $secret,
    ],
    CURLOPT_TIMEOUT        => 90,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response  = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    echo json_encode(['error' => 'No se pudo contactar con el middleware: ' . $curlError]);
    die();
}

$decoded = json_decode($response, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(502);
    echo json_encode(['error' => 'Middleware devolvió respuesta no válida (HTTP ' . $httpCode . ')']);
    die();
}

http_response_code($httpCode);
header('Content-Type: application/json');
echo $response;
