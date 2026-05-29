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

        $context = context_course::instance($COURSE->id);

        if (!has_capability('block/pharos_teacher:view', $context)) {
            $this->content->text = '';
            return $this->content;
        }

        $students = get_enrolled_users($context, 'mod/pharos_itinerary:view', 0, 'u.id, u.firstname, u.lastname');

        // Find the first itinerary instance in this course.
        $itinerary = $DB->get_record_sql(
            "SELECT pi.id FROM {pharos_itinerary} pi
               JOIN {course_modules} cm ON cm.instance = pi.id
              WHERE pi.course = :course LIMIT 1",
            ['course' => $COURSE->id]
        );

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

        foreach ($students as $student) {
            $progress = null;
            if ($itinerary) {
                $progress = $DB->get_record('pharos_itinerary_progress', [
                    'itineraryid' => $itinerary->id,
                    'userid'      => $student->id,
                ]);
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

            // Count pending evidence: submitted but count < threshold.
            $evidenceCount = (int) $DB->count_records('pharos_badges_evidence', [
                'userid'   => $student->id,
                'courseid' => $COURSE->id,
            ]);
            $hasPending = $evidenceCount > 0 && $evidenceCount < array_sum([3, 4, 5]);
            if ($hasPending) {
                $pendingCount++;
            }

            $profileUrl = new moodle_url('/user/view.php', ['id' => $student->id, 'course' => $COURSE->id]);

            $studentsData[] = [
                'name'             => fullname($student),
                'profile_url'      => $profileUrl->out(false),
                'level'            => $level,
                'level_label'      => $levelLabels[$level] ?? 'N1',
                'xp_percent'       => $xpPercent,
                'days_inactive'    => $daysSince,
                'is_inactive'      => $isInactive,
                'evidence_pending' => $hasPending,
            ];
        }

        // Generator URL: link to the first mod_pharos_badges instance.
        $generatorUrl = '#';
        $badgesCm = $DB->get_record_sql(
            "SELECT cm.id FROM {course_modules} cm
               JOIN {modules} m ON m.id = cm.module AND m.name = 'pharos_badges'
              WHERE cm.course = :course LIMIT 1",
            ['course' => $COURSE->id]
        );
        if ($badgesCm) {
            $generatorUrl = (new moodle_url('/mod/pharos_badges/view.php', ['id' => $badgesCm->id]))->out(false);
        }

        $middlewareUrl = rtrim(get_config('block_pharos_tutor', 'middleware_url') ?: '#', '/');
        $generatorPageUrl = $middlewareUrl !== '#'
            ? $middlewareUrl . '/generator'
            : $generatorUrl;

        $templateData = [
            'students'       => $studentsData,
            'inactive_count' => $inactiveCount,
            'pending_count'  => $pendingCount,
            'generator_url'  => $generatorPageUrl,
        ];

        $this->content->text = $PAGE->get_renderer('core')
            ->render_from_template('block_pharos_teacher/teacher_dashboard', $templateData);

        return $this->content;
    }
}
