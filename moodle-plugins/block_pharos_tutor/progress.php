<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

/**
 * Student "Mi Progreso" analytics page.
 * URL: /blocks/pharos_tutor/progress.php?courseid=X
 */

require_once(__DIR__ . '/../../config.php');

$courseId = required_param('courseid', PARAM_INT);
$course   = get_course($courseId);

require_login($course);
$context = context_course::instance($courseId);
require_capability('mod/pharos_itinerary:view', $context);

$PAGE->set_url(new moodle_url('/blocks/pharos_tutor/progress.php', ['courseid' => $courseId]));
$PAGE->set_context($context);
$PAGE->set_course($course);
$PAGE->set_title(get_string('progress_title', 'block_pharos_tutor'));
$PAGE->set_heading(format_string($course->fullname));
$PAGE->set_pagelayout('incourse');

$now      = time();
$weekAgo  = $now - (7  * DAYSECS);
$monthAgo = $now - (30 * DAYSECS);

// ── Itinerary progress ─────────────────────────────────────────────────────

$level     = 1;
$xp        = 0;
$lastSeen  = null;
$thresholds = [1 => 100, 2 => 250, 3 => 250];
$levelNames = [1 => 'N1 — Fundamentos', 2 => 'N2 — IA en la práctica', 3 => 'N3 — Facilitación crítica'];

try {
    if ($DB->get_manager()->table_exists('pharos_itinerary_progress') &&
            $DB->get_manager()->table_exists('pharos_itinerary')) {
        $itinerary = $DB->get_record_sql(
            "SELECT pi.id FROM {pharos_itinerary} pi
               JOIN {course_modules} cm ON cm.instance = pi.id
              WHERE pi.course = :course LIMIT 1",
            ['course' => $courseId]
        );
        if ($itinerary) {
            $progress = $DB->get_record('pharos_itinerary_progress', [
                'itineraryid' => $itinerary->id,
                'userid'      => $USER->id,
            ]);
            if ($progress) {
                $level    = (int) $progress->level;
                $xp       = (int) $progress->xp;
                $lastSeen = (int) $progress->timemodified;
            }
        }
    }
} catch (Throwable $e) {
    // No progress data.
}

$xpNext    = $thresholds[$level] ?? 250;
$xpPercent = (int) min(100, round($xp / $xpNext * 100));
$daysSince = $lastSeen ? (int) floor(($now - $lastSeen) / DAYSECS) : null;

// ── AI tutor session stats ─────────────────────────────────────────────────

$aiSessionsTotal   = 0;
$aiSessionsWeek    = 0;
$aiMessagesTotal   = 0;
$aiMinutesTotal    = 0;
$lastAiSession     = 0;
$recentSessions    = [];

try {
    if ($DB->get_manager()->table_exists('block_pharos_tutor_sessions')) {
        $totals = $DB->get_record_sql(
            "SELECT COUNT(*) AS total_sessions,
                    COALESCE(SUM(message_count),    0) AS total_messages,
                    COALESCE(SUM(duration_seconds), 0) AS total_seconds,
                    MAX(timecreated) AS last_session
               FROM {block_pharos_tutor_sessions}
              WHERE userid = :uid AND courseid = :cid",
            ['uid' => $USER->id, 'cid' => $courseId]
        );
        if ($totals) {
            $aiSessionsTotal = (int) $totals->total_sessions;
            $aiMessagesTotal = (int) $totals->total_messages;
            $aiMinutesTotal  = (int) round($totals->total_seconds / 60);
            $lastAiSession   = (int) $totals->last_session;
        }

        $aiSessionsWeek = (int) $DB->count_records_select(
            'block_pharos_tutor_sessions',
            'userid = :uid AND courseid = :cid AND timecreated >= :week',
            ['uid' => $USER->id, 'cid' => $courseId, 'week' => $weekAgo]
        );

        // Last 5 sessions for the timeline.
        $rows = $DB->get_records_sql(
            "SELECT id, level, message_count, duration_seconds, timecreated
               FROM {block_pharos_tutor_sessions}
              WHERE userid = :uid AND courseid = :cid
              ORDER BY timecreated DESC LIMIT 5",
            ['uid' => $USER->id, 'cid' => $courseId]
        );
        $levelColors = [1 => '#C8102E', 2 => '#e07b00', 3 => '#0D1520'];
        foreach ($rows as $row) {
            $recentSessions[] = [
                'level_label'   => 'N' . $row->level,
                'level_color'   => $levelColors[$row->level] ?? '#999',
                'message_count' => (int) $row->message_count,
                'duration_min'  => (int) round($row->duration_seconds / 60),
                'date'          => userdate($row->timecreated, get_string('strftimedatefullshort', 'langconfig')),
            ];
        }
    }
} catch (Throwable $e) {
    // No session data.
}

