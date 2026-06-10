<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace mod_pharos_itinerary\event;

defined('MOODLE_INTERNAL') || die();

/**
 * Fired when a user advances to the next itinerary level.
 */
class level_up extends \core\event\base {

    protected function init(): void {
        $this->data['crud']        = 'u';
        $this->data['edulevel']    = self::LEVEL_PARTICIPATING;
        $this->data['objecttable'] = 'pharos_itinerary_progress';
    }

    public static function get_name(): string {
        return get_string('event_level_up', 'mod_pharos_itinerary');
    }

    public function get_description(): string {
        $newLevel = $this->other['new_level'] ?? '?';
        return "The user with id {$this->userid} advanced to level {$newLevel} in itinerary " .
               "with id {$this->objectid}.";
    }

    public function get_url(): \moodle_url {
        return new \moodle_url('/mod/pharos_itinerary/view.php',
                               ['id' => $this->contextinstanceid]);
    }

    public static function get_objectid_mapping(): array {
        return ['db' => 'pharos_itinerary_progress', 'restore' => 'pharos_itinerary_progress'];
    }
}
