<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * PHPUnit tests for the check_dropout_risk scheduled task.
 *
 * @group block_pharos_teacher
 */
class check_dropout_risk_task_test extends advanced_testcase {

    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest(true);
    }

    // ── Task registration ────────────────────────────────────────────────────

    public function test_task_class_exists(): void {
        $this->assertTrue(
            class_exists('\block_pharos_teacher\task\check_dropout_risk')
        );
    }

    public function test_task_has_name(): void {
        $task = new \block_pharos_teacher\task\check_dropout_risk();
        $name = $task->get_name();
        $this->assertIsString($name);
        $this->assertNotEmpty($name);
    }

    public function test_task_is_scheduled_task(): void {
        $task = new \block_pharos_teacher\task\check_dropout_risk();
        $this->assertInstanceOf(\core\task\scheduled_task::class, $task);
    }

    // ── Execute without courses ──────────────────────────────────────────────

    public function test_execute_no_courses_does_not_throw(): void {
        // No courses have the pharos_teacher block → task should return silently.
        $task = new \block_pharos_teacher\task\check_dropout_risk();

        // Capture mtrace output so it doesn't pollute test output.
        ob_start();
        $task->execute();
        $output = ob_get_clean();

        $this->assertStringContainsString('nothing to check', $output);
    }

    // ── Execute with a course that has the block ─────────────────────────────

    public function test_execute_with_course_does_not_throw(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $teacher   = $generator->create_user();
        $student   = $generator->create_user();

        $generator->enrol_user($teacher->id, $course->id, 'editingteacher');
        $generator->enrol_user($student->id, $course->id, 'student');

        // Register the pharos_teacher block in this course context so the task picks it up.
        $courseCtx = context_course::instance($course->id);
        $DB->insert_record('block_instances', (object) [
            'blockname'         => 'pharos_teacher',
            'parentcontextid'   => $courseCtx->id,
            'showinsubcontexts' => 0,
            'requiredbytheme'   => 0,
            'pagetypepattern'   => 'course-view-*',
            'subpagepattern'    => null,
            'defaultregion'     => 'side-pre',
            'defaultweight'     => 0,
            'configdata'        => '',
            'timecreated'       => time(),
            'timemodified'      => time(),
        ]);

        $task = new \block_pharos_teacher\task\check_dropout_risk();
        ob_start();
        $task->execute();
        ob_end_clean();

        // No exception thrown → pass.
        $this->assertTrue(true);
    }

    // ── Alert cooldown ───────────────────────────────────────────────────────

    public function test_no_duplicate_alerts_within_cooldown(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $teacher   = $generator->create_user();
        $student   = $generator->create_user();

        $generator->enrol_user($teacher->id, $course->id, 'editingteacher');
        $generator->enrol_user($student->id, $course->id, 'student');

        $courseCtx = context_course::instance($course->id);
        $DB->insert_record('block_instances', (object) [
            'blockname'         => 'pharos_teacher',
            'parentcontextid'   => $courseCtx->id,
            'showinsubcontexts' => 0,
            'requiredbytheme'   => 0,
            'pagetypepattern'   => 'course-view-*',
            'subpagepattern'    => null,
            'defaultregion'     => 'side-pre',
            'defaultweight'     => 0,
            'configdata'        => '',
            'timecreated'       => time(),
            'timemodified'      => time(),
        ]);

        // Pre-insert a recent alert record for this pair.
        $DB->insert_record('block_pharos_teacher_alerts', (object) [
            'courseid'    => $course->id,
            'studentid'   => $student->id,
            'teacherid'   => $teacher->id,
            'risk_score'  => 75,
            'timecreated' => time() - DAYSECS, // 1 day ago — within 7-day cooldown
        ]);

        $alertsBefore = $DB->count_records('block_pharos_teacher_alerts');

        $task = new \block_pharos_teacher\task\check_dropout_risk();
        ob_start();
        $task->execute();
        ob_end_clean();

        $alertsAfter = $DB->count_records('block_pharos_teacher_alerts');
        // Cooldown should have prevented any new alerts from being inserted.
        $this->assertEquals($alertsBefore, $alertsAfter);
    }

    // ── DB tables check ──────────────────────────────────────────────────────

    public function test_alerts_table_exists(): void {
        global $DB;
        $this->assertTrue($DB->get_manager()->table_exists('block_pharos_teacher_alerts'));
    }

    public function test_alerts_table_has_expected_columns(): void {
        global $DB;

        $columns = array_keys($DB->get_columns('block_pharos_teacher_alerts'));
        foreach (['id', 'courseid', 'studentid', 'teacherid', 'risk_score', 'timecreated'] as $col) {
            $this->assertContains($col, $columns, "Missing column: $col");
        }
    }
}
