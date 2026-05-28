<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

if ($ADMIN->fulltree) {
    $settings->add(new admin_setting_configtext(
        'block_pharos_tutor/middleware_url',
        get_string('setting_middleware_url', 'block_pharos_tutor'),
        get_string('setting_middleware_url_desc', 'block_pharos_tutor'),
        'http://localhost:3001',
        PARAM_URL
    ));

    $settings->add(new admin_setting_configpasswordunmask(
        'block_pharos_tutor/moodle_secret',
        get_string('setting_moodle_secret', 'block_pharos_tutor'),
        get_string('setting_moodle_secret_desc', 'block_pharos_tutor'),
        ''
    ));
}
