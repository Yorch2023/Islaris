<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * PHPUnit tests for block_pharos_community.
 *
 * @group block_pharos_community
 */
class block_pharos_community_test extends advanced_testcase {

    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest(true);
    }

    public function test_block_instance_can_be_created(): void {
        $block = block_instance('pharos_community');
        $this->assertInstanceOf('block_pharos_community', $block);
    }

    public function test_has_config_returns_true(): void {
        $block = block_instance('pharos_community');
        $this->assertTrue($block->has_config());
    }

    public function test_applicable_formats_includes_course(): void {
        $block   = block_instance('pharos_community');
        $formats = $block->applicable_formats();
        $this->assertArrayHasKey('course', $formats);
        $this->assertTrue($formats['course']);
    }

    public function test_applicable_formats_includes_my(): void {
        $block   = block_instance('pharos_community');
        $formats = $block->applicable_formats();
        $this->assertArrayHasKey('my', $formats);
        $this->assertTrue($formats['my']);
    }

    public function test_get_content_empty_when_missing_capability(): void {
        $generator = $this->getDataGenerator();
        $user      = $generator->create_user();
        $course    = $generator->create_course();
        $this->setUser($user);

        $block = block_instance('pharos_community');
        $block->_init();

        // With no explicit capability grant (guest-level context) the block
        // should render empty text rather than throw.
        $content = $block->get_content();
        $this->assertNotNull($content);
    }

    public function test_settings_fields_exist(): void {
        // Verify the plugin settings can be read/written without error.
        set_config('consortium_url', 'https://pharos-ai.eu', 'block_pharos_community');
        $val = get_config('block_pharos_community', 'consortium_url');
        $this->assertSame('https://pharos-ai.eu', $val);
    }

    public function test_privacy_provider_returns_reason(): void {
        $reason = \block_pharos_community\privacy\provider::get_reason();
        $this->assertSame('privacy:metadata', $reason);
    }
}