// ── Evidence and badge stats ───────────────────────────────────────────────

$evidenceByLevel  = [1 => [], 2 => [], 3 => []];
$badgesEarned     = [];
$evidenceThresholds = [1 => 3, 2 => 4, 3 => 5];
$recentReflections = [];

try {
    if ($DB->get_manager()->table_exists('pharos_badges_evidence')) {
        $evidenceRows = $DB->get_records_sql(
            "SELECT id, level, type, description, timecreated
               FROM {pharos_badges_evidence}
              WHERE userid = :uid AND courseid = :cid
              ORDER BY timecreated DESC",
            ['uid' => $USER->id, 'cid' => $courseId]
        );
        foreach ($evidenceRows as $row) {
            $lvl = (int) $row->level;
            if (isset($evidenceByLevel[$lvl])) {
                $evidenceByLevel[$lvl][] = $row;
            }
            if ($row->type === 'process' && count($recentReflections) < 3) {
                $recentReflections[] = [
                    'description' => format_string($row->description),
                    'date'        => userdate($row->timecreated, get_string('strftimedatefullshort', 'langconfig')),
                ];
            }
        }
    }
} catch (Throwable $e) {
    // No evidence data.
}

// ── Learner memory profile (read-only) ────────────────────────────────────

$memoryStrengths  = '';
$memoryConcepts   = [];
$memoryStyle      = '';

try {
    if ($DB->get_manager()->table_exists('block_pharos_tutor_memory')) {
        $memRow = $DB->get_record('block_pharos_tutor_memory', [
            'userid'   => $USER->id,
            'courseid' => $courseId,
        ], 'profile_json');
        if ($memRow && $memRow->profile_json) {
            $profile = json_decode($memRow->profile_json, true) ?: [];
            $memoryStrengths = $profile['strengths'] ?? '';
            $memoryConcepts  = array_slice((array) ($profile['concepts_explored'] ?? []), 0, 8);
            $styleMap = [
                'concrete_examples' => get_string('learning_style_examples', 'block_pharos_tutor'),
                'questions'         => get_string('learning_style_questions', 'block_pharos_tutor'),
                'definitions'       => get_string('learning_style_definitions', 'block_pharos_tutor'),
                'analogies'         => get_string('learning_style_analogies', 'block_pharos_tutor'),
            ];
            $rawStyle    = $profile['learning_style'] ?? '';
            $memoryStyle = $styleMap[$rawStyle] ?? '';
        }
    }
} catch (Throwable $e) {
    // No memory data.
}

// ── Assemble template data ─────────────────────────────────────────────────

$levelsProgress = [];
foreach ([1, 2, 3] as $lvl) {
    $count     = count($evidenceByLevel[$lvl]);
    $threshold = $evidenceThresholds[$lvl];
    $levelsProgress[] = [
        'level'       => $lvl,
        'level_label' => $levelNames[$lvl],
        'count'       => $count,
        'threshold'   => $threshold,
        'percent'     => (int) min(100, round($count / $threshold * 100)),
        'is_current'  => $lvl === $level,
        'badge_earned'=> $count >= $threshold,
    ];
}

$aiStatusClass = 'text-muted';
if ($lastAiSession >= $weekAgo)  $aiStatusClass = 'text-success';
elseif ($lastAiSession >= $monthAgo) $aiStatusClass = 'text-warning';

$templateData = [
    'student_name'      => fullname($USER),
    'course_name'       => format_string($course->fullname),
    'level'             => $level,
    'level_label'       => $levelNames[$level],
    'xp'                => $xp,
    'xp_next'           => $xpNext,
    'xp_percent'        => $xpPercent,
    'days_inactive'     => $daysSince,
    'never_active'      => $daysSince === null,
    'ai_sessions_total' => $aiSessionsTotal,
    'ai_sessions_week'  => $aiSessionsWeek,
    'ai_messages_total' => $aiMessagesTotal,
    'ai_minutes_total'  => $aiMinutesTotal,
    'ai_status_class'   => $aiStatusClass,
    'recent_sessions'   => $recentSessions,
    'has_sessions'      => !empty($recentSessions),
    'levels_progress'   => $levelsProgress,
    'recent_reflections'=> $recentReflections,
    'has_reflections'   => !empty($recentReflections),
    'memory_strengths'  => $memoryStrengths,
    'memory_concepts'   => array_map(fn($c) => ['concept' => $c], $memoryConcepts),
    'has_concepts'      => !empty($memoryConcepts),
    'memory_style'      => $memoryStyle,
    'back_url'          => (new moodle_url('/course/view.php', ['id' => $courseId]))->out(false),
];

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('block_pharos_tutor/student_progress', $templateData);
echo $OUTPUT->footer();
