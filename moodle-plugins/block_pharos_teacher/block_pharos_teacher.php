<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * PHAROS-AI Teacher Dashboard block.
 *
 * Displays for teachers:
 *  - Count of students inactive > 7 days
 *  - Count of pending evidence reviews
 *  - Per-student progress summary (level, XP %, last activity)
 *  - Direct link to the activity generator
 */
class block_pharos_teacher extends block_base {

    public function name(): string {
        return 'pharos_teacher';
    }

    public function init(): void {
        $this->title = get_string('pluginname', 'block_pharos_teacher');
    }

    public function has_config(): bool {
        return false;
    }

    public function applicable_formats(): array {
        return ['course' => true, 'site' => false, 'my' => false];
    }

    public function get_content(): ?stdClass {
        global $COURSE, $PAGE, $DB;

        if ($this->content !== null) {
            return $this->content;
        }

        $this->content = new stdClass();
        $this->content->footer = '';

        try {
            $context = context_course::instance($COURSE->id);
        } catch (Exception $e) {
            $this->content->text = '';
            return $this->content;
        }

        if (!has_capability('block/pharos_teacher:view', $context)) {
            $this->content->text = '';
            return $this->content;
        }

        $students = get_enrolled_users($context, '', 0, 'u.id, u.firstname, u.lastname');

        // Find the first itinerary instance in this course (only if tables exist).
        $itinerary = null;
        try {
            if ($DB->get_manager()->table_exists('pharos_itinerary')) {
                $itinerary = $DB->get_record_sql(
                    "SELECT pi.id FROM {pharos_itinerary} pi
                       JOIN {course_modules} cm ON cm.instance = pi.id
                      WHERE pi.course = :course LIMIT 1",
                    ['course' => $COURSE->id]
                );
            }
        } catch (Exception $e) {
            // Table not yet installed; no itinerary data available.
        }

        $inactiveDays = 7;
        $now          = time();
        $cutoff       = $now - ($inactiveDays * DAYSECS);

        $studentsData  = [];
        $inactiveCount = 0;
        $pendingCount  = 0;

        $levelLabels = [
            1 => 'N1', 2 => 'N2', 3 => 'N3',
        ];
        $thresholds = [1 => 100, 2 => 250, 3 => 250];

        $itineraryTableExists = false;
        $evidenceTableExists  = false;
        $sessionsTableExists  = false;
        try {
            $itineraryTableExists = $DB->get_manager()->table_exists('pharos_itinerary_progress');
            $evidenceTableExists  = $DB->get_manager()->table_exists('pharos_badges_evidence');
            $sessionsTableExists  = $DB->get_manager()->table_exists('block_pharos_tutor_sessions');
        } catch (Exception $e) {
            // Tables not yet installed; skip progress and evidence data.
        }

        $weekAgo  = $now - (7  * DAYSECS);
        $monthAgo = $now - (30 * DAYSECS);

        foreach ($students as $student) {
            $progress = null;
            if ($itinerary && $itineraryTableExists) {
                try {
                    $progress = $DB->get_record('pharos_itinerary_progress', [
                        'itineraryid' => $itinerary->id,
                        'userid'      => $student->id,
                    ]);
                } catch (Exception $e) {
                    // Graceful fallback.
                }
            }

            $level      = $progress->level ?? 1;
            $xp         = $progress->xp    ?? 0;
            $xpNext     = $thresholds[$level] ?? 250;
            $xpPercent  = (int) min(100, round($xp / $xpNext * 100));
            $lastSeen   = $progress->timemodified ?? 0;
            $daysSince  = $lastSeen ? (int) floor(($now - $lastSeen) / DAYSECS) : null;
            $isInactive = $lastSeen < $cutoff;

            if ($isInactive) {
                $inactiveCount++;
            }

            // Count pending evidence per level: started but threshold not yet reached.
            $evidenceThresholds = [1 => 3, 2 => 4, 3 => 5];
            $evidenceRows = [];
            if ($evidenceTableExists) {
                try {
                    $evidenceRows = $DB->get_records_sql(
                        "SELECT level, COUNT(*) AS cnt
                           FROM {pharos_badges_evidence}
                          WHERE userid = :userid AND courseid = :courseid
                          GROUP BY level",
                        ['userid' => $student->id, 'courseid' => $COURSE->id]
                    );
                } catch (Exception $e) {
                    // Graceful fallback.
                }
            }
            $hasPending = false;
            foreach ($evidenceRows as $row) {
                $threshold = $evidenceThresholds[(int) $row->level] ?? PHP_INT_MAX;
                if ($row->cnt > 0 && $row->cnt < $threshold) {
                    $hasPending = true;
                    break;
                }
            }
            if ($hasPending) {
                $pendingCount++;
            }

            // AI session stats for this student.
            $aiSessionsWeek  = 0;
            $aiMessagesTotal = 0;
            $lastAiSession   = 0;
            if ($sessionsTableExists) {
                try {
                    $aiRow = $DB->get_record_sql(
                        "SELECT COUNT(*) AS total_sessions,
                                COALESCE(SUM(message_count), 0) AS total_messages,
                                MAX(timecreated) AS last_session
                           FROM {block_pharos_tutor_sessions}
                          WHERE userid = :uid AND courseid = :cid",
                        ['uid' => $student->id, 'cid' => $COURSE->id]
                    );
                    if ($aiRow) {
                        $aiMessagesTotal = (int) $aiRow->total_messages;
                        $lastAiSession   = (int) $aiRow->last_session;
                    }
                    $aiWeekRow = $DB->count_records_select(
                        'block_pharos_tutor_sessions',
                        'userid = :uid AND courseid = :cid AND timecreated >= :week',
                        ['uid' => $student->id, 'cid' => $COURSE->id, 'week' => $weekAgo]
                    );
                    $aiSessionsWeek = (int) $aiWeekRow;
                } catch (Exception $e) {
                    // Graceful fallback.
                }
            }

            $aiStatus = 'inactive';
            if ($lastAiSession >= $weekAgo) {
                $aiStatus = 'active';
            } elseif ($lastAiSession >= $monthAgo) {
                $aiStatus = 'recent';
            }

            $profileUrl = new moodle_url('/user/view.php', ['id' => $student->id, 'course' => $COURSE->id]);

            $messageUrl = (new moodle_url('/message/index.php', ['id' => $student->id]))->out(false);

            $studentsData[] = [
                'id'                => $student->id,
                'name'              => fullname($student),
                'profile_url'       => $profileUrl->out(false),
                'message_url'       => $messageUrl,
                'level'             => $level,
                'level_label'       => $levelLabels[$level] ?? 'N1',
                'xp_percent'        => $xpPercent,
                'xp_aria_label'     => get_string('xp_progress_label', 'block_pharos_teacher', $xpPercent),
                'days_inactive'     => $daysSince,
                'is_inactive'       => $isInactive,
                'evidence_pending'  => $hasPending,
                'ai_sessions_week'  => $aiSessionsWeek,
                'ai_messages_total' => $aiMessagesTotal,
                'ai_status_active'  => $aiStatus === 'active',
                'ai_status_recent'  => $aiStatus === 'recent',
                'ai_status_none'    => $aiStatus === 'inactive',
            ];
        }

        $generatorPageUrl = (new moodle_url(
            '/blocks/pharos_teacher/generator.php',
            ['courseid' => $COURSE->id]
        ))->out(false);

        // Manage activities URL: only expose when an itinerary CM exists.
        $manageUrl = '';
        try {
            $itineraryCm = $DB->get_record_sql(
                "SELECT cm.id FROM {course_modules} cm
                   JOIN {modules} m ON m.id = cm.module AND m.name = 'pharos_itinerary'
                  WHERE cm.course = :course LIMIT 1",
                ['course' => $COURSE->id]
            );
            if ($itineraryCm && has_capability('mod/pharos_itinerary:addinstance', $context)) {
                $manageUrl = (new moodle_url('/mod/pharos_itinerary/manage_activities.php', ['id' => $itineraryCm->id]))->out(false);
            }
        } catch (Exception $e) {
            // Module not yet installed; no manage URL.
        }

        $aiDetailUrl = (new moodle_url(
            '/blocks/pharos_teacher/ajax-ai-detail.php',
            ['courseid' => $COURSE->id]
        ))->out(false);

        $templateData = [
            'students'       => $studentsData,
            'student_count'  => count($studentsData),
            'inactive_count' => $inactiveCount,
            'pending_count'  => $pendingCount,
            'generator_url'  => $generatorPageUrl,
            'manage_url'     => $manageUrl,
            'ai_detail_url'  => $aiDetailUrl,
            'sesskey'        => sesskey(),
        ];

        $this->content->text = $PAGE->get_renderer('core')
            ->render_from_template('block_pharos_teacher/teacher_dashboard', $templateData);

        $PAGE->requires->js_call_amd('block_pharos_teacher/teacher-dashboard', 'init');

        return $this->content;
    }
}
