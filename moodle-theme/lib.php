<?php
// This file is part of the PHAROS-AI Moodle theme.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

function theme_pharos_get_main_scss_content($theme): string {
    global $CFG;

    $scss = '';

    // Variables must come before the Boost parent SCSS.
    $pre = file_get_contents($CFG->dirroot . '/theme/pharos/scss/_variables.scss');
    $scss .= $pre;

    // Boost parent SCSS.
    $parentscss = theme_boost_get_main_scss_content(theme_config::load('boost'));
    $scss .= $parentscss;

    // PHAROS overrides and additions.
    $scss .= file_get_contents($CFG->dirroot . '/theme/pharos/scss/pharos.scss');

    return $scss;
}

function theme_pharos_get_pre_scss($theme): string {
    global $CFG;
    return file_get_contents($CFG->dirroot . '/theme/pharos/scss/_variables.scss');
}

function theme_pharos_page_init(moodle_page $page): void {
    $page->requires->js('/theme/pharos/js/pharos-main.js', true);
}
