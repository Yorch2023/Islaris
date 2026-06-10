<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

$tasks = [
    [
        'classname'  => 'block_pharos_teacher\task\check_dropout_risk',
        'blocking'   => 0,
        'minute'     => '0',
        'hour'       => '7',
        'day'        => '*',
        'month'      => '*',
        'dayofweek'  => '1-5',  // Monday–Friday only.
    ],
];
