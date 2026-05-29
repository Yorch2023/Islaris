<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * PHPUnit tests for block_pharos_tutor.
 *
 * @group block_pharos_tutor
 */
class block_pharos_tutor_test extends advanced_testcase {

    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest(true);
    }

    public function test_block_instance_can_be_created(): void {
        $block = block_instance('pharos_tutor');
        $this->assertInstanceOf('block_pharos_tutor', $block);
    }

    public function test_has_config_returns_true(): void {
        $block = block_instance('pharos_tutor');
        $this->assertTrue($block->has_config());
    }

    public function test_applicable_formats_includes_course(): void {
        $block   = block_instance('pharos_tutor');
        $formats = $block->applicable_formats();
        $this->assertArrayHasKey('course', $formats);
        $this->assertTrue($formats['course']);
    }

    public function test_applicable_formats_includes_my(): void {
        $block   = block_instance('pharos_tutor');
        $formats = $block->applicable_formats();
        $this->assertArrayHasKey('my', $formats);
        $this->assertTrue($formats['my']);
    }

    public function test_get_content_returns_warning_when_not_configured(): void {
        // Ensure settings are empty.
        set_config('middleware_url', '', 'block_pharos_tutor');
        set_config('moodle_secret',  '', 'block_pharos_tutor');

        $generator = $this->getDataGenerator();
        $user      = $generator->create_user();
        $course    = $generator->create_course();
        $this->setUser($user);

        $page = new moodle_page();
        $page->set_context(context_course::instance($course->id));
        $page->set_url('/course/view.php', ['id' => $course->id]);

        $block = block_instance('pharos_tutor');
        $block->_init();

        $content = $block->get_content();
        $this->assertStringContainsString('middleware_not_configured', strip_tags($content->text ?? ''));
    }
}
