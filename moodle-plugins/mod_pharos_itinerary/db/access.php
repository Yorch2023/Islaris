<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

$capabilities = [

    'mod/pharos_itinerary:view' => [
        'captype'     => 'read',
        'contextlevel'=> CONTEXT_MODULE,
        'archetypes'  => [
            'guest'          => CAP_ALLOW,
            'student'        => CAP_ALLOW,
            'teacher'        => CAP_ALLOW,
            'editingteacher' => CAP_ALLOW,
            'manager'        => CAP_ALLOW,
        ],
    ],

    'mod/pharos_itinerary:addinstance' => [
        'riskbitmask' => RISK_XSS,
        'captype'     => 'write',
        'contextlevel'=> CONTEXT_COURSE,
        'archetypes'  => [
            'editingteacher' => CAP_ALLOW,
            'manager'        => CAP_ALLOW,
        ],
    ],
];
