<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

/**
 * Teacher UI: assign course modules to itinerary levels.
 *
 * GET  ?id=<cmid>              — show the assignment form
 * POST action=add    cmid level — assign a CM to a level
 * POST action=remove assign_id  — remove an assignment
 */

require_once(__DIR__ . '/../../config.php');
require_once($CFG->dirroot . '/mod/pharos_itinerary/lib.php');

$id = required_param('id', PARAM_INT);

[$course, $cm] = get_course_and_cm_from_cmid($id, 'pharos_itinerary');
$itinerary = $DB->get_record('pharos_itinerary', ['id' => $cm->instance], '*', MUST_EXIST);

require_login($course, true, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/pharos_itinerary:addinstance', $context);

$PAGE->set_url('/mod/pharos_itinerary/manage_activities.php', ['id' => $cm->id]);
$PAGE->set_title(get_string('manage_activities', 'mod_pharos_itinerary'));
$PAGE->set_heading(format_string($course->fullname));
$PAGE->set_context($context);

// Handle POST actions.
if (data_submitted() && confirm_sesskey()) {
    $action = required_param('action', PARAM_ALPHA);

    if ($action === 'add') {
        $addCmid = required_param('cmid', PARAM_INT);
        $level   = required_param('level', PARAM_INT);

        if (!in_array($level, [1, 2, 3], true)) {
            throw new moodle_exception('invalidparameter', 'error');
        }

        // Prevent duplicate assignments.
        if (!$DB->record_exists('pharos_itinerary_activity', ['itineraryid' => $itinerary->id, 'cmid' => $addCmid])) {
            $maxOrder = (int) $DB->get_field_select(
                'pharos_itinerary_activity',
                'MAX(sortorder)',
                'itineraryid = :id AND level = :level',
                ['id' => $itinerary->id, 'level' => $level]
            );
            $DB->insert_record('pharos_itinerary_activity', (object) [
                'itineraryid' => $itinerary->id,
                'cmid'        => $addCmid,
                'level'       => $level,
                'sortorder'   => $maxOrder + 1,
            ]);
            \core\notification::success(get_string('activity_assigned', 'mod_pharos_itinerary'));
        }

    } elseif ($action === 'remove') {
        $assignId = required_param('assign_id', PARAM_INT);
        $DB->delete_records('pharos_itinerary_activity', ['id' => $assignId, 'itineraryid' => $itinerary->id]);
        \core\notification::success(get_string('activity_removed', 'mod_pharos_itinerary'));

    } elseif ($action === 'move') {
        $assignId  = required_param('assign_id', PARAM_INT);
        $direction = required_param('direction', PARAM_ALPHA); // 'up' or 'down'
        pharos_itinerary_reorder_activity($itinerary->id, $assignId, $direction === 'up');
    }

    redirect(new moodle_url('/mod/pharos_itinerary/manage_activities.php', ['id' => $cm->id]));
}

// Fetch current assignments grouped by level.
$assigned = $DB->get_records_sql(
    "SELECT pia.id, pia.cmid, pia.level, pia.sortorder,
            cm.module, cm.instance
       FROM {pharos_itinerary_activity} pia
       JOIN {course_modules} cm ON cm.id = pia.cmid
      WHERE pia.itineraryid = :id
      ORDER BY pia.level ASC, pia.sortorder ASC",
    ['id' => $itinerary->id]
);

// Build module name map once.
$modIds     = array_unique(array_column((array) $assigned, 'module'));
$modNames   = [];
if ($modIds) {
    foreach ($DB->get_records_list('modules', 'id', $modIds, '', 'id,name') as $mod) {
        $modNames[$mod->id] = $mod->name;
    }
}

$assignedCmids = array_column((array) $assigned, 'cmid');

$levelLabels = [
    1 => 'N1 — ' . get_string('level1_desc', 'mod_pharos_itinerary'),
    2 => 'N2 — ' . get_string('level2_desc', 'mod_pharos_itinerary'),
    3 => 'N3 — ' . get_string('level3_desc', 'mod_pharos_itinerary'),
];

// Build assigned list per level for the view.
$byLevel = [1 => [], 2 => [], 3 => []];
foreach ($assigned as $row) {
    $modName  = $modNames[$row->module] ?? 'activity';
    $instance = $DB->get_record($modName, ['id' => $row->instance], 'id,name');
    $byLevel[$row->level][] = [
        'assign_id' => $row->id,
        'cmid'      => $row->cmid,
        'name'      => $instance ? format_string($instance->name) : get_string('unknownmodule', 'error'),
        'mod_icon'  => $modName,
    ];
}

// Available CMs: all visible non-itinerary CMs in the course not yet assigned.
$allCms = get_coursemodules_in_course('', $course->id);
$available = [];
foreach ($allCms as $acm) {
    if (in_array($acm->id, $assignedCmids, true)) {
        continue;
    }
    if ($acm->modname === 'pharos_itinerary') {
        continue;
    }
    $available[] = [
        'cmid' => $acm->id,
        'name' => format_string($acm->name ?: get_string('unknownmodule', 'error')),
    ];
}

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('manage_activities', 'mod_pharos_itinerary'));
echo html_writer::tag('p', get_string('manage_activities_intro', 'mod_pharos_itinerary'),
    ['class' => 'text-muted']);

$backUrl = new moodle_url('/mod/pharos_itinerary/view.php', ['id' => $cm->id]);
echo html_writer::link($backUrl, '← ' . get_string('back'), ['class' => 'btn btn-outline-secondary btn-sm mb-4']);

