<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace mod_pharos_badges\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;

defined('MOODLE_INTERNAL') || die();

class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\plugin\provider,
    \core_privacy\local\request\core_userlist_provider {

    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table(
            'pharos_badges_evidence',
            [
                'userid'      => 'privacy:metadata:pharos_badges_evidence:userid',
                'level'       => 'privacy:metadata:pharos_badges_evidence:level',
                'type'        => 'privacy:metadata:pharos_badges_evidence:type',
                'description' => 'privacy:metadata:pharos_badges_evidence:description',
                'timecreated' => 'privacy:metadata:pharos_badges_evidence:timecreated',
            ],
            'privacy:metadata:pharos_badges_evidence'
        );
        return $collection;
    }

    public static function get_contexts_for_userid(int $userid): contextlist {
        $contextlist = new contextlist();
        $contextlist->add_from_sql(
            "SELECT ctx.id
               FROM {context} ctx
               JOIN {course_modules} cm ON cm.id = ctx.instanceid AND ctx.contextlevel = :contextlevel
               JOIN {pharos_badges_instance} pb ON pb.id = cm.instance AND pb.course = cm.course
               JOIN {pharos_badges_evidence} pe ON pe.courseid = pb.course AND pe.userid = :userid",
            ['contextlevel' => CONTEXT_MODULE, 'userid' => $userid]
        );
        return $contextlist;
    }

    public static function get_users_in_context(userlist $userlist): void {
        $context = $userlist->get_context();
        if ($context->contextlevel !== CONTEXT_MODULE) {
            return;
        }
        $userlist->add_from_sql(
            'userid',
            "SELECT pe.userid
               FROM {pharos_badges_evidence} pe
               JOIN {course_modules} cm ON cm.id = :cmid
               JOIN {pharos_badges_instance} pb ON pb.id = cm.instance
              WHERE pe.courseid = pb.course",
            ['cmid' => $context->instanceid]
        );
    }

    public static function export_user_data(approved_contextlist $contextlist): void {
        global $DB;

        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel !== CONTEXT_MODULE) {
                continue;
            }
            $cm       = get_coursemodule_from_id('pharos_badges', $context->instanceid);
            $evidence = $DB->get_records('pharos_badges_evidence', [
                'courseid' => $cm->course,
                'userid'   => $contextlist->get_user()->id,
            ], 'timecreated ASC');

            if ($evidence) {
                writer::with_context($context)->export_data(
                    [],
                    (object) ['evidence' => array_values($evidence)]
                );
            }
        }
    }

    public static function delete_data_for_all_users_in_context(\context $context): void {
        global $DB;
        if ($context->contextlevel !== CONTEXT_MODULE) {
            return;
        }
        $cm = get_coursemodule_from_id('pharos_badges', $context->instanceid);
        $DB->delete_records('pharos_badges_evidence', ['courseid' => $cm->course]);
    }

    public static function delete_data_for_user(approved_contextlist $contextlist): void {
        global $DB;
        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel !== CONTEXT_MODULE) {
                continue;
            }
            $cm = get_coursemodule_from_id('pharos_badges', $context->instanceid);
            $DB->delete_records('pharos_badges_evidence', [
                'courseid' => $cm->course,
                'userid'   => $contextlist->get_user()->id,
            ]);
        }
    }

    public static function delete_data_for_users(approved_userlist $userlist): void {
        global $DB;
        $context = $userlist->get_context();
        if ($context->contextlevel !== CONTEXT_MODULE) {
            return;
        }
        $cm = get_coursemodule_from_id('pharos_badges', $context->instanceid);
        [$insql, $params] = $DB->get_in_or_equal($userlist->get_userids(), SQL_PARAMS_NAMED);
        $params['courseid'] = $cm->course;
        $DB->delete_records_select(
            'pharos_badges_evidence',
            "courseid = :courseid AND userid $insql",
            $params
        );
    }
}
