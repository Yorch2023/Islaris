<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/mod/pharos_itinerary/backup/moodle2/restore_pharos_itinerary_stepslib.php');

/**
 * Restore task for mod_pharos_itinerary.
 */
class restore_pharos_itinerary_activity_task extends restore_activity_task {

    protected function define_my_settings(): void {
        // No module-specific settings.
    }

    protected function define_my_steps(): void {
        $this->add_step(new restore_pharos_itinerary_activity_structure_step(
            'pharos_itinerary_structure',
            'pharos_itinerary.xml'
        ));
    }

    public static function define_decode_contents(): array {
        $contents   = [];
        $contents[] = new restore_decode_content('pharos_itinerary', ['intro'], 'pharos_itinerary');
        return $contents;
    }

    public static function define_decode_rules(): array {
        $rules   = [];
        $rules[] = new restore_decode_rule(
            'PHAROSITINERARYINDEX',
            '/mod/pharos_itinerary/index.php?id=$1',
            'course'
        );
        $rules[] = new restore_decode_rule(
            'PHAROSITINERARYVIEWBYID',
            '/mod/pharos_itinerary/view.php?id=$1',
            'course_module'
        );
        return $rules;
    }

    public static function define_restore_log_rules(): array {
        $rules   = [];
        $rules[] = new restore_log_rule('pharos_itinerary', 'view', 'view.php?id={course_module}', '{pharos_itinerary}');
        return $rules;
    }

    public static function define_restore_log_rules_for_course(): array {
        return [];
    }
}
