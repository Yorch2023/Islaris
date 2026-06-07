<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html
//
// Validates a student's text reflection via AI and records it as evidence
// (platform-only submission — no file uploads).

define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');

// Load badges lib for evidence creation.
$badgesLibPath = $CFG->dirroot . '/mod/pharos_badges/lib.php';
if (file_exists($badgesLibPath)) {
    require_once($badgesLibPath);
    require_once($CFG->dirroot . '/mod/pharos_badges/classes/badge_issuer.php');
}

// Load itinerary lib for XP award.
$itineraryLibPath = $CFG->dirroot . '/mod/pharos_itinerary/lib.php';
if (file_exists($itineraryLibPath)) {
    require_once($itineraryLibPath);
}

require_login();

header('Content-Type: application/json');

$rawBody = file_get_contents('php://input');
$data    = json_decode($rawBody, true);

if (!$data || !confirm_sesskey($data['sesskey'] ?? '')) {
    echo json_encode(['error' => 'Invalid session key']);
    exit;
}

$courseId      = (int) ($data['courseid'] ?? 0);
$level         = max(1, min(3, (int) ($data['level'] ?? 1)));
$activityName  = trim(substr((string) ($data['activity_name'] ?? ''), 0, 200));
$reflectionRaw = trim((string) ($data['reflection'] ?? ''));
$lang          = in_array($data['lang'] ?? '', ['es', 'it'], true) ? $data['lang'] : 'es';

if (!$courseId) {
    echo json_encode(['error' => 'Missing courseid']);
    exit;
}

// Enforce minimum and maximum reflection length.
$reflectionLen = mb_strlen($reflectionRaw);
if ($reflectionLen < 50) {
    echo json_encode(['error' => 'reflection_too_short', 'min_chars' => 50, 'current' => $reflectionLen]);
    exit;
}
$reflection = mb_substr($reflectionRaw, 0, 1000);

$course = $DB->get_record('course', ['id' => $courseId]);
if (!$course) {
    echo json_encode(['error' => 'Invalid course']);
    exit;
}
require_login($course);

$context = context_course::instance($courseId);
if (!is_enrolled($context, $USER->id)) {
    echo json_encode(['error' => 'Not enrolled']);
    exit;
}

// Rate limit: max 3 reflections per student per level per day.
$todayStart = mktime(0, 0, 0);
$todayCount = $DB->count_records_select(
    'pharos_badges_evidence',
    "userid = :uid AND courseid = :cid AND level = :lv AND type = 'process' AND timecreated >= :today",
    ['uid' => $USER->id, 'cid' => $courseId, 'lv' => $level, 'today' => $todayStart]
);
if ($todayCount >= 3) {
    echo json_encode(['error' => 'daily_limit_reached', 'limit' => 3]);
    exit;
}

// ── Call the AI to validate the reflection ────────────────────────────────

$middlewareUrl = rtrim(
    get_config('block_pharos_tutor', 'middleware_url') ?: getenv('PHAROS_MIDDLEWARE_URL') ?: 'http://ai-layer:3001',
    '/'
);
$secret = getenv('MOODLE_SECRET') ?: get_config('block_pharos_tutor', 'moodle_secret') ?: '';

$payload = json_encode([
    'userId'        => (string) $USER->id,
    'lang'          => $lang,
    'level'         => $level,
    'activity_name' => $activityName,
    'reflection'    => $reflection,
]);

$ch = curl_init($middlewareUrl . '/api/tutor/reflect');
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
    echo json_encode(['error' => 'AI service unavailable']);
    exit;
}

$result = json_decode($response, true);
if (!isset($result['valid'])) {
    echo json_encode(['error' => 'Empty response from AI']);
    exit;
}

// ── Record evidence if reflection is valid ────────────────────────────────

$evidenceCreated = false;
$badgeIssued     = false;
$xpGained        = 0;
$evidenceCount   = 0;

if ($result['valid'] && class_exists('\mod_pharos_badges\badge_issuer')) {
    $quality     = (int) ($result['quality'] ?? 2);
    $qualityLabel = $quality >= 3 ? ' (excelente)' : '';
    $desc = $activityName
        ? "Reflexión sobre \"{$activityName}\"" . $qualityLabel
        : "Reflexión de actividad — N{$level}" . $qualityLabel;

    try {
        $badgeIssued     = \mod_pharos_badges\badge_issuer::record_evidence(
            $courseId, $USER->id, $level, 'process', $desc
        );
        $evidenceCreated = true;
    } catch (\Throwable $e) {
        // Badge tables may not exist yet; non-critical.
    }

    // Award XP in the itinerary (bonus for quality).
    if ($evidenceCreated && function_exists('pharos_itinerary_award_xp')) {
        try {
            $itinerary = $DB->get_record('pharos_itinerary', ['course' => $courseId], 'id, xp_per_evidence');
            if ($itinerary) {
                $baseXp   = (int) ($itinerary->xp_per_evidence ?: 10);
                $xpGained = $quality >= 3 ? (int) round($baseXp * 1.5) : $baseXp;
                pharos_itinerary_award_xp($itinerary->id, $USER->id, $xpGained);
            }
        } catch (\Throwable $e) {
            // Non-critical.
        }
    }
}

// Count total evidence at this level for progress feedback.
if (class_exists('\mod_pharos_badges\badge_issuer')) {
    try {
        $evidenceCount = $DB->count_records('pharos_badges_evidence', [
            'userid'   => $USER->id,
            'courseid' => $courseId,
            'level'    => $level,
        ]);
    } catch (\Throwable $e) {
        // Non-critical.
    }
}

$thresholds = [1 => 3, 2 => 4, 3 => 5];

echo json_encode([
    'ok'               => true,
    'valid'            => $result['valid'],
    'quality'          => (int) ($result['quality'] ?? 1),
    'feedback'         => $result['feedback'] ?? '',
    'evidence_created' => $evidenceCreated,
    'badge_issued'     => $badgeIssued,
    'xp_gained'        => $xpGained,
    'evidence_count'   => $evidenceCount,
    'threshold'        => $thresholds[$level] ?? 3,
]);
exit;
