<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace mod_pharos_itinerary;

defined('MOODLE_INTERNAL') || die();

/**
 * Event observer for mod_pharos_itinerary.
 * Sends a Moodle notification to the student when they advance a level.
 */
class observer {

    /**
     * Fired when a user reaches the XP threshold and advances to the next level.
     */
    public static function on_level_up(\mod_pharos_itinerary\event\level_up $event): void {
        global $DB;

        $userId   = $event->userid;
        $newLevel = $event->other['new_level'] ?? null;
        if (!$newLevel) {
            return;
        }

        $student = $DB->get_record('user', ['id' => $userId],
            'id, firstname, lastname, email, lang, timezone, mailformat', IGNORE_MISSING);
        if (!$student || isguestuser($student)) {
            return;
        }

        $levelNames = [
            1 => get_string('level1_desc', 'mod_pharos_itinerary'),
            2 => get_string('level2_desc', 'mod_pharos_itinerary'),
            3 => get_string('level3_desc', 'mod_pharos_itinerary'),
        ];

        $levelLabel = 'N' . $newLevel;
        $levelDesc  = $levelNames[$newLevel] ?? '';

        $subject = get_string('notify_level_up_subject', 'mod_pharos_itinerary', [
            'level' => $levelLabel,
        ]);

        $courseId  = $event->get_context()->get_course_context()->instanceid ?? null;
        $courseUrl = $courseId
            ? (new \moodle_url('/course/view.php', ['id' => $courseId]))->out(false)
            : (new \moodle_url('/my'))->out(false);

        $body = get_string('notify_level_up_body', 'mod_pharos_itinerary', [
            'name'      => fullname($student),
            'level'     => $levelLabel,
            'leveldesc' => $levelDesc,
            'courseurl' => $courseUrl,
        ]);

        $msg                    = new \core\message\message();
        $msg->component         = 'mod_pharos_itinerary';
        $msg->name              = 'level_up';
        $msg->userfrom          = \core_user::get_noreply_user();
        $msg->userto            = $student;
        $msg->subject           = $subject;
        $msg->fullmessage       = $body;
        $msg->fullmessageformat = FORMAT_PLAIN;
        $msg->fullmessagehtml   = text_to_html($body, false, false, true);
        $msg->smallmessage      = $subject;
        $msg->notification      = 1;
        $msg->contexturl        = $courseUrl;
        $msg->contexturlname    = get_string('pluginname', 'mod_pharos_itinerary');

        try {
            message_send($msg);
        } catch (\Throwable $e) {
            // Non-critical: log and continue.
            debugging('pharos_itinerary: failed to send level_up notification: ' . $e->getMessage());
        }
    }
}
