<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/mod/pharos_badges/backup/moodle2/backup_pharos_badges_stepslib.php');

/**
 * Backup task for mod_pharos_badges.
 */
class backup_pharos_badges_activity_task extends backup_activity_task {

    protected function define_my_settings(): void {
        // No module-specific settings beyond the defaults.
    }

    protected function define_my_steps(): void {
        $this->add_step(new backup_pharos_badges_activity_structure_step(
            'pharos_badges_structure',
            'pharos_badges.xml'
        ));
    }

    public static function encode_content_links(string $content): string {
        global $CFG;
        $base = preg_quote($CFG->wwwroot, '/');

        $content = preg_replace(
            "/({$base}\/mod\/pharos_badges\/index\.php\?id=)([0-9]+)/",
            '$@PHAROSBADGESINDEX*$2@$',
            $content
        );

        $content = preg_replace(
            "/({$base}\/mod\/pharos_badges\/view\.php\?id=)([0-9]+)/",
            '$@PHAROSBADGESVIEWBYID*$2@$',
            $content
        );

        return $content;
    }
}
