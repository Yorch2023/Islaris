<?php
defined('MOODLE_INTERNAL') || die();

$capabilities = [
    'block/pharos_teacher:addinstance' => [
        'riskbitmask' => RISK_SPAM,
        'captype'     => 'write',
        'contextlevel'=> CONTEXT_BLOCK,
        'archetypes'  => [
            'editingteacher' => CAP_ALLOW,
            'manager'        => CAP_ALLOW,
        ],
    ],
    'block/pharos_teacher:view' => [
        'captype'     => 'read',
        'contextlevel'=> CONTEXT_BLOCK,
        'archetypes'  => [
            'teacher'        => CAP_ALLOW,
            'editingteacher' => CAP_ALLOW,
            'manager'        => CAP_ALLOW,
        ],
    ],
];
