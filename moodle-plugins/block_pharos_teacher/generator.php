<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

/**
 * PHAROS-AI Activity Generator page for teachers.
 *
 * URL: /blocks/pharos_teacher/generator.php?courseid=X
 */

require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/formslib.php');

$courseId = required_param('courseid', PARAM_INT);
$course   = get_course($courseId);

require_login($course);
$context = context_course::instance($courseId);
require_capability('block/pharos_teacher:view', $context);

$PAGE->set_url(new moodle_url('/blocks/pharos_teacher/generator.php', ['courseid' => $courseId]));
$PAGE->set_context($context);
$PAGE->set_course($course);
$PAGE->set_title(get_string('generator_title', 'block_pharos_teacher'));
$PAGE->set_heading($course->fullname);
$PAGE->set_pagelayout('incourse');

$ajaxUrl   = (new moodle_url('/blocks/pharos_teacher/ajax-generator.php'))->out(false);
$exportUrl = (new moodle_url('/blocks/pharos_teacher/ajax-export.php'))->out(false);

// Inject config as an inline <script> in the page body (via template) so it is
// always defined before generator-direct.js runs, regardless of footer ordering.
$jsConfig = json_encode([
    'ajaxUrl'   => $ajaxUrl,
    'exportUrl' => $exportUrl,
    'sesskey'   => sesskey(),
    'courseId'  => $courseId,
]);

$PAGE->requires->js(new moodle_url('/blocks/pharos_teacher/generator-direct.js'), true);

$templateData = [
    'courseid'   => $courseId,
    'js_config'  => $jsConfig,
    'back_url'   => (new moodle_url('/course/view.php', ['id' => $courseId]))->out(false),
    'ajax_url'   => $ajaxUrl,
    'export_url' => $exportUrl,
];

echo $OUTPUT->header();
echo $PAGE->get_renderer('core')->render_from_template('block_pharos_teacher/generator_view', $templateData);
echo $OUTPUT->footer();
