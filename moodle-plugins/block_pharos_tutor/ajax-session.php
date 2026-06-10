<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html
//
// Records AI tutor session metadata and auto-creates evidence when the
// conversation threshold is reached. NO conversation content is stored.

define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');

// Load badges lib for auto-evidence creation.
$badgesLibPath = $CFG->dirroot . '/mod/pharos_badges/lib.php';
if (file_exists($badgesLibPath)) {
    require_once($badgesLibPath);
    require_once($CFG->dirroot . '/mod/pharos_badges/classes/badge_issuer.php');
}

// Load itinerary lib for XP.
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

$courseId     = (int) ($data['courseid'] ?? 0);
$level        = max(1, min(3, (int) ($data['level'] ?? 1)));
$messageCount = min((int) ($data['message_count'] ?? 0), 999);
$duration     = min((int) ($data['duration'] ?? 0), 86400);

if (!$courseId || $messageCount < 1) {
    echo json_encode(['ok' => false, 'reason' => 'insufficient_data']);
    exit;
}

$course = $DB->get_record('course', ['id' => $courseId]);
if (!$course) {
    echo json_encode(['error' => 'Invalid course']);
    exit;
}

require_login($course);

// Save session metadata — no conversation content.
$DB->insert_record('block_pharos_tutor_sessions', (object) [
    'userid'           => $USER->id,
    'courseid'         => $courseId,
    'level'            => $level,
    'message_count'    => $messageCount,
    'duration_seconds' => $duration,
    'timecreated'      => time(),
]);

$evidenceCreated = false;
$badgeIssued     = false;

// Auto-create one evidence per user per level per day when >= 5 messages exchanged.
if ($messageCount >= 5 && class_exists('\mod_pharos_badges\badge_issuer')) {
    $todayStart   = mktime(0, 0, 0);
    $alreadyToday = $DB->count_records_select(
        'pharos_badges_evidence',
        "userid = :uid AND courseid = :cid AND level = :lv AND type = 'ai_interaction' AND timecreated >= :today",
        ['uid' => $USER->id, 'cid' => $courseId, 'lv' => $level, 'today' => $todayStart]
    );

    if ($alreadyToday === 0) {
        $levelNames = [1 => 'Fundamentos', 2 => 'IA en la práctica', 3 => 'Facilitación crítica'];
        $desc = "Sesión de aprendizaje con el Tutor IA — N{$level} {$levelNames[$level]} ({$messageCount} intercambios)";

        try {
            $badgeIssued     = \mod_pharos_badges\badge_issuer::record_evidence(
                $courseId, $USER->id, $level, 'ai_interaction', $desc
            );
            $evidenceCreated = true;
        } catch (\Throwable $e) {
            // Badge tables may not exist yet; non-critical.
        }

        // Award XP in the itinerary.
        if ($evidenceCreated && function_exists('pharos_itinerary_award_xp')) {
            try {
                $itinerary = $DB->get_record('pharos_itinerary', ['course' => $courseId], 'id, xp_per_evidence');
                if ($itinerary) {
                    $xpAmount = (int) ($itinerary->xp_per_evidence ?: 10);
                    pharos_itinerary_award_xp($itinerary->id, $USER->id, $xpAmount);
                }
            } catch (\Throwable $e) {
                // Non-critical.
            }
        }
    }
}

echo json_encode([
    'ok'               => true,
    'evidence_created' => $evidenceCreated,
    'badge_issued'     => $badgeIssued,
]);
exit;