// Render assigned activities per level.
foreach ([1, 2, 3] as $lvl) {
    echo html_writer::start_tag('div', ['class' => 'card mb-4']);
    echo html_writer::start_tag('div', ['class' => 'card-header d-flex align-items-center']);
    echo html_writer::tag('span', "N{$lvl}", ['class' => "pharos-level-badge pharos-level-badge--n{$lvl} mr-2"]);
    echo html_writer::tag('span', $levelLabels[$lvl]);
    echo html_writer::end_tag('div');
    echo html_writer::start_tag('ul', ['class' => 'list-group list-group-flush']);

    if (empty($byLevel[$lvl])) {
        echo html_writer::tag('li',
            html_writer::tag('em', get_string('no_activities', 'mod_pharos_itinerary'), ['class' => 'text-muted small']),
            ['class' => 'list-group-item']);
    } else {
        foreach ($byLevel[$lvl] as $item) {
            $removeForm = html_writer::start_tag('form', [
                'method' => 'post', 'action' => '', 'class' => 'd-inline',
            ]);
            $removeForm .= html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sesskey', 'value' => sesskey()]);
            $removeForm .= html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'action',    'value' => 'remove']);
            $removeForm .= html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'assign_id', 'value' => $item['assign_id']]);
            $removeForm .= html_writer::tag('button',
                get_string('remove', 'mod_pharos_itinerary'),
                ['type' => 'submit', 'class' => 'btn btn-link btn-sm text-danger p-0']);
            $removeForm .= html_writer::end_tag('form');

            echo html_writer::tag('li',
                html_writer::tag('div',
                    html_writer::tag('span', format_string($item['name']), ['class' => 'flex-grow-1']) .
                    $removeForm,
                    ['class' => 'd-flex align-items-center justify-content-between']),
                ['class' => 'list-group-item']);
        }
    }

    echo html_writer::end_tag('ul');
    echo html_writer::end_tag('div');
}

// Render form to assign available CMs.
if ($available) {
    echo html_writer::start_tag('div', ['class' => 'card']);
    echo html_writer::tag('div',
        get_string('available_activities', 'mod_pharos_itinerary'),
        ['class' => 'card-header font-weight-bold']);
    echo html_writer::start_tag('div', ['class' => 'card-body']);
    echo html_writer::start_tag('form', ['method' => 'post', 'action' => '']);
    echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sesskey', 'value' => sesskey()]);
    echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'action',  'value' => 'add']);

    echo html_writer::start_tag('div', ['class' => 'form-row align-items-end']);

    // Activity selector.
    $cmOptions = array_column($available, 'name', 'cmid');
    echo html_writer::start_tag('div', ['class' => 'form-group col-md-6 mb-2']);
    echo html_writer::label(get_string('actividades', 'mod_pharos_itinerary'), 'assign-cmid', true, ['class' => 'sr-only']);
    echo html_writer::select($cmOptions, 'cmid', '', false, ['id' => 'assign-cmid', 'class' => 'form-control']);
    echo html_writer::end_tag('div');

    // Level selector.
    $levelOptions = [1 => 'N1', 2 => 'N2', 3 => 'N3'];
    echo html_writer::start_tag('div', ['class' => 'form-group col-md-3 mb-2']);
    echo html_writer::label(get_string('nivel', 'mod_pharos_badges'), 'assign-level', true, ['class' => 'sr-only']);
    echo html_writer::select($levelOptions, 'level', 1, false, ['id' => 'assign-level', 'class' => 'form-control']);
    echo html_writer::end_tag('div');

    echo html_writer::start_tag('div', ['class' => 'form-group col-md-3 mb-2']);
    echo html_writer::tag('button',
        get_string('assign_to_level', 'mod_pharos_itinerary'),
        ['type' => 'submit', 'class' => 'btn btn-primary btn-block']);
    echo html_writer::end_tag('div');

    echo html_writer::end_tag('div');
    echo html_writer::end_tag('form');
    echo html_writer::end_tag('div');
    echo html_writer::end_tag('div');
} else {
    echo $OUTPUT->notification(get_string('no_available_activities', 'mod_pharos_itinerary'), 'notifysuccess');
}

echo $OUTPUT->footer();

// ---- Helper ---------------------------------------------------------------

/**
 * Swaps sortorder of an assignment with its neighbour.
 */
function pharos_itinerary_reorder_activity(int $itineraryId, int $assignId, bool $moveUp): void {
    global $DB;

    $current = $DB->get_record('pharos_itinerary_activity',
        ['id' => $assignId, 'itineraryid' => $itineraryId], '*', MUST_EXIST);

    $direction = $moveUp ? '<' : '>';
    $order     = $moveUp ? 'DESC' : 'ASC';
    $neighbour = $DB->get_record_sql(
        "SELECT * FROM {pharos_itinerary_activity}
          WHERE itineraryid = :id AND level = :level AND sortorder {$direction} :ord
          ORDER BY sortorder {$order}
          LIMIT 1",
        ['id' => $itineraryId, 'level' => $current->level, 'ord' => $current->sortorder]
    );

    if ($neighbour) {
        [$current->sortorder, $neighbour->sortorder] = [$neighbour->sortorder, $current->sortorder];
        $DB->update_record('pharos_itinerary_activity', $current);
        $DB->update_record('pharos_itinerary_activity', $neighbour);
    }
}
