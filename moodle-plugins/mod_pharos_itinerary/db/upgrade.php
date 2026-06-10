<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

function xmldb_pharos_itinerary_upgrade(int $oldversion): bool {
    global $DB;
    $dbman = $DB->get_manager();

    if ($oldversion < 2025060100) {
        $table = new xmldb_table('pharos_itinerary_activity');

        if (!$dbman->table_exists($table)) {
            $table->add_field('id',          XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
            $table->add_field('itineraryid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('cmid',        XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('level',       XMLDB_TYPE_INTEGER, '1',  null, XMLDB_NOTNULL, null, '1');
            $table->add_field('sortorder',   XMLDB_TYPE_INTEGER, '4',  null, XMLDB_NOTNULL, null, '0');

            $table->add_key('primary',     XMLDB_KEY_PRIMARY, ['id']);
            $table->add_key('itineraryid', XMLDB_KEY_FOREIGN, ['itineraryid'], 'pharos_itinerary', ['id']);
            $table->add_key('cmid',        XMLDB_KEY_FOREIGN, ['cmid'], 'course_modules', ['id']);

            $table->add_index('itinerary_level', XMLDB_INDEX_NOTUNIQUE, ['itineraryid', 'level', 'sortorder']);
            $table->add_index('cmid_unique',     XMLDB_INDEX_UNIQUE,    ['itineraryid', 'cmid']);

            $dbman->create_table($table);
        }

        upgrade_mod_savepoint(true, 2025060100, 'pharos_itinerary');
    }

    return true;
}
