<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace block_pharos_tutor\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;

/**
 * Privacy provider.
 *
 * Stores session metadata only (message count, level, duration, timestamp).
 * NO conversation content is stored — conversations are stateless by design.
 */
class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\plugin\provider,
    \core_privacy\local\request\core_userlist_provider {

    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table(
            'block_pharos_tutor_sessions',
            [
                'userid'           => 'privacy:metadata:block_pharos_tutor_sessions:userid',
                'courseid'         => 'privacy:metadata:block_pharos_tutor_sessions:courseid',
                'level'            => 'privacy:metadata:block_pharos_tutor_sessions:level',
                'message_count'    => 'privacy:metadata:block_pharos_tutor_sessions:message_count',
                'duration_seconds' => 'privacy:metadata:block_pharos_tutor_sessions:duration_seconds',
                'timecreated'      => 'privacy:metadata:block_pharos_tutor_sessions:timecreated',
            ],
            'privacy:metadata:block_pharos_tutor_sessions'
        );
        $collection->add_database_table(
            'block_pharos_tutor_memory',
            [
                'userid'       => 'privacy:metadata:block_pharos_tutor_memory:userid',
                'courseid'     => 'privacy:metadata:block_pharos_tutor_memory:courseid',
                'profile_json' => 'privacy:metadata:block_pharos_tutor_memory:profile_json',
                'timemodified' => 'privacy:metadata:block_pharos_tutor_memory:timemodified',
            ],
            'privacy:metadata:block_pharos_tutor_memory'
        );
        return $collection;
    }

    public static function get_contexts_for_userid(int $userid): contextlist {
        $contextlist = new contextlist();
        $contextlist->add_from_sql(
            "SELECT ctx.id
               FROM {context} ctx
               JOIN {course} c ON c.id = ctx.instanceid AND ctx.contextlevel = :ctxlevel
               JOIN {block_pharos_tutor_sessions} s ON s.courseid = c.id AND s.userid = :userid",
            ['ctxlevel' => CONTEXT_COURSE, 'userid' => $userid]
        );
        return $contextlist;
    }

    public static function get_users_in_context(userlist $userlist): void {
        $context = $userlist->get_context();
        if ($context->contextlevel !== CONTEXT_COURSE) {
            return;
        }
        $userlist->add_from_sql(
            'userid',
            "SELECT userid FROM {block_pharos_tutor_sessions} WHERE courseid = :courseid",
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
            $sessions = $DB->get_records('block_pharos_tutor_sessions', [
                'userid'   => $userid,
                'courseid' => $context->instanceid,
            ], 'timecreated ASC');
            $memory = $DB->get_record('block_pharos_tutor_memory', [
                'userid'   => $userid,
                'courseid' => $context->instanceid,
            ], 'profile_json, timemodified');
            writer::with_context($context)->export_data(
                [get_string('pluginname', 'block_pharos_tutor')],
                (object) [
                    'sessions'         => array_values($sessions),
                    'learning_profile' => $memory
                        ? json_decode($memory->profile_json, true)
                        : null,
                ]
            );
        }
    }

    public static function delete_data_for_all_users_in_context(\context $context): void {
        global $DB;
        if ($context->contextlevel !== CONTEXT_COURSE) {
            return;
        }
        $DB->delete_records('block_pharos_tutor_sessions', ['courseid' => $context->instanceid]);
        $DB->delete_records('block_pharos_tutor_memory',   ['courseid' => $context->instanceid]);
    }

    public static function delete_data_for_user(approved_contextlist $contextlist): void {
        global $DB;
        $userid = $contextlist->get_user()->id;
        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel !== CONTEXT_COURSE) {
                continue;
            }
            $DB->delete_records('block_pharos_tutor_sessions', [
                'userid'   => $userid,
                'courseid' => $context->instanceid,
            ]);
            $DB->delete_records('block_pharos_tutor_memory', [
                'userid'   => $userid,
                'courseid' => $context->instanceid,
            ]);
        }
    }

    public static function delete_data_for_users(approved_userlist $userlist): void {
        global $DB;
        $context = $userlist->get_context();
        if ($context->contextlevel !== CONTEXT_COURSE) {
            return;
        }
        [$insql, $params] = $DB->get_in_or_equal($userlist->get_userids(), SQL_PARAMS_NAMED);
        $params['courseid'] = $context->instanceid;
        $DB->delete_records_select(
            'block_pharos_tutor_sessions',
            "userid $insql AND courseid = :courseid",
            $params
        );
        $DB->delete_records_select(
            'block_pharos_tutor_memory',
            "userid $insql AND courseid = :courseid",
            $params
        );
    }
}
