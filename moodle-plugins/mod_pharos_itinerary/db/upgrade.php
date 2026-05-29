<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

function xmldb_pharos_itinerary_upgrade(int $oldversion): bool {
    // Future schema migrations go here.
    // Example pattern:
    //
    // if ($oldversion < 2026010100) {
    //     $dbman = $DB->get_manager();
    //     $table = new xmldb_table('pharos_itinerary_progress');
    //     $field = new xmldb_field('streak', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, 0, 'xp');
    //     if (!$dbman->field_exists($table, $field)) {
    //         $dbman->add_field($table, $field);
    //     }
    //     upgrade_mod_savepoint(true, 2026010100, 'pharos_itinerary');
    // }

    return true;
}
