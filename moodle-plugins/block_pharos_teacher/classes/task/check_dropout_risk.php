<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace block_pharos_teacher\task;

defined('MOODLE_INTERNAL') || die();

/**
 * Scheduled task: compute dropout risk for all students in all courses that
 * have the pharos_teacher block installed, and notify teachers when a student
 * first enters the "high risk" band (score ≥ 65).
 *
 * Runs Monday–Friday at 07:00 by default (configurable via admin > task scheduler).
 * Notifications are throttled: a teacher receives at most one alert per student
 * per 7-day window to avoid notification fatigue.
 */
class check_dropout_risk extends \core\task\scheduled_task {

    private const RISK_HIGH_THRESHOLD  = 65;
    private const ALERT_COOLDOWN_DAYS  = 7;

    public function get_name(): string {
        return get_string('task_check_dropout_risk', 'block_pharos_teacher');
    }

    public function execute(): void {
        global $DB;

        $now       = time();
        $weekAgo   = $now - (self::ALERT_COOLDOWN_DAYS * DAYSECS);
        $monthAgo  = $now - (30 * DAYSECS);
        $twoWeeksAgo = $now - (14 * DAYSECS);
        $cutoff    = $now - (7 * DAYSECS);

        // Find all courses that have the pharos_teacher block.
        $courseIds = $DB->get_fieldset_sql(
            "SELECT DISTINCT ctx.instanceid
               FROM {block_instances} bi
               JOIN {context} ctx ON ctx.id = bi.parentcontextid AND ctx.contextlevel = :ctxlevel
              WHERE bi.blockname = 'pharos_teacher'",
            ['ctxlevel' => CONTEXT_COURSE]
        );

        if (empty($courseIds)) {
            mtrace('pharos_teacher: no courses with block installed, nothing to check.');
            return;
        }

        $itineraryTableExists = $DB->get_manager()->table_exists('pharos_itinerary_progress');
        $evidenceTableExists  = $DB->get_manager()->table_exists('pharos_badges_evidence');
        $sessionsTableExists  = $DB->get_manager()->table_exists('block_pharos_tutor_sessions');

        $thresholds    = [1 => 100, 2 => 250, 3 => 250];
        $alertsCreated = 0;

        foreach ($courseIds as $courseId) {
            $courseId = (int) $courseId;
            $context  = \context_course::instance($courseId, IGNORE_MISSING);
            if (!$context) {
                continue;
            }

            // Get enrolled students.
            $students = get_enrolled_users($context, '', 0, 'u.id');
            if (empty($students)) {
                continue;
            }

            // Get teachers/managers in this course.
            $teachers = get_enrolled_users($context, 'block/pharos_teacher:view', 0, 'u.id');
            if (empty($teachers)) {
                continue;
            }

            // Get itinerary instance for this course.
            $itinerary = null;
            if ($itineraryTableExists) {
                $itinerary = $DB->get_record_sql(
                    "SELECT pi.id FROM {pharos_itinerary} pi
                       JOIN {course_modules} cm ON cm.instance = pi.id
                      WHERE pi.course = :course LIMIT 1",
                    ['course' => $courseId]
                );
            }

            foreach ($students as $student) {
                $studentId = (int) $student->id;

                // ── Compute risk score (same factors as block_pharos_teacher.php) ──

                $risk     = 0;
                $lastSeen = 0;
                $xp       = 0;
                $xpPercent = 0;

                // Factor 1: days since last itinerary activity.
                if ($itinerary && $itineraryTableExists) {
                    try {
                        $progress = $DB->get_record('pharos_itinerary_progress', [
                            'itineraryid' => $itinerary->id,
                            'userid'      => $studentId,
                        ]);
                        if ($progress) {
                            $level     = (int) $progress->level;
                            $xp        = (int) $progress->xp;
                            $xpNext    = $thresholds[$level] ?? 250;
                            $xpPercent = (int) min(100, round($xp / $xpNext * 100));
                            $lastSeen  = (int) $progress->timemodified;
                        }
                    } catch (\Throwable $e) {
                        // Non-critical.
                    }
                }

                $daysSince = $lastSeen ? (int) floor(($now - $lastSeen) / DAYSECS) : null;

                if ($daysSince === null) {
                    $risk += 35;
                } elseif ($daysSince > 21) {
                    $risk += 40;
                } elseif ($daysSince > 14) {
                    $risk += 28;
                } elseif ($daysSince > 7) {
                    $risk += 15;
                } elseif ($daysSince > 4) {
                    $risk += 5;
                }

                // Factor 2: AI session recency.
                $lastAiSession = 0;
                if ($sessionsTableExists) {
                    try {
                        $aiRow = $DB->get_field_sql(
                            "SELECT MAX(timecreated) FROM {block_pharos_tutor_sessions}
                              WHERE userid = :uid AND courseid = :cid",
                            ['uid' => $studentId, 'cid' => $courseId]
                        );
                        $lastAiSession = (int) ($aiRow ?: 0);
                    } catch (\Throwable $e) {
                        // Non-critical.
                    }
                }

                if ($lastAiSession === 0) {
                    $risk += 20;
                } elseif ($lastAiSession < $twoWeeksAgo) {
                    $risk += 30;
                } elseif ($lastAiSession < $weekAgo) {
                    $risk += 14;
                }

                // Factor 3: zero XP.
                if ($xp === 0) {
                    $risk += 20;
                } elseif ($xpPercent < 15) {
                    $risk += 8;
                }

                // Factor 4: no evidence.
                $hasEvidence = false;
                if ($evidenceTableExists) {
                    try {
                        $hasEvidence = $DB->record_exists('pharos_badges_evidence', [
                            'userid'   => $studentId,
                            'courseid' => $courseId,
                        ]);
                    } catch (\Throwable $e) {
                        // Non-critical.
                    }
                }
                if (!$hasEvidence) {
                    $risk += 10;
                }

                $risk = min(100, $risk);

                if ($risk < self::RISK_HIGH_THRESHOLD) {
                    continue;
                }

                // ── Notify teachers (with cooldown) ──────────────────────────

                $studentRecord = $DB->get_record('user', ['id' => $studentId],
                    'id, firstname, lastname, email', IGNORE_MISSING);
                if (!$studentRecord) {
                    continue;
                }
                $studentName = fullname($studentRecord);

                foreach ($teachers as $teacher) {
                    $teacherId = (int) $teacher->id;
                    if ($teacherId === $studentId) {
                        continue;
                    }

                    // Check cooldown: skip if we already notified this teacher
                    // about this student in the last 7 days.
                    $recentAlert = $DB->record_exists_select(
                        'block_pharos_teacher_alerts',
                        'courseid = :cid AND studentid = :sid AND teacherid = :tid AND timecreated >= :since',
                        ['cid' => $courseId, 'sid' => $studentId, 'tid' => $teacherId, 'since' => $weekAgo]
                    );
                    if ($recentAlert) {
                        continue;
                    }

                    $teacherRecord = $DB->get_record('user', ['id' => $teacherId],
                        'id, firstname, lastname, email, lang, timezone, mailformat', IGNORE_MISSING);
                    if (!$teacherRecord) {
                        continue;
                    }

                    $course = get_course($courseId);

                    $dashboardUrl = (new \moodle_url('/course/view.php', ['id' => $courseId]))->out(false);
                    $profileUrl   = (new \moodle_url('/user/view.php',
                        ['id' => $studentId, 'course' => $courseId]))->out(false);

                    $daysStr = $daysSince !== null
                        ? get_string('alert_days_inactive', 'block_pharos_teacher', $daysSince)
                        : get_string('alert_never_active',  'block_pharos_teacher');

                    $subject = get_string('alert_subject', 'block_pharos_teacher', [
                        'student' => $studentName,
                        'course'  => format_string($course->fullname),
                    ]);

                    $bodyText = get_string('alert_body', 'block_pharos_teacher', [
                        'student'    => $studentName,
                        'course'     => format_string($course->fullname),
                        'risk'       => $risk,
                        'days'       => $daysStr,
                        'profileurl' => $profileUrl,
                        'dashboard'  => $dashboardUrl,
                    ]);

                    $eventdata                     = new \core\message\message();
                    $eventdata->component          = 'block_pharos_teacher';
                    $eventdata->name               = 'dropout_alert';
                    $eventdata->userfrom           = \core_user::get_noreply_user();
                    $eventdata->userto             = $teacherRecord;
                    $eventdata->subject            = $subject;
                    $eventdata->fullmessage        = $bodyText;
                    $eventdata->fullmessageformat  = FORMAT_PLAIN;
                    $eventdata->fullmessagehtml    = text_to_html($bodyText, false, false, true);
                    $eventdata->smallmessage       = $subject;
                    $eventdata->notification       = 1;
                    $eventdata->contexturl         = $dashboardUrl;
                    $eventdata->contexturlname     = get_string('pluginname', 'block_pharos_teacher');

                    try {
                        message_send($eventdata);
                    } catch (\Throwable $e) {
                        mtrace('pharos_teacher: failed to send alert: ' . $e->getMessage());
                        continue;
                    }

                    // Record the alert to enforce the cooldown.
                    $DB->insert_record('block_pharos_teacher_alerts', (object) [
                        'courseid'    => $courseId,
                        'studentid'   => $studentId,
                        'teacherid'   => $teacherId,
                        'risk_score'  => $risk,
                        'timecreated' => $now,
                    ]);

                    $alertsCreated++;
                }
            }
        }

        mtrace("pharos_teacher: check_dropout_risk completed. Alerts sent: {$alertsCreated}.");
    }
}
