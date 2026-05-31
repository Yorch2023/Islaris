<?php
/**
 * Quick diagnostic: tests the generator middleware directly (admin-only, no sesskey).
 * Access: http://localhost/blocks/pharos_teacher/test-generator.php
 * DELETE this file before going to production.
 */
define('NO_MOODLE_COOKIES', true);
require_once(__DIR__ . '/../../config.php');

require_login();
require_capability('moodle/site:config', context_system::instance());

header('Content-Type: text/plain; charset=utf-8');

$middlewareUrl = get_config('block_pharos_tutor', 'middleware_url');
$secret        = get_config('block_pharos_tutor', 'moodle_secret');

echo "=== PHAROS Generator Diagnostic ===\n\n";
echo "Middleware URL : " . ($middlewareUrl ?: '(not set)') . "\n";
echo "Secret set     : " . ($secret ? 'YES (' . strlen($secret) . ' chars)' : 'NO') . "\n\n";

if (empty($middlewareUrl) || empty($secret)) {
    echo "ERROR: Middleware not configured in block settings.\n";
    exit;
}

$payload = json_encode([
    'userId' => '1',
    'level'  => 1,
    'topic'  => 'Test: sesgos algoritmicos',
    'lang'   => 'es',
]);

echo "Sending to: " . rtrim($middlewareUrl, '/') . "/api/generator/activity\n";
echo "Payload: $payload\n\n";

$ch = curl_init(rtrim($middlewareUrl, '/') . '/api/generator/activity');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $secret,
    ],
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_SSL_VERIFYPEER => false,
]);

$response  = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

echo "HTTP status : $httpCode\n";
echo "cURL error  : " . ($curlError ?: 'none') . "\n\n";
echo "--- Response body ---\n";
echo $response ? $response : '(empty)';
echo "\n";
