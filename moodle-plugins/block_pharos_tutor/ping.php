<?php
/**
 * Diagnostic endpoint — admin only.
 * Access: http://localhost/blocks/pharos_tutor/ping.php
 * Shows exactly what is failing in the Moodle → middleware chain.
 */
require_once(__DIR__ . '/../../config.php');
require_login();
require_capability('moodle/site:config', context_system::instance());

header('Content-Type: text/plain; charset=utf-8');

$middlewareUrl = get_config('block_pharos_tutor', 'middleware_url');
$secret        = get_config('block_pharos_tutor', 'moodle_secret');

echo "=== PHAROS Tutor Diagnostic ===\n\n";
echo "Middleware URL : " . ($middlewareUrl ?: '[NOT SET]') . "\n";
echo "Secret         : " . (!empty($secret)
    ? 'SET (' . strlen($secret) . ' chars)'
    : 'EMPTY — configure it at Admin > Plugins > Blocks > Tutor IA PHAROS') . "\n\n";

if (empty($middlewareUrl) || empty($secret)) {
    echo "STOP: configure block settings first.\n";
    die();
}

// ── Test 1: health (no auth) ────────────────────────────────────────────────
echo "--- Test 1: health endpoint ---\n";
$ch = curl_init(rtrim($middlewareUrl, '/') . '/health');
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5]);
$body  = curl_exec($ch);
$code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$cerr  = curl_error($ch);
curl_close($ch);

if ($cerr) {
    echo "FAIL — curl error: $cerr\n";
    echo "  => The moodle container cannot reach the middleware container.\n";
    echo "  => Run: docker-compose ps   to check middleware is Up\n";
    die();
}
echo "HTTP $code — $body\n\n";

// ── Test 2: chat with auth ──────────────────────────────────────────────────
echo "--- Test 2: /api/tutor/chat (with secret) ---\n";
$payload = json_encode([
    'userId'   => (string) $USER->id,
    'level'    => 1,
    'lang'     => 'es',
    'messages' => [['role' => 'user', 'content' => 'Di solo: OK']],
]);
$ch = curl_init(rtrim($middlewareUrl, '/') . '/api/tutor/chat');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Authorization: Bearer ' . $secret],
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_CONNECTTIMEOUT => 5,
]);
$body  = curl_exec($ch);
$code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$cerr  = curl_error($ch);
curl_close($ch);

if ($cerr) {
    echo "FAIL — curl error: $cerr\n";
    die();
}

$json = json_decode($body, true);
echo "HTTP $code\n";

if (isset($json['reply'])) {
    echo "REPLY: " . $json['reply'] . "\n\n";
    echo "=== ALL OK — the chat should work. ===\n";
} elseif ($code === 401) {
    echo "401 Unauthorized — secret mismatch.\n";
    echo "  => Token secreto in Moodle must equal MOODLE_SECRET in .env\n";
    echo "  => Both must be: pharos_local_secret_2024\n";
} elseif ($code === 500) {
    echo "500 from middleware: " . ($json['error'] ?? $body) . "\n";
    echo "  => Most likely cause: invalid ANTHROPIC_API_KEY in .env\n";
    echo "  => Run: docker-compose logs middleware\n";
} else {
    echo "Response: $body\n";
}
