<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

$functions = [

    'mod_pharos_itinerary_get_user_progress' => [
        'classname'     => 'mod_pharos_itinerary\external',
        'methodname'    => 'get_user_progress',
        'description'   => 'Returns the XP and level for a user in an itinerary.',
        'type'          => 'read',
        'ajax'          => true,
        'capabilities'  => 'mod/pharos_itinerary:view',
        'loginrequired' => true,
    ],

    'mod_pharos_itinerary_award_xp' => [
        'classname'     => 'mod_pharos_itinerary\external',
        'methodname'    => 'award_xp',
        'description'   => 'Awards XP to a user in an itinerary (teacher/manager only).',
        'type'          => 'write',
        'ajax'          => false,
        'capabilities'  => 'mod/pharos_itinerary:addinstance',
        'loginrequired' => true,
    ],
];

$services = [
    'PHAROS-AI services' => [
        'functions'        => ['mod_pharos_itinerary_get_user_progress', 'mod_pharos_itinerary_award_xp'],
        'restrictedusers'  => 0,
        'enabled'          => 1,
        'shortname'        => 'pharos_ai',
    ],
];
