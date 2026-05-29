<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

require_once(__DIR__ . '/../../config.php');
require_once($CFG->dirroot . '/mod/pharos_itinerary/lib.php');

$id = required_param('id', PARAM_INT);

[$course, $cm] = get_course_and_cm_from_cmid($id, 'pharos_itinerary');
$itinerary = $DB->get_record('pharos_itinerary', ['id' => $cm->instance], '*', MUST_EXIST);

require_login($course, true, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/pharos_itinerary:view', $context);

$completion = new completion_info($course);
$completion->set_module_viewed($cm);

$progress = pharos_itinerary_get_or_create_progress($itinerary->id, $USER->id);

$thresholds  = [1 => 100, 2 => 250, 3 => 250];
$xpNext      = $thresholds[$progress->level] ?? 250;
$xpPercent   = (int) min(100, round($progress->xp / $xpNext * 100));

$levelMeta = [
    1 => ['label' => 'N1 — Fundamentos',        'desc' => get_string('level1_desc', 'mod_pharos_itinerary')],
    2 => ['label' => 'N2 — IA en la práctica',  'desc' => get_string('level2_desc', 'mod_pharos_itinerary')],
    3 => ['label' => 'N3 — Facilitación crítica','desc' => get_string('level3_desc', 'mod_pharos_itinerary')],
];

// Build level data: activities from course modules tagged per level.
// In the full implementation this queries pharos_itinerary_activity;
// here we provide the data shape with an empty activities list.
$levelsData = [];
foreach ([1, 2, 3] as $lvl) {
    $levelsData[] = [
        'level'       => $lvl,
        'level_label' => $levelMeta[$lvl]['label'],
        'description' => $levelMeta[$lvl]['desc'],
        'is_current'  => $lvl === $progress->level,
        'is_locked'   => $lvl > $progress->level,
        'activities'  => [],
    ];
}

// URL to the badges module in this course (first instance found, or fallback).
$badgesCm = null;
$badgesMods = get_coursemodules_in_course('pharos_badges', $course->id);
if ($badgesMods) {
    $badgesCm = reset($badgesMods);
}
$badgesUrl = $badgesCm
    ? (new moodle_url('/mod/pharos_badges/view.php', ['id' => $badgesCm->id]))->out(false)
    : '#';

$PAGE->set_url('/mod/pharos_itinerary/view.php', ['id' => $cm->id]);
$PAGE->set_title(format_string($itinerary->name));
$PAGE->set_heading(format_string($course->fullname));
$PAGE->set_context($context);

echo $OUTPUT->header();
echo $OUTPUT->heading(format_string($itinerary->name));

$templateData = [
    'fullname'    => fullname($USER),
    'level'       => $progress->level,
    'level_label' => $levelMeta[$progress->level]['label'],
    'xp_current'  => $progress->xp,
    'xp_next'     => $xpNext,
    'xp_percent'  => $xpPercent,
    'levels'      => $levelsData,
    'badges_url'  => $badgesUrl,
];

echo $OUTPUT->render_from_template('mod_pharos_itinerary/itinerary_view', $templateData);

$PAGE->requires->js_call_amd(
    'mod_pharos_itinerary/itinerary-progress',
    'init',
    [$context->id]
);

echo $OUTPUT->footer();
