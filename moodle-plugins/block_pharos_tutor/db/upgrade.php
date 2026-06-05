<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

function xmldb_block_pharos_tutor_upgrade($oldversion) {
    global $DB;
    $dbman = $DB->get_manager();

    if ($oldversion < 2025060200) {
        $table = new xmldb_table('block_pharos_tutor_sessions');

        if (!$dbman->table_exists($table)) {
            $table->add_field('id',               XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
            $table->add_field('userid',           XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
            $table->add_field('courseid',         XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
            $table->add_field('level',            XMLDB_TYPE_INTEGER, '2',  null, XMLDB_NOTNULL, null, '1');
            $table->add_field('message_count',    XMLDB_TYPE_INTEGER, '5',  null, XMLDB_NOTNULL, null, '0');
            $table->add_field('duration_seconds', XMLDB_TYPE_INTEGER, '6',  null, XMLDB_NOTNULL, null, '0');
            $table->add_field('timecreated',      XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');

            $table->add_key('primary',    XMLDB_KEY_PRIMARY, ['id']);
            $table->add_index('ix_courseid_userid', XMLDB_INDEX_NOTUNIQUE, ['courseid', 'userid']);
            $table->add_index('ix_timecreated',     XMLDB_INDEX_NOTUNIQUE, ['timecreated']);

            $dbman->create_table($table);
        }

        upgrade_block_savepoint(true, 2025060200, 'pharos_tutor');
    }

    return true;
}
