<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

$capabilities = [

    'block/pharos_tutor:addinstance' => [
        'riskbitmask' => RISK_SPAM,
        'captype'     => 'write',
        'contextlevel'=> CONTEXT_BLOCK,
        'archetypes'  => [
            'editingteacher' => CAP_ALLOW,
            'manager'        => CAP_ALLOW,
        ],
    ],

    'block/pharos_tutor:myaddinstance' => [
        'captype'     => 'write',
        'contextlevel'=> CONTEXT_SYSTEM,
        'archetypes'  => [
            'user' => CAP_ALLOW,
        ],
    ],
];
