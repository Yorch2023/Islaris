<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace mod_pharos_itinerary;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/externallib.php');

/**
 * External (web service) functions for mod_pharos_itinerary.
 *
 * Exposed via the Moodle REST API at:
 *   /webservice/rest/server.php?wsfunction=mod_pharos_itinerary_get_user_progress
 *   /webservice/rest/server.php?wsfunction=mod_pharos_itinerary_award_xp
 */
class external extends \external_api {

    // ---- get_user_progress --------------------------------------------------

    public static function get_user_progress_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid'   => new \external_value(PARAM_INT, 'Course module ID'),
            'userid' => new \external_value(PARAM_INT, 'User ID (0 = current user)', VALUE_DEFAULT, 0),
        ]);
    }

    /**
     * Returns the XP and level for a user in the given itinerary.
     */
    public static function get_user_progress(int $cmid, int $userid = 0): array {
        global $USER, $DB;

        ['cmid' => $cmid, 'userid' => $userid] = self::validate_parameters(
            self::get_user_progress_parameters(),
            ['cmid' => $cmid, 'userid' => $userid]
        );

        [$course, $cm] = get_course_and_cm_from_cmid($cmid, 'pharos_itinerary');
        $context = \context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('mod/pharos_itinerary:view', $context);

        if ($userid === 0) {
            $userid = $USER->id;
        }

        // Only teachers/managers can query other users.
        if ($userid !== $USER->id) {
            require_capability('mod/pharos_itinerary:addinstance', $context);
        }

        $progress = pharos_itinerary_get_or_create_progress($cm->instance, $userid);

        $thresholds = [1 => 100, 2 => 250, 3 => 250];
        $xpNext     = $thresholds[$progress->level] ?? 250;

        return [
            'userid'      => $userid,
            'level'       => $progress->level,
            'xp'          => $progress->xp,
            'xp_next'     => $xpNext,
            'xp_percent'  => (int) min(100, round($progress->xp / $xpNext * 100)),
        ];
    }

    public static function get_user_progress_returns(): \external_single_structure {
        return new \external_single_structure([
            'userid'     => new \external_value(PARAM_INT,  'User ID'),
            'level'      => new \external_value(PARAM_INT,  'Current level (1-3)'),
            'xp'         => new \external_value(PARAM_INT,  'XP earned'),
            'xp_next'    => new \external_value(PARAM_INT,  'XP needed for next level'),
            'xp_percent' => new \external_value(PARAM_INT,  'Progress percentage (0-100)'),
        ]);
    }

    // ---- award_xp -----------------------------------------------------------

    public static function award_xp_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid'   => new \external_value(PARAM_INT, 'Course module ID'),
            'userid' => new \external_value(PARAM_INT, 'User ID'),
            'amount' => new \external_value(PARAM_INT, 'XP amount to award'),
        ]);
    }

    /**
     * Awards XP to a user. Requires addinstance (teacher/manager) capability.
     */
    public static function award_xp(int $cmid, int $userid, int $amount): array {
        global $DB;

        ['cmid' => $cmid, 'userid' => $userid, 'amount' => $amount] = self::validate_parameters(
            self::award_xp_parameters(),
            ['cmid' => $cmid, 'userid' => $userid, 'amount' => $amount]
        );

        if ($amount <= 0 || $amount > 1000) {
            throw new \invalid_parameter_exception('amount must be between 1 and 1000');
        }

        [$course, $cm] = get_course_and_cm_from_cmid($cmid, 'pharos_itinerary');
        $context = \context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('mod/pharos_itinerary:addinstance', $context);

        // Capture level before awarding so we can detect a level-up.
        $before   = pharos_itinerary_get_or_create_progress($cm->instance, $userid);
        $levelBefore = $before->level;

        $progress = pharos_itinerary_award_xp($cm->instance, $userid, $amount);

        return [
            'userid'      => $userid,
            'level'       => $progress->level,
            'xp'          => $progress->xp,
            'levelled_up' => $progress->level > $levelBefore,
        ];
    }

    public static function award_xp_returns(): \external_single_structure {
        return new \external_single_structure([
            'userid'     => new \external_value(PARAM_INT,  'User ID'),
            'level'      => new \external_value(PARAM_INT,  'New level (1-3)'),
            'xp'         => new \external_value(PARAM_INT,  'Total XP after award'),
            'levelled_up'=> new \external_value(PARAM_BOOL, 'True if user advanced to next level'),
        ]);
    }
}
