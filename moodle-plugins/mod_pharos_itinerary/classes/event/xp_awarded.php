<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace mod_pharos_itinerary\event;

defined('MOODLE_INTERNAL') || die();

/**
 * Fired when XP is awarded to a user in an itinerary.
 */
class xp_awarded extends \core\event\base {

    protected function init(): void {
        $this->data['crud']        = 'u';
        $this->data['edulevel']    = self::LEVEL_PARTICIPATING;
        $this->data['objecttable'] = 'pharos_itinerary_progress';
    }

    public static function get_name(): string {
        return get_string('event_xp_awarded', 'mod_pharos_itinerary');
    }

    public function get_description(): string {
        $amount = $this->other['xp_amount'] ?? 0;
        return "The user with id {$this->userid} was awarded {$amount} XP in itinerary " .
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
