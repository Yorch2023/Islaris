<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

require_once(__DIR__ . '/../../config.php');
require_once($CFG->dirroot . '/mod/pharos_badges/lib.php');

use mod_pharos_badges\badge_issuer;

$id     = required_param('id', PARAM_INT);       // Course module ID.
$level  = optional_param('level', 0, PARAM_INT); // Level filter (0 = all).

[$course, $cm] = get_course_and_cm_from_cmid($id, 'pharos_badges');

require_login($course, true, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/pharos_badges:view', $context);

$canSubmit = has_capability('mod/pharos_badges:submit_evidence', $context);

// Handle evidence submission.
if ($canSubmit && data_submitted() && confirm_sesskey()) {
    $submittedLevel = required_param('evidence_level', PARAM_INT);
    $type           = required_param('evidence_type', PARAM_ALPHA);
    $description    = required_param('evidence_description', PARAM_TEXT);

    $description = clean_param($description, PARAM_TEXT);

    if (!empty($description) && in_array($submittedLevel, [1, 2, 3], true)) {
        $issued = badge_issuer::record_evidence(
            $course->id,
            $USER->id,
            $submittedLevel,
            $type,
            $description
        );

        if ($issued) {
            \core\notification::success(get_string('badge_issued', 'mod_pharos_badges'));
        } else {
            \core\notification::info(get_string('evidence_recorded', 'mod_pharos_badges'));
        }
    }

    redirect(new moodle_url('/mod/pharos_badges/view.php', ['id' => $cm->id]));
}

$PAGE->set_url('/mod/pharos_badges/view.php', ['id' => $cm->id]);
$PAGE->set_title(format_string($cm->name));
$PAGE->set_heading(format_string($course->fullname));
$PAGE->set_context($context);

// Fetch user evidence grouped by level.
$evidenceByLevel = badge_issuer::get_user_evidence($course->id, $USER->id);

$thresholds = [1 => 3, 2 => 4, 3 => 5];

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
            'type'        => $e->type,
            'description' => format_string($e->description),
            'date'        => userdate($e->timecreated, get_string('strftimedatefullshort', 'langconfig')),
        ], $items)),
    ];
}

$templateData = [
    'id'          => $cm->id,
    'sesskey'     => sesskey(),
    'can_submit'  => $canSubmit,
    'levels'      => $levelData,
    'types'       => [
        ['value' => 'product', 'label' => get_string('evidence_product', 'mod_pharos_badges')],
        ['value' => 'process', 'label' => get_string('evidence_process', 'mod_pharos_badges')],
        ['value' => 'impact',  'label' => get_string('evidence_impact',  'mod_pharos_badges')],
    ],
];

echo $OUTPUT->header();
echo $OUTPUT->heading(format_string($cm->name));
echo $OUTPUT->render_from_template('mod_pharos_badges/evidence_view', $templateData);
echo $OUTPUT->footer();
