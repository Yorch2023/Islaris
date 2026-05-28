<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

require_once(__DIR__ . '/../../config.php');
require_once($CFG->dirroot . '/mod/pharos_itinerary/lib.php');

$id = required_param('id', PARAM_INT);   // Course module ID.

[$course, $cm] = get_course_and_cm_from_cmid($id, 'pharos_itinerary');
$itinerary = $DB->get_record('pharos_itinerary', ['id' => $cm->instance], '*', MUST_EXIST);

require_login($course, true, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/pharos_itinerary:view', $context);

// Record view completion.
$completion = new completion_info($course);
$completion->set_module_viewed($cm);

// Fetch progress.
$progress = pharos_itinerary_get_or_create_progress($itinerary->id, $USER->id);

// Compute XP percentage toward next level.
$thresholds = [1 => 100, 2 => 250, 3 => 250];
$xpNext     = $thresholds[$progress->level] ?? 250;
$xpPercent  = (int) min(100, round($progress->xp / $xpNext * 100));

$levelLabels = [
    1 => 'N1 — Fundamentos',
    2 => 'N2 — IA en la práctica',
    3 => 'N3 — Facilitación crítica',
];

// Page setup.
$PAGE->set_url('/mod/pharos_itinerary/view.php', ['id' => $cm->id]);
$PAGE->set_title(format_string($itinerary->name));
$PAGE->set_heading(format_string($course->fullname));
$PAGE->set_context($context);

echo $OUTPUT->header();
echo $OUTPUT->heading(format_string($itinerary->name));

$templateData = [
    'fullname'    => fullname($USER),
    'level'       => $progress->level,
    'level_label' => $levelLabels[$progress->level],
    'xp_current'  => $progress->xp,
    'xp_next'     => $xpNext,
    'xp_percent'  => $xpPercent,
    'badges'      => [],   // populated by mod_pharos_badges integration
    'activities'  => [],   // populated from course activities
];

echo $OUTPUT->render_from_template('theme_pharos/dashboard-student', $templateData);
echo $OUTPUT->footer();
