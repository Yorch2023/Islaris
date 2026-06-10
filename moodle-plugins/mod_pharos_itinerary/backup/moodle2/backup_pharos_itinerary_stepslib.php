<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * Backup step for mod_pharos_itinerary.
 *
 * Backs up:
 *  - pharos_itinerary (instance configuration)
 *  - pharos_itinerary_activity (level→CM assignments)
 *  - pharos_itinerary_progress (per-user XP/level, omitted in anonymized backups)
 */
class backup_pharos_itinerary_activity_structure_step extends backup_activity_structure_step {

    protected function define_structure() {

        $userinfo = $this->get_setting_value('userinfo');

        // Root element mirrors the module table.
        $itinerary = new backup_nested_element('pharos_itinerary', ['id'], [
            'name', 'intro', 'introformat',
            'startlevel', 'xp_per_evidence',
            'timecreated', 'timemodified',
        ]);

        $activities = new backup_nested_element('activities');
        $activity   = new backup_nested_element('activity', ['id'], [
            'cmid', 'level', 'sortorder',
        ]);

        $progressItems = new backup_nested_element('progresses');
        $progress      = new backup_nested_element('progress', ['id'], [
            'userid', 'level', 'xp', 'timecreated', 'timemodified',
        ]);

        // Build the tree.
        $itinerary->add_child($activities);
        $activities->add_child($activity);

        if ($userinfo) {
            $itinerary->add_child($progressItems);
            $progressItems->add_child($progress);
        }

        // Connect to DB.
        $itinerary->set_source_table('pharos_itinerary', ['id' => backup::VAR_ACTIVITYID]);
        $activity->set_source_table('pharos_itinerary_activity', ['itineraryid' => backup::VAR_PARENTID]);

        if ($userinfo) {
            $progress->set_source_table('pharos_itinerary_progress', ['itineraryid' => backup::VAR_PARENTID]);
            $progress->annotate_ids('user', 'userid');
        }

        // Annotate IDs for remapping on restore.
        $activity->annotate_ids('course_module', 'cmid');

        $itinerary->annotate_files('mod_pharos_itinerary', 'intro', null);

        return $this->prepare_activity_structure($itinerary);
    }
}
