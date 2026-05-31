<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

/**
 * AJAX proxy: forwards /api/generator/export requests to the Node.js middleware.
 * Returns the file (HTML or DOCX) directly to the browser as a download.
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
    echo json_encode(['error' => 'Invalid course']);
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

$allowedFormats = ['html', 'docx'];
$allowedLangs   = ['es', 'it'];

$format = in_array($data['format'] ?? '', $allowedFormats, true) ? $data['format'] : null;
$lang   = in_array($data['lang']   ?? '', $allowedLangs,   true) ? $data['lang']   : 'es';

if (!$format) {
    http_response_code(400);
    echo json_encode(['error' => 'format must be html or docx']);
    die();
}

if (empty($data['activity']) || !is_string($data['activity'])) {
    http_response_code(400);
    echo json_encode(['error' => 'activity is required']);
    die();
}

$payload = [
    'userId'   => (string) $USER->id,
    'activity' => $data['activity'],
    'format'   => $format,
    'lang'     => $lang,
];

$responseBody = '';
$responseHeaders = [];

$ch = curl_init(rtrim($middlewareUrl, '/') . '/api/generator/export');
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
    CURLOPT_HEADERFUNCTION => function ($ch, $header) use (&$responseHeaders) {
        $responseHeaders[] = rtrim($header);
        return strlen($header);
    },
]);

$responseBody = curl_exec($ch);
$httpCode     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError    = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Could not reach AI middleware']);
    die();
}

http_response_code($httpCode);

// Forward Content-Type and Content-Disposition from middleware.
foreach ($responseHeaders as $header) {
    $lower = strtolower($header);
    if (str_starts_with($lower, 'content-type:') || str_starts_with($lower, 'content-disposition:')) {
        header($header);
    }
}

echo $responseBody;
