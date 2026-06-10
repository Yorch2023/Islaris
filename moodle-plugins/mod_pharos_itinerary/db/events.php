<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

$observers = [
    [
        'eventname'   => '\mod_pharos_itinerary\event\level_up',
        'callback'    => '\mod_pharos_itinerary\observer::on_level_up',
        'priority'    => 0,
        'internal'    => false,
    ],
];
