<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html
//
// Receives the tutor conversation from the browser at session end,
// calls the AI memory extraction endpoint, stores ONLY the structured
// JSON profile — never the conversation content.
//
// Privacy by design:
//   - conversation is used in-flight for extraction, then discarded
//   - only structured pedagogical insights are persisted
//   - stored in block_pharos_tutor_memory, deletable via GDPR API

define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');

require_login();

header('Content-Type: application/json');

$rawBody = file_get_contents('php://input');
$data    = json_decode($rawBody, true);

if (!$data || !confirm_sesskey($data['sesskey'] ?? '')) {
    echo json_encode(['ok' => false, 'error' => 'Invalid session key']);
    exit;
}

$courseId = (int) ($data['courseid'] ?? 0);
$messages = $data['messages']          ?? [];

if (!$courseId) {
    echo json_encode(['ok' => false, 'error' => 'Missing courseid']);
    exit;
}

if (!is_array($messages) || count($messages) < 2) {
    // Nothing worth extracting — acknowledge silently.
    echo json_encode(['ok' => true, 'skipped' => true]);
    exit;
}

// Sanitise messages: only role + content, strip anything else.
$allowedRoles = ['user', 'assistant'];
$cleanMessages = [];
foreach (array_slice($messages, -20) as $msg) {
    $role    = $msg['role']    ?? '';
    $content = $msg['content'] ?? '';
    if (!in_array($role, $allowedRoles, true)) continue;
    $cleanMessages[] = [
        'role'    => $role,
        'content' => mb_substr((string) $content, 0, 3000),
    ];
}

if (count($cleanMessages) < 2) {
    echo json_encode(['ok' => true, 'skipped' => true]);
    exit;
}

// ── Read existing profile from DB ────────────────────────────────────────────

$existingProfile = null;
try {
    if ($DB->get_manager()->table_exists('block_pharos_tutor_memory')) {
        $row = $DB->get_record('block_pharos_tutor_memory', [
            'userid'   => $USER->id,
            'courseid' => $courseId,
        ], 'profile_json');
        if ($row && $row->profile_json) {
            $existingProfile = json_decode($row->profile_json, true) ?: null;
        }
    }
} catch (Exception $e) {
    // Table not yet installed; proceed without existing profile.
}

// ── Call AI middleware for extraction ────────────────────────────────────────

$middlewareUrl = rtrim(
    get_config('block_pharos_tutor', 'middleware_url') ?: getenv('PHAROS_MIDDLEWARE_URL') ?: 'http://ai-layer:3001',
    '/'
);
$secret = getenv('MOODLE_SECRET') ?: get_config('block_pharos_tutor', 'moodle_secret') ?: '';

$payload = json_encode([
    'userId'          => (string) $USER->id,
    'messages'        => $cleanMessages,
    'existingProfile' => $existingProfile,
]);

$ch = curl_init($middlewareUrl . '/api/memory/extract');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $secret,
    ],
    CURLOPT_TIMEOUT        => 20,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($curlErr || $httpCode !== 200) {
    // Non-critical — the tutor will work without memory.
    echo json_encode(['ok' => false, 'error' => 'Extraction service unavailable']);
    exit;
}

$result = json_decode($response, true);
if (empty($result['ok']) || empty($result['profile'])) {
    echo json_encode(['ok' => false, 'error' => 'Invalid extraction response']);
    exit;
}

// ── Persist the profile (upsert) ─────────────────────────────────────────────

$profile = $result['profile'];
// Enforce safety: sessions_total counter (incremented by PHP, not AI).
$profile['sessions_total'] = ($existingProfile['sessions_total'] ?? 0) + 1;
$profile['updated_at']     = time();

$profileJson = json_encode($profile, JSON_UNESCAPED_UNICODE);

try {
    if ($DB->get_manager()->table_exists('block_pharos_tutor_memory')) {
        $existing = $DB->get_record('block_pharos_tutor_memory', [
            'userid'   => $USER->id,
            'courseid' => $courseId,
        ]);

        if ($existing) {
            $DB->update_record('block_pharos_tutor_memory', (object) [
                'id'           => $existing->id,
                'profile_json' => $profileJson,
                'timemodified' => time(),
            ]);
        } else {
            $DB->insert_record('block_pharos_tutor_memory', (object) [
                'userid'       => $USER->id,
                'courseid'     => $courseId,
                'profile_json' => $profileJson,
                'timecreated'  => time(),
                'timemodified' => time(),
            ]);
        }
    }
} catch (Exception $e) {
    // Table not yet installed — memory will be saved next time.
    echo json_encode(['ok' => false, 'error' => 'DB not ready']);
    exit;
}

echo json_encode(['ok' => true]);
exit;
