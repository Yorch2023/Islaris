<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * PHPUnit data generator for mod_pharos_itinerary.
 *
 * Called by Moodle's testing framework when tests use:
 *   $generator->create_module('pharos_itinerary', $options)
 */
class mod_pharos_itinerary_generator extends testing_module_generator {

    public function create_instance($record = null, array $options = null) {
        $record = (object) (array) $record;

        if (empty($record->name)) {
            $record->name = 'Test Itinerary';
        }
        if (!isset($record->intro)) {
            $record->intro = '';
        }
        if (!isset($record->introformat)) {
            $record->introformat = FORMAT_HTML;
        }
        if (!isset($record->xp_per_evidence)) {
            $record->xp_per_evidence = 25;
        }

        return parent::create_instance($record, (array) $options);
    }
}
