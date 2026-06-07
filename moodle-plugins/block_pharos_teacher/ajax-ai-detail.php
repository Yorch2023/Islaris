<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html
//
// Returns AI session stats for a specific student (teacher use only).

define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');

require_login();

header('Content-Type: application/json');

$rawBody = file_get_contents('php://input');
$data    = json_decode($rawBody, true);

if (!$data || !confirm_sesskey($data['sesskey'] ?? '')) {
    echo json_encode(['error' => 'Invalid session key']);
    exit;
}

$courseId  = (int) ($data['courseid']  ?? 0);
$studentId = (int) ($data['student_id'] ?? 0);

if (!$courseId || !$studentId) {
    echo json_encode(['error' => 'Missing parameters']);
    exit;
}

$context = context_course::instance($courseId);
require_capability('block/pharos_teacher:view', $context);

// Verify the target user is enrolled in the course.
if (!is_enrolled($context, $studentId)) {
    echo json_encode(['error' => 'User not enrolled']);
    exit;
}

$student = $DB->get_record('user', ['id' => $studentId], 'id, firstname, lastname', MUST_EXIST);

// Sessions in the last 30 days, most recent first.
$since    = time() - (30 * DAYSECS);
$sessions = $DB->get_records_select(
    'block_pharos_tutor_sessions',
    'userid = :uid AND courseid = :cid AND timecreated >= :since',
    ['uid' => $studentId, 'cid' => $courseId, 'since' => $since],
    'timecreated DESC',
    'id, level, message_count, duration_seconds, timecreated',
    0, 20
);

$levelNames = [1 => 'N1', 2 => 'N2', 3 => 'N3'];

$rows = [];
foreach ($sessions as $s) {
    $mins   = round($s->duration_seconds / 60);
    $rows[] = [
        'date'          => userdate($s->timecreated, get_string('strftimedatetimeshort', 'langconfig')),
        'level_label'   => $levelNames[$s->level] ?? "N{$s->level}",
        'level'         => (int) $s->level,
        'message_count' => (int) $s->message_count,
        'duration_min'  => $mins,
    ];
}

// Aggregate totals.
$totals = $DB->get_record_sql(
    "SELECT COUNT(*)                        AS total_sessions,
            COALESCE(SUM(message_count), 0) AS total_messages,
            COALESCE(SUM(duration_seconds) / 60, 0) AS total_minutes
       FROM {block_pharos_tutor_sessions}
      WHERE userid = :uid AND courseid = :cid",
    ['uid' => $studentId, 'cid' => $courseId]
);

echo json_encode([
    'ok'             => true,
    'student_name'   => fullname($student),
    'sessions'       => $rows,
    'total_sessions' => (int) ($totals->total_sessions ?? 0),
    'total_messages' => (int) ($totals->total_messages ?? 0),
    'total_minutes'  => (int) ($totals->total_minutes  ?? 0),
]);
exit;
