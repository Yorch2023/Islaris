<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * Restore step for mod_pharos_itinerary.
 */
class restore_pharos_itinerary_activity_structure_step extends restore_activity_structure_step {

    protected function define_structure(): array {
        $paths   = [];
        $userinfo = $this->get_setting_value('userinfo');

        $paths[] = new restore_path_element('pharos_itinerary',
            '/activity/pharos_itinerary');
        $paths[] = new restore_path_element('pharos_itinerary_activity',
            '/activity/pharos_itinerary/activities/activity');

        if ($userinfo) {
            $paths[] = new restore_path_element('pharos_itinerary_progress',
                '/activity/pharos_itinerary/progresses/progress');
        }

        return $this->prepare_activity_structure($paths);
    }

    // -------------------------------------------------------------------------

    protected function process_pharos_itinerary(array $data): void {
        global $DB;

        $data = (object) $data;
        $data->course = $this->get_courseid();

        $oldId = $data->id;
        unset($data->id);

        $newId = $DB->insert_record('pharos_itinerary', $data);
        $this->set_mapping('pharos_itinerary', $oldId, $newId, true);
        $this->apply_activity_instance($newId);
    }

    protected function process_pharos_itinerary_activity(array $data): void {
        global $DB;

        $data = (object) $data;
        $data->itineraryid = $this->get_new_parentid('pharos_itinerary');
        $data->cmid        = $this->get_mappingid('course_module', $data->cmid);

        unset($data->id);

        if ($data->cmid) {
            $DB->insert_record('pharos_itinerary_activity', $data);
        }
    }

    protected function process_pharos_itinerary_progress(array $data): void {
        global $DB;

        $data = (object) $data;
        $data->itineraryid = $this->get_new_parentid('pharos_itinerary');
        $data->userid      = $this->get_mappingid('user', $data->userid);

        unset($data->id);

        if ($data->userid) {
            $DB->insert_record('pharos_itinerary_progress', $data);
        }
    }

    // -------------------------------------------------------------------------

    protected function after_execute(): void {
        $this->add_related_files('mod_pharos_itinerary', 'intro', null);
    }
}
