<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace block_pharos_onboarding\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\transform;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;

defined('MOODLE_INTERNAL') || die();

/**
 * Privacy provider for block_pharos_onboarding.
 *
 * Personal data stored:
 *   - user_preferences (key: pharos_diagnostic_profile) — the student's
 *     onboarding diagnostic answers (employment sector, digital experience,
 *     AI familiarity, learning goals, weekly time) and the recommended level.
 */
class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\plugin\provider,
    \core_privacy\local\request\core_userlist_provider {

    public static function get_metadata(collection $collection): collection {
        $collection->add_user_preference(
            'pharos_diagnostic_profile',
            'privacy:metadata:pharos_diagnostic_profile'
        );
        return $collection;
    }

    public static function get_contexts_for_userid(int $userid): contextlist {
        $contextlist = new contextlist();
        if (get_user_preferences('pharos_diagnostic_profile', null, $userid) !== null) {
            $contextlist->add_system_context();
        }
        return $contextlist;
    }

    public static function get_users_in_context(userlist $userlist): void {
        // User preferences are system-scoped; only act on system context requests.
        if ($userlist->get_context()->contextlevel !== CONTEXT_SYSTEM) {
            return;
        }
        // We cannot efficiently enumerate all users with this preference without
        // a full table scan; instead we check on demand in export/delete methods.
    }

    public static function export_user_data(approved_contextlist $contextlist): void {
        if (empty($contextlist->count())) {
            return;
        }
        $userid = $contextlist->get_user()->id;

        $json = get_user_preferences('pharos_diagnostic_profile', null, $userid);
        if ($json === null) {
            return;
        }

        $profile = json_decode($json, true) ?: [];

        $data = (object) [
            'employment'          => $profile['employment']         ?? '',
            'digital_experience'  => $profile['digital_exp']        ?? '',
            'ai_use'              => $profile['ai_use']              ?? '',
            'learning_goals'      => implode(', ', $profile['goals'] ?? []),
            'time_weekly'         => $profile['time_weekly']         ?? '',
            'recommended_level'   => $profile['recommended_level']   ?? '',
            'completed_at'        => transform::datetime($profile['completed_at'] ?? 0),
        ];

        writer::with_context(\context_system::instance())->export_data(
            [get_string('pluginname', 'block_pharos_onboarding'), 'diagnostic_profile'],
            $data
        );
    }

    public static function delete_data_for_all_users_in_context(\context $context): void {
        // Preferences are per-user; we cannot bulk-delete by context alone.
        // This method intentionally does nothing — use delete_data_for_user() for targeted deletion.
    }

    public static function delete_data_for_user(approved_contextlist $contextlist): void {
        if (empty($contextlist->count())) {
            return;
        }
        $userid = $contextlist->get_user()->id;
        unset_user_preference('pharos_diagnostic_profile', $userid);
    }

    public static function delete_data_for_users(approved_userlist $userlist): void {
        foreach ($userlist->get_userids() as $userid) {
            unset_user_preference('pharos_diagnostic_profile', $userid);
        }
    }
}
