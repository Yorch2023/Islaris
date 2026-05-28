<?php
// This file is part of the PHAROS-AI Moodle theme.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

$THEME->name        = 'pharos';
$THEME->sheets      = [];
$THEME->editor_sheets = [];
$THEME->parents     = ['boost'];
$THEME->enable_dock = false;
$THEME->extrascsspath = null;

$THEME->scss = function ($theme) {
    return theme_pharos_get_main_scss_content($theme);
};

$THEME->prescsscallback = 'theme_pharos_get_pre_scss';

$THEME->layouts = [];

$THEME->javascripts_footer = [];

$THEME->rendererfactory = 'theme_overridden_renderer_factory';

$THEME->requiredblocks = '';
