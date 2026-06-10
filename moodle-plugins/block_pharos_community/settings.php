<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

if ($ADMIN->fulltree) {

    $settings->add(new admin_setting_configtext(
        'block_pharos_community/consortium_url',
        get_string('settings_consortium_url', 'block_pharos_community'),
        '',
        '',
        PARAM_URL
    ));

    $settings->add(new admin_setting_configtext(
        'block_pharos_community/forum_url',
        get_string('settings_forum_url', 'block_pharos_community'),
        '',
        '',
        PARAM_URL
    ));

    $settings->add(new admin_setting_configtextarea(
        'block_pharos_community/webinars_json',
        get_string('settings_webinars_json', 'block_pharos_community'),
        'Array JSON: [{"title":"...","date_iso":"2025-06-15T10:00:00","url":"...","country":"ES"}]',
        '',
        PARAM_RAW
    ));

    $settings->add(new admin_setting_configtextarea(
        'block_pharos_community/resources_json',
        get_string('settings_resources_json', 'block_pharos_community'),
        'Array JSON: [{"title":"...","url":"...","type":"doc","lang":"es"}]',
        '',
        PARAM_RAW
    ));
}
