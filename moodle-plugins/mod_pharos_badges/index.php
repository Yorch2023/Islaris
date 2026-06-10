<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

require_once(__DIR__ . '/../../config.php');
require_once($CFG->dirroot . '/mod/pharos_badges/lib.php');

$id = required_param('id', PARAM_INT); // Course ID.

$course = $DB->get_record('course', ['id' => $id], '*', MUST_EXIST);
require_login($course);

$PAGE->set_url('/mod/pharos_badges/index.php', ['id' => $id]);
$PAGE->set_title(format_string($course->fullname));
$PAGE->set_heading(format_string($course->fullname));
$PAGE->set_context(context_course::instance($course->id));

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('modulenameplural', 'mod_pharos_badges'));

$instances = get_all_instances_in_course('pharos_badges', $course);

if (empty($instances)) {
    notice(get_string('thereareno', 'moodle', get_string('modulenameplural', 'mod_pharos_badges')),
           new moodle_url('/course/view.php', ['id' => $course->id]));
}

$table = new html_table();
$table->attributes['class'] = 'generaltable mod_index';
$table->head  = [get_string('name')];
$table->align = ['left'];

foreach ($instances as $instance) {
    $link = html_writer::link(
        new moodle_url('/mod/pharos_badges/view.php', ['id' => $instance->coursemodule]),
        format_string($instance->name)
    );
    $table->data[] = [$link];
}

echo html_writer::table($table);
echo $OUTPUT->footer();
