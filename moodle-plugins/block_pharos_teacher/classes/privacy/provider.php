<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace block_pharos_teacher\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;

defined('MOODLE_INTERNAL') || die();

/**
 * Privacy provider for block_pharos_teacher.
 *
 * Stores dropout-risk alert records (student + teacher IDs, risk score, timestamp).
 * No conversation content is stored.
 */
class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\plugin\provider,
    \core_privacy\local\request\core_userlist_provider {

    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table(
            'block_pharos_teacher_alerts',
            [
                'courseid'    => 'privacy:metadata:block_pharos_teacher_alerts:courseid',
                'studentid'   => 'privacy:metadata:block_pharos_teacher_alerts:studentid',
                'teacherid'   => 'privacy:metadata:block_pharos_teacher_alerts:teacherid',
                'risk_score'  => 'privacy:metadata:block_pharos_teacher_alerts:risk_score',
                'timecreated' => 'privacy:metadata:block_pharos_teacher_alerts:timecreated',
            ],
            'privacy:metadata:block_pharos_teacher_alerts'
        );
        return $collection;
    }

    public static function get_contexts_for_userid(int $userid): contextlist {
        $contextlist = new contextlist();
        $contextlist->add_from_sql(
            "SELECT ctx.id
               FROM {context} ctx
               JOIN {course} c ON c.id = ctx.instanceid AND ctx.contextlevel = :ctxlevel
               JOIN {block_pharos_teacher_alerts} a
                 ON a.courseid = c.id AND (a.studentid = :uid1 OR a.teacherid = :uid2)",
            ['ctxlevel' => CONTEXT_COURSE, 'uid1' => $userid, 'uid2' => $userid]
        );
        return $contextlist;
    }

    public static function get_users_in_context(userlist $userlist): void {
        $context = $userlist->get_context();
        if ($context->contextlevel !== CONTEXT_COURSE) {
            return;
        }
        $userlist->add_from_sql(
            'studentid',
            "SELECT studentid FROM {block_pharos_teacher_alerts} WHERE courseid = :courseid",
            ['courseid' => $context->instanceid]
        );
        $userlist->add_from_sql(
            'teacherid',
            "SELECT teacherid FROM {block_pharos_teacher_alerts} WHERE courseid = :courseid",
            ['courseid' => $context->instanceid]
        );
    }

    public static function export_user_data(approved_contextlist $contextlist): void {
        global $DB;
        $userid = $contextlist->get_user()->id;
        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel !== CONTEXT_COURSE) {
                continue;
            }
            $alerts = $DB->get_records_select(
                'block_pharos_teacher_alerts',
                '(studentid = :uid1 OR teacherid = :uid2) AND courseid = :cid',
                ['uid1' => $userid, 'uid2' => $userid, 'cid' => $context->instanceid],
                'timecreated ASC'
            );
            writer::with_context($context)->export_data(
                [get_string('pluginname', 'block_pharos_teacher')],
                (object) ['dropout_alerts' => array_values($alerts)]
            );
        }
    }

    public static function delete_data_for_all_users_in_context(\context $context): void {
        global $DB;
        if ($context->contextlevel !== CONTEXT_COURSE) {
            return;
        }
        $DB->delete_records('block_pharos_teacher_alerts', ['courseid' => $context->instanceid]);
    }

    public static function delete_data_for_user(approved_contextlist $contextlist): void {
        global $DB;
        $userid = $contextlist->get_user()->id;
        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel !== CONTEXT_COURSE) {
                continue;
            }
            $DB->delete_records_select(
                'block_pharos_teacher_alerts',
                '(studentid = :uid1 OR teacherid = :uid2) AND courseid = :cid',
                ['uid1' => $userid, 'uid2' => $userid, 'cid' => $context->instanceid]
            );
        }
    }

    public static function delete_data_for_users(approved_userlist $userlist): void {
        global $DB;
        $context = $userlist->get_context();
        if ($context->contextlevel !== CONTEXT_COURSE) {
            return;
        }
        $userids = $userlist->get_userids();
        // Use distinct param prefixes so studentid and teacherid IN-lists don't
        // share named parameter names (which would cause a conflict in PostgreSQL).
        [$insqlS, $paramsS] = $DB->get_in_or_equal($userids, SQL_PARAMS_NAMED, 'sid');
        [$insqlT, $paramsT] = $DB->get_in_or_equal($userids, SQL_PARAMS_NAMED, 'tid');
        $params = array_merge($paramsS, $paramsT, ['courseid' => $context->instanceid]);
        $DB->delete_records_select(
            'block_pharos_teacher_alerts',
            "(studentid $insqlS OR teacherid $insqlT) AND courseid = :courseid",
            $params
        );
    }
}
