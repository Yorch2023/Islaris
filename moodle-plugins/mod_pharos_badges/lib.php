<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

function pharos_badges_add_instance(stdClass $data, ?moodleform_mod $form = null): int {
    global $DB;
    $data->timecreated  = time();
    $data->timemodified = $data->timecreated;
    return $DB->insert_record('pharos_badges_instance', $data);
}

function pharos_badges_update_instance(stdClass $data, ?moodleform_mod $form = null): bool {
    global $DB;
    $data->timemodified = time();
    $data->id = $data->instance;
    return $DB->update_record('pharos_badges_instance', $data);
}

function pharos_badges_delete_instance(int $id): bool {
    global $DB;
    $instance = $DB->get_record('pharos_badges_instance', ['id' => $id], 'id, course', MUST_EXIST);
    $DB->delete_records('pharos_badges_evidence', ['courseid' => $instance->course]);
    return $DB->delete_records('pharos_badges_instance', ['id' => $id]);
}

function pharos_badges_supports(int $feature): ?bool {
    return match ($feature) {
        FEATURE_MOD_INTRO        => true,
        FEATURE_SHOW_DESCRIPTION => true,
        FEATURE_BACKUP_MOODLE2   => true,
        FEATURE_GRADE_HAS_GRADE  => false,
        default                  => null,
    };
}
