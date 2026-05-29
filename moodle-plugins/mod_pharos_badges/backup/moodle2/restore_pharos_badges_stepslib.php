<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * Restore step for mod_pharos_badges.
 */
class restore_pharos_badges_activity_structure_step extends restore_activity_structure_step {

    protected function define_structure(): array {
        $paths   = [];
        $userinfo = $this->get_setting_value('userinfo');

        $paths[] = new restore_path_element('pharos_badges_instance',
            '/activity/pharos_badges_instance');

        if ($userinfo) {
            $paths[] = new restore_path_element('pharos_badges_evidence',
                '/activity/pharos_badges_instance/evidences/evidence');
        }

        return $this->prepare_activity_structure($paths);
    }

    // -------------------------------------------------------------------------

    protected function process_pharos_badges_instance(array $data): void {
        global $DB;

        $data = (object) $data;
        $data->course = $this->get_courseid();

        $oldId = $data->id;
        unset($data->id);

        $newId = $DB->insert_record('pharos_badges_instance', $data);
        $this->set_mapping('pharos_badges_instance', $oldId, $newId, true);
        $this->apply_activity_instance($newId);
    }

    protected function process_pharos_badges_evidence(array $data): void {
        global $DB;

        $data = (object) $data;
        $data->courseid = $this->get_courseid();
        $data->userid   = $this->get_mappingid('user', $data->userid);

        unset($data->id);

        if ($data->userid) {
            $DB->insert_record('pharos_badges_evidence', $data);
        }
    }

    // -------------------------------------------------------------------------

    protected function after_execute(): void {
        $this->add_related_files('mod_pharos_badges', 'intro', null);
    }
}
