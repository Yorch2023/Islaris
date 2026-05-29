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
}
