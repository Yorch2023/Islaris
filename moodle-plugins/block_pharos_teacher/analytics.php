<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

/**
 * PHAROS-AI Teacher Analytics page.
 * URL: /blocks/pharos_teacher/analytics.php?courseid=X[&format=csv]
 */

require_once(__DIR__ . '/../../config.php');

$courseId = required_param('courseid', PARAM_INT);
$format   = optional_param('format', '', PARAM_ALPHA);

$course = get_course($courseId);
require_login($course);
$context = context_course::instance($courseId);
require_capability('block/pharos_teacher:view', $context);

$now         = time();
$weekAgo     = $now - (7  * DAYSECS);
$monthAgo    = $now - (30 * DAYSECS);
$twoWeeksAgo = $now - (14 * DAYSECS);
$cutoff      = $now - (7  * DAYSECS);

$thresholds  = [1 => 100, 2 => 250, 3 => 250];
$levelNames  = [1 => 'N1', 2 => 'N2', 3 => 'N3'];

$itineraryTableExists = false;
$evidenceTableExists  = false;
$sessionsTableExists  = false;
try {
    $itineraryTableExists = $DB->get_manager()->table_exists('pharos_itinerary_progress');
    $evidenceTableExists  = $DB->get_manager()->table_exists('pharos_badges_evidence');
    $sessionsTableExists  = $DB->get_manager()->table_exists('block_pharos_tutor_sessions');
} catch (Throwable $e) {
    // Non-critical.
}

$itinerary = null;
if ($itineraryTableExists) {
    try {
        $itinerary = $DB->get_record_sql(
            "SELECT pi.id FROM {pharos_itinerary} pi
               JOIN {course_modules} cm ON cm.instance = pi.id
              WHERE pi.course = :course LIMIT 1",
            ['course' => $courseId]
        );
    } catch (Throwable $e) {}
}

$students = get_enrolled_users($context, '', 0, 'u.id, u.firstname, u.lastname, u.email');

$rows = [];
foreach ($students as $student) {
    $sid = (int) $student->id;

    $level = 1; $xp = 0; $xpPercent = 0; $lastSeen = 0;
    if ($itinerary && $itineraryTableExists) {
        try {
            $p = $DB->get_record('pharos_itinerary_progress', [
                'itineraryid' => $itinerary->id, 'userid' => $sid,
            ]);
            if ($p) {
                $level = (int) $p->level; $xp = (int) $p->xp;
                $xpNext = $thresholds[$level] ?? 250;
                $xpPercent = (int) min(100, round($xp / $xpNext * 100));
                $lastSeen = (int) $p->timemodified;
            }
        } catch (Throwable $e) {}
    }

    $daysSince   = $lastSeen ? (int) floor(($now - $lastSeen) / DAYSECS) : null;
    $isInactive  = $lastSeen < $cutoff;

    $aiTotal = 0; $aiWeek = 0; $aiMessages = 0; $lastAi = 0;
    if ($sessionsTableExists) {
        try {
            $r = $DB->get_record_sql(
                "SELECT COUNT(*) AS s, COALESCE(SUM(message_count),0) AS m, MAX(timecreated) AS last
                   FROM {block_pharos_tutor_sessions}
                  WHERE userid=:uid AND courseid=:cid",
                ['uid' => $sid, 'cid' => $courseId]
            );
            if ($r) { $aiTotal = (int)$r->s; $aiMessages = (int)$r->m; $lastAi = (int)$r->last; }
            $aiWeek = (int) $DB->count_records_select(
                'block_pharos_tutor_sessions',
                'userid=:uid AND courseid=:cid AND timecreated>=:w',
                ['uid'=>$sid,'cid'=>$courseId,'w'=>$weekAgo]
            );
        } catch (Throwable $e) {}
    }

    $evidenceCount = 0; $hasEvidence = false;
    if ($evidenceTableExists) {
        try {
            $evidenceCount = $DB->count_records('pharos_badges_evidence', ['userid'=>$sid,'courseid'=>$courseId]);
            $hasEvidence   = $evidenceCount > 0;
        } catch (Throwable $e) {}
    }

    // Risk score (same 4-factor formula as block and scheduled task).
    $risk = 0;
    if ($daysSince === null)    { $risk += 35; }
    elseif ($daysSince > 21)    { $risk += 40; }
    elseif ($daysSince > 14)    { $risk += 28; }
    elseif ($daysSince > 7)     { $risk += 15; }
    elseif ($daysSince > 4)     { $risk += 5;  }

    if ($lastAi === 0)                   { $risk += 20; }
    elseif ($lastAi < $twoWeeksAgo)      { $risk += 30; }
    elseif ($lastAi < $weekAgo)          { $risk += 14; }

    if ($xp === 0)              { $risk += 20; } elseif ($xpPercent < 15) { $risk += 8; }
    if (!$hasEvidence)          { $risk += 10; }
    $risk = min(100, $risk);
    $riskLevel = $risk >= 65 ? 'high' : ($risk >= 35 ? 'medium' : 'low');

    $profileUrl = (new moodle_url('/user/view.php', ['id'=>$sid,'course'=>$courseId]))->out(false);

    $rows[] = [
        'id'             => $sid,
        'name'           => fullname($student),
        'email'          => $student->email,
        'profile_url'    => $profileUrl,
        'level'          => $level,
        'level_label'    => $levelNames[$level],
        'xp'             => $xp,
        'xp_percent'     => $xpPercent,
        'days_inactive'  => $daysSince,
        'last_seen_str'  => $lastSeen ? userdate($lastSeen, get_string('strftimedatefullshort', 'langconfig')) : '—',
        'ai_total'       => $aiTotal,
        'ai_week'        => $aiWeek,
        'ai_messages'    => $aiMessages,
        'evidence_count' => $evidenceCount,
        'risk_score'     => $risk,
        'risk_level'     => $riskLevel,
        'risk_high'      => $riskLevel === 'high',
        'risk_medium'    => $riskLevel === 'medium',
        'risk_low'       => $riskLevel === 'low',
        'is_inactive'    => $isInactive,
    ];
}

