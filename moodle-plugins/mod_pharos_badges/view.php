<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

require_once(__DIR__ . '/../../config.php');
require_once($CFG->dirroot . '/mod/pharos_badges/lib.php');

use mod_pharos_badges\badge_issuer;

$id = required_param('id', PARAM_INT);

// Omit modulename to skip core_component registry validation for manually-installed plugins.
[$course, $cm] = get_course_and_cm_from_cmid($id);
if ($cm->modname !== 'pharos_badges') {
    throw new moodle_exception('invalidcoursemodule');
}

require_login($course, true, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/pharos_badges:view', $context);

$PAGE->set_url('/mod/pharos_badges/view.php', ['id' => $cm->id]);
$PAGE->set_title(format_string($cm->name));
$PAGE->set_heading(format_string($course->fullname));
$PAGE->set_context($context);

// Fetch user evidence grouped by level.
$evidenceByLevel = badge_issuer::get_user_evidence($course->id, $USER->id);

$thresholds = [1 => 3, 2 => 4, 3 => 5];
$typeLabels = [
    'ai_interaction' => get_string('evidence_ai_interaction', 'mod_pharos_badges'),
    'product'        => get_string('evidence_product',        'mod_pharos_badges'),
    'process'        => get_string('evidence_process',        'mod_pharos_badges'),
    'impact'         => get_string('evidence_impact',         'mod_pharos_badges'),
];

$levelData = [];
foreach ([1, 2, 3] as $lvl) {
    $items     = $evidenceByLevel[$lvl];
    $threshold = $thresholds[$lvl];
    $count     = count($items);
    $levelData[] = [
        'level'          => $lvl,
        'level_label'    => "N{$lvl}",
        'count'          => $count,
        'threshold'      => $threshold,
        'percent'        => (int) min(100, round($count / $threshold * 100)),
        'badge_earned'   => $count >= $threshold,
        'evidence_items' => array_values(array_map(fn($e) => [
            'type'        => $typeLabels[$e->type] ?? $e->type,
            'description' => format_string($e->description),
            'date'        => userdate($e->timecreated, get_string('strftimedatefullshort', 'langconfig')),
            'date_iso'    => date('Y-m-d', $e->timecreated),
        ], $items)),
    ];
}

$templateData = [
    'id'     => $cm->id,
    'levels' => $levelData,
];

echo $OUTPUT->header();
echo $OUTPUT->heading(format_string($cm->name));
echo $OUTPUT->render_from_template('mod_pharos_badges/evidence_view', $templateData);
echo $OUTPUT->footer();
