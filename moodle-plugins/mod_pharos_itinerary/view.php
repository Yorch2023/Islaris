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

$progress  = pharos_itinerary_get_or_create_progress($itinerary->id, $USER->id);

$thresholds = [1 => 100, 2 => 250, 3 => 250];
$xpNext     = $thresholds[$progress->level] ?? 250;
$xpPercent  = (int) min(100, round($progress->xp / $xpNext * 100));

$levelMeta = [
    1 => ['label' => 'N1 — Fundamentos',         'desc' => get_string('level1_desc', 'mod_pharos_itinerary')],
    2 => ['label' => 'N2 — IA en la práctica',   'desc' => get_string('level2_desc', 'mod_pharos_itinerary')],
    3 => ['label' => 'N3 — Facilitación crítica', 'desc' => get_string('level3_desc', 'mod_pharos_itinerary')],
];

// Fetch activity assignments from pharos_itinerary_activity for this instance.
$activityRows = $DB->get_records_sql(
    "SELECT pia.cmid, pia.level, pia.sortorder, cm.module, cm.instance
       FROM {pharos_itinerary_activity} pia
       JOIN {course_modules} cm ON cm.id = pia.cmid
      WHERE pia.itineraryid = :itineraryid
      ORDER BY pia.level ASC, pia.sortorder ASC",
    ['itineraryid' => $itinerary->id]
);

// Map module ids → names once to avoid N+1 queries.
$moduleNames = [];
if ($activityRows) {
    $modids = array_unique(array_column((array) $activityRows, 'module'));
    foreach ($DB->get_records_list('modules', 'id', $modids, '', 'id,name') as $mod) {
        $moduleNames[$mod->id] = $mod->name;
    }
}

// Fetch completion data for this user in the course.
$completionData = [];
if ($activityRows) {
    $cmids = array_values(array_column((array) $activityRows, 'cmid'));
    [$insql, $inparams] = $DB->get_in_or_equal($cmids, SQL_PARAMS_NAMED, 'cmid');
    $completionRecords = $DB->get_records_select(
        'course_modules_completion',
        "userid = :userid AND coursemoduleid $insql",
        array_merge(['userid' => $USER->id], $inparams),
        '',
        'coursemoduleid, completionstate'
    );
    foreach ($completionRecords as $cr) {
        $completionData[$cr->coursemoduleid] = ($cr->completionstate >= COMPLETION_COMPLETE);
    }
}

// Group activities by level and build view data.
$activitiesByLevel = [1 => [], 2 => [], 3 => []];
foreach ($activityRows as $row) {
    $modName   = $moduleNames[$row->module] ?? 'activity';
    $instance  = $DB->get_record($modName, ['id' => $row->instance], 'id,name');
    $actName   = $instance ? format_string($instance->name) : get_string('activity');
    $actUrl    = (new moodle_url("/mod/{$modName}/view.php", ['id' => $row->cmid]))->out(false);
    $done      = $completionData[$row->cmid] ?? false;

    $activitiesByLevel[$row->level][] = [
        'cmid'      => $row->cmid,
        'name'      => $actName,
        'url'       => $actUrl,
        'completed' => $done,
        'is_locked' => $row->level > $progress->level,
    ];
}

$levelsData = [];
foreach ([1, 2, 3] as $lvl) {
    $levelsData[] = [
        'level'       => $lvl,
        'level_label' => $levelMeta[$lvl]['label'],
        'description' => $levelMeta[$lvl]['desc'],
        'is_current'  => $lvl === $progress->level,
        'is_locked'   => $lvl > $progress->level,
        'activities'  => $activitiesByLevel[$lvl],
    ];
}

// URL to the badges module in this course.
$badgesCm   = null;
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

$currentLevelLabel = $levelMeta[$progress->level]['label'];

$templateData = [
    'fullname'        => fullname($USER),
    'level'           => $progress->level,
    'level_label'     => $currentLevelLabel,
    'level_aria_label'=> get_string('current_level', 'mod_pharos_itinerary') . ': ' . $currentLevelLabel,
    'xp_current'      => $progress->xp,
    'xp_next'         => $xpNext,
    'xp_percent'      => $xpPercent,
    'xp_aria_label'   => get_string('xp_progress', 'mod_pharos_itinerary') . ': '
                         . $progress->xp . ' / ' . $xpNext . ' XP (' . $xpPercent . '%)',
    'levels'          => $levelsData,
    'badges_url'      => $badgesUrl,
];

echo $OUTPUT->render_from_template('mod_pharos_itinerary/itinerary_view', $templateData);

if (has_capability('mod/pharos_itinerary:addinstance', $context)) {
    $manageUrl = new moodle_url('/mod/pharos_itinerary/manage_activities.php', ['id' => $cm->id]);
    echo html_writer::div(
        html_writer::link($manageUrl, '⚙ ' . get_string('manage_activities_link', 'mod_pharos_itinerary'),
            ['class' => 'btn btn-outline-secondary btn-sm']),
        'text-right mt-2'
    );
}

$PAGE->requires->js_call_amd(
    'mod_pharos_itinerary/itinerary-progress',
    'init',
    [$context->id]
);

echo $OUTPUT->footer();
