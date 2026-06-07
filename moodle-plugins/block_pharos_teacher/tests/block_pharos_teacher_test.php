<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * PHPUnit tests for block_pharos_teacher.
 *
 * @group block_pharos_teacher
 */
class block_pharos_teacher_test extends advanced_testcase {

    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest(true);
    }

    public function test_block_can_be_instantiated(): void {
        $block = block_instance('pharos_teacher');
        $this->assertInstanceOf('block_pharos_teacher', $block);
    }

    public function test_has_no_config(): void {
        $block = block_instance('pharos_teacher');
        $this->assertFalse($block->has_config());
    }

    public function test_applicable_formats_course_only(): void {
        $block   = block_instance('pharos_teacher');
        $formats = $block->applicable_formats();
        $this->assertTrue($formats['course']);
        $this->assertFalse($formats['site'] ?? false);
    }

    public function test_get_content_empty_for_student(): void {
        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $student   = $generator->create_user();
        $generator->enrol_user($student->id, $course->id, 'student');

        $this->setUser($student);

        $page = new moodle_page();
        $page->set_context(context_course::instance($course->id));
        $page->set_url('/course/view.php', ['id' => $course->id]);

        $block = block_instance('pharos_teacher');
        $block->_init();

        global $COURSE;
        $COURSE = $course;

        $content = $block->get_content();
        $this->assertEmpty(trim($content->text ?? ''));
    }

    public function test_get_content_visible_for_teacher(): void {
        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $teacher   = $generator->create_user();
        $generator->enrol_user($teacher->id, $course->id, 'editingteacher');

        $this->setUser($teacher);

        global $COURSE;
        $COURSE = $course;

        $page = new moodle_page();
        $page->set_context(context_course::instance($course->id));
        $page->set_url('/course/view.php', ['id' => $course->id]);

        $block = block_instance('pharos_teacher');
        $block->_init();

        // With no students enrolled the content should still render (no exception).
        $content = $block->get_content();
        $this->assertNotNull($content);
    }

    // ── Privacy: metadata ─────────────────────────────────────────────────────

    public function test_privacy_metadata_declares_alerts_table(): void {
        $collection = new \core_privacy\local\metadata\collection('block_pharos_teacher');
        $result     = \block_pharos_teacher\privacy\provider::get_metadata($collection);
        $names      = array_map(fn($i) => $i->get_name(), $result->get_collection());
        $this->assertContains('block_pharos_teacher_alerts', $names);
    }

    // ── Privacy: get_contexts_for_userid ─────────────────────────────────────

    public function test_get_contexts_empty_when_no_alerts(): void {
        $user = $this->getDataGenerator()->create_user();
        $ctx  = \block_pharos_teacher\privacy\provider::get_contexts_for_userid($user->id);
        $this->assertCount(0, $ctx);
    }

    public function test_get_contexts_returns_course_context_as_student(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $student   = $generator->create_user();
        $teacher   = $generator->create_user();
        $course    = $generator->create_course();

        $DB->insert_record('block_pharos_teacher_alerts', (object) [
            'courseid'    => $course->id,
            'studentid'   => $student->id,
            'teacherid'   => $teacher->id,
            'risk_score'  => 70,
            'timecreated' => time(),
        ]);

        $ctx = \block_pharos_teacher\privacy\provider::get_contexts_for_userid($student->id);
        $this->assertCount(1, $ctx);
        $contexts = $ctx->get_contexts();
        $this->assertEquals(CONTEXT_COURSE, reset($contexts)->contextlevel);
    }

    // ── Privacy: delete_data_for_users (the PostgreSQL-safe version) ──────────

    public function test_delete_data_for_users_removes_batch_safely(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $s1     = $generator->create_user();
        $s2     = $generator->create_user();
        $s3     = $generator->create_user();
        $teacher= $generator->create_user();
        $course = $generator->create_course();

        foreach ([$s1, $s2, $s3] as $s) {
            $DB->insert_record('block_pharos_teacher_alerts', (object) [
                'courseid'    => $course->id,
                'studentid'   => $s->id,
                'teacherid'   => $teacher->id,
                'risk_score'  => 75,
                'timecreated' => time(),
            ]);
        }

        $ctx      = context_course::instance($course->id);
        $userlist = new \core_privacy\local\request\approved_userlist(
            $ctx, 'block_pharos_teacher', [$s1->id, $s2->id]
        );
        \block_pharos_teacher\privacy\provider::delete_data_for_users($userlist);

        // s1 and s2 removed; s3 survives.
        $this->assertFalse($DB->record_exists('block_pharos_teacher_alerts', [
            'courseid' => $course->id, 'studentid' => $s1->id,
        ]));
        $this->assertFalse($DB->record_exists('block_pharos_teacher_alerts', [
            'courseid' => $course->id, 'studentid' => $s2->id,
        ]));
        $this->assertTrue($DB->record_exists('block_pharos_teacher_alerts', [
            'courseid' => $course->id, 'studentid' => $s3->id,
        ]));
    }

    // ── Privacy: delete_data_for_all_users_in_context ────────────────────────

    public function test_delete_all_users_in_context_clears_course_alerts(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $s      = $generator->create_user();
        $t      = $generator->create_user();
        $course = $generator->create_course();

        $DB->insert_record('block_pharos_teacher_alerts', (object) [
            'courseid'    => $course->id,
            'studentid'   => $s->id,
            'teacherid'   => $t->id,
            'risk_score'  => 80,
            'timecreated' => time(),
        ]);

        \block_pharos_teacher\privacy\provider::delete_data_for_all_users_in_context(
            context_course::instance($course->id)
        );

        $this->assertEquals(0, $DB->count_records('block_pharos_teacher_alerts', [
            'courseid' => $course->id,
        ]));
    }
}
