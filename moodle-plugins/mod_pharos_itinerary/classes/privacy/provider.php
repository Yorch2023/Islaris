<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace mod_pharos_itinerary\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\deletion_criteria;
use core_privacy\local\request\helper;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;

defined('MOODLE_INTERNAL') || die();

class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\plugin\provider,
    \core_privacy\local\request\core_userlist_provider {

    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table(
            'pharos_itinerary_progress',
            [
                'userid'       => 'privacy:metadata:pharos_itinerary_progress:userid',
                'level'        => 'privacy:metadata:pharos_itinerary_progress:level',
                'xp'           => 'privacy:metadata:pharos_itinerary_progress:xp',
                'timemodified' => 'privacy:metadata:pharos_itinerary_progress:timemodified',
            ],
            'privacy:metadata:pharos_itinerary_progress'
        );
        return $collection;
    }

    public static function get_contexts_for_userid(int $userid): contextlist {
        $contextlist = new contextlist();
        $contextlist->add_from_sql(
            "SELECT ctx.id
               FROM {context} ctx
               JOIN {course_modules} cm ON cm.id = ctx.instanceid AND ctx.contextlevel = :contextlevel
               JOIN {pharos_itinerary} pi ON pi.id = cm.instance
               JOIN {pharos_itinerary_progress} pp ON pp.itineraryid = pi.id AND pp.userid = :userid",
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
            "SELECT pp.userid
               FROM {pharos_itinerary_progress} pp
               JOIN {pharos_itinerary} pi ON pi.id = pp.itineraryid
               JOIN {course_modules} cm ON cm.instance = pi.id
              WHERE cm.id = :cmid",
            ['cmid' => $context->instanceid]
        );
    }

    public static function export_user_data(approved_contextlist $contextlist): void {
        global $DB;

        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel !== CONTEXT_MODULE) {
                continue;
            }
            $cm       = get_coursemodule_from_id('pharos_itinerary', $context->instanceid);
            $progress = $DB->get_record('pharos_itinerary_progress', [
                'itineraryid' => $cm->instance,
                'userid'      => $contextlist->get_user()->id,
            ]);
            if ($progress) {
                writer::with_context($context)->export_data([], (object) [
                    'level' => $progress->level,
                    'xp'    => $progress->xp,
                ]);
            }
        }
    }

    public static function delete_data_for_all_users_in_context(\context $context): void {
        global $DB;
        if ($context->contextlevel !== CONTEXT_MODULE) {
            return;
        }
        $cm = get_coursemodule_from_id('pharos_itinerary', $context->instanceid);
        $DB->delete_records('pharos_itinerary_progress', ['itineraryid' => $cm->instance]);
    }

    public static function delete_data_for_user(approved_contextlist $contextlist): void {
        global $DB;
        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel !== CONTEXT_MODULE) {
                continue;
            }
            $cm = get_coursemodule_from_id('pharos_itinerary', $context->instanceid);
            $DB->delete_records('pharos_itinerary_progress', [
                'itineraryid' => $cm->instance,
                'userid'      => $contextlist->get_user()->id,
            ]);
        }
    }

    public static function delete_data_for_users(approved_userlist $userlist): void {
        global $DB;
        $context = $userlist->get_context();
        if ($context->contextlevel !== CONTEXT_MODULE) {
            return;
        }
        $cm      = get_coursemodule_from_id('pharos_itinerary', $context->instanceid);
        [$insql, $inparams] = $DB->get_in_or_equal($userlist->get_userids(), SQL_PARAMS_NAMED);
        $inparams['itineraryid'] = $cm->instance;
        $DB->delete_records_select(
            'pharos_itinerary_progress',
            "itineraryid = :itineraryid AND userid $insql",
            $inparams
        );
    }
}
