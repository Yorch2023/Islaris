<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/mod/pharos_itinerary/backup/moodle2/backup_pharos_itinerary_stepslib.php');

/**
 * Backup task for mod_pharos_itinerary.
 */
class backup_pharos_itinerary_activity_task extends backup_activity_task {

    protected function define_my_settings(): void {
        // No module-specific settings beyond the defaults.
    }

    protected function define_my_steps(): void {
        $this->add_step(new backup_pharos_itinerary_activity_structure_step(
            'pharos_itinerary_structure',
            'pharos_itinerary.xml'
        ));
    }

    public static function encode_content_links(string $content): string {
        global $CFG;
        $base = preg_quote($CFG->wwwroot, '/');

        // Links to the module index.
        $content = preg_replace(
            "/({$base}\/mod\/pharos_itinerary\/index\.php\?id=)([0-9]+)/",
            '$@PHAROSITINERARYINDEX*$2@$',
            $content
        );

        // Links to a specific itinerary view.
        $content = preg_replace(
            "/({$base}\/mod\/pharos_itinerary\/view\.php\?id=)([0-9]+)/",
            '$@PHAROSITINERARYVIEWBYID*$2@$',
            $content
        );

        return $content;
    }
}
