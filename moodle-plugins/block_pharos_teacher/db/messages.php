<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

$messageproviders = [
    'dropout_alert' => [
        'capability' => 'block/pharos_teacher:view',
        'defaults'   => [
            MESSAGE_DEFAULT_ENABLED => MESSAGE_PERMITTED,
        ],
    ],
];
