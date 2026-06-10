<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * Backup step for mod_pharos_badges.
 *
 * Backs up:
 *  - pharos_badges_instance (activity configuration)
 *  - pharos_badges_evidence (student evidence submissions, user-data only)
 */
class backup_pharos_badges_activity_structure_step extends backup_activity_structure_step {

    protected function define_structure() {

        $userinfo = $this->get_setting_value('userinfo');

        $instance = new backup_nested_element('pharos_badges_instance', ['id'], [
            'name', 'intro', 'introformat',
            'timecreated', 'timemodified',
        ]);

        $evidences = new backup_nested_element('evidences');
        $evidence  = new backup_nested_element('evidence', ['id'], [
            'userid', 'level', 'type', 'description', 'timecreated',
        ]);

        $instance->add_child($evidences);

        if ($userinfo) {
            $evidences->add_child($evidence);
        }

        $instance->set_source_table('pharos_badges_instance', ['id' => backup::VAR_ACTIVITYID]);

        if ($userinfo) {
            // Evidence rows are linked via courseid; filter by this course instance.
            $evidence->set_source_sql(
                'SELECT * FROM {pharos_badges_evidence} WHERE courseid = ?',
                [backup::VAR_COURSEID]
            );
            $evidence->annotate_ids('user', 'userid');
        }

        $instance->annotate_files('mod_pharos_badges', 'intro', null);

        return $this->prepare_activity_structure($instance);
    }
}