// Sort by risk score descending.
usort($rows, fn($a, $b) => $b['risk_score'] - $a['risk_score']);

// ── CSV export ────────────────────────────────────────────────────────────

if ($format === 'csv') {
    $filename = clean_filename('pharos-analytics-' . $course->shortname . '-' . date('Y-m-d') . '.csv');
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    // UTF-8 BOM for Excel compatibility.
    echo "\xEF\xBB\xBF";
    $out = fopen('php://output', 'w');
    fputcsv($out, [
        'Nombre', 'Email', 'Nivel', 'XP', 'XP%',
        'Días sin actividad', 'Última actividad',
        'Sesiones IA total', 'Sesiones IA semana', 'Mensajes IA',
        'Evidencias', 'Riesgo (0-100)', 'Nivel de riesgo',
    ]);
    foreach ($rows as $r) {
        fputcsv($out, [
            $r['name'], $r['email'], $r['level_label'], $r['xp'], $r['xp_percent'],
            $r['days_inactive'] ?? 'N/A', $r['last_seen_str'],
            $r['ai_total'], $r['ai_week'], $r['ai_messages'],
            $r['evidence_count'], $r['risk_score'], $r['risk_level'],
        ]);
    }
    fclose($out);
    exit;
}

// ── HTML page ─────────────────────────────────────────────────────────────

$PAGE->set_url(new moodle_url('/blocks/pharos_teacher/analytics.php', ['courseid' => $courseId]));
$PAGE->set_context($context);
$PAGE->set_course($course);
$PAGE->set_title(get_string('analytics_title', 'block_pharos_teacher'));
$PAGE->set_heading(format_string($course->fullname));
$PAGE->set_pagelayout('incourse');

$csvUrl  = (new moodle_url('/blocks/pharos_teacher/analytics.php', ['courseid' => $courseId, 'format' => 'csv']))->out(false);
$backUrl = (new moodle_url('/course/view.php', ['id' => $courseId]))->out(false);

$highCount   = count(array_filter($rows, fn($r) => $r['risk_level'] === 'high'));
$mediumCount = count(array_filter($rows, fn($r) => $r['risk_level'] === 'medium'));
$activeCount = count(array_filter($rows, fn($r) => !$r['is_inactive']));

$templateData = [
    'course_name'    => format_string($course->fullname),
    'student_count'  => count($rows),
    'high_count'     => $highCount,
    'medium_count'   => $mediumCount,
    'active_count'   => $activeCount,
    'students'       => $rows,
    'csv_url'        => $csvUrl,
    'back_url'       => $backUrl,
    'generated_date' => userdate($now, get_string('strftimedatefullshort', 'langconfig')),
];

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('block_pharos_teacher/analytics', $templateData);
echo $OUTPUT->footer();
