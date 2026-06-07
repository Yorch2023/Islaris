<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * PHPUnit tests for block_pharos_onboarding.
 *
 * Covers: block basics, privacy provider CRUD, and export shape.
 *
 * @group block_pharos_onboarding
 */
class block_pharos_onboarding_test extends advanced_testcase {

    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest(true);
    }

    // ── Block basics ──────────────────────────────────────────────────────────

    public function test_block_can_be_instantiated(): void {
        $block = block_instance('pharos_onboarding');
        $this->assertInstanceOf('block_pharos_onboarding', $block);
    }

    public function test_has_no_config(): void {
        $block = block_instance('pharos_onboarding');
        $this->assertFalse($block->has_config());
    }

    public function test_applicable_formats_includes_course(): void {
        $block   = block_instance('pharos_onboarding');
        $formats = $block->applicable_formats();
        $this->assertArrayHasKey('course', $formats);
        $this->assertTrue($formats['course']);
    }

    // ── Privacy: get_contexts_for_userid ─────────────────────────────────────

    public function test_get_contexts_empty_when_no_preference(): void {
        $user = $this->getDataGenerator()->create_user();

        $contextlist = \block_pharos_onboarding\privacy\provider::get_contexts_for_userid($user->id);
        $this->assertCount(0, $contextlist);
    }

    public function test_get_contexts_returns_system_context_when_preference_set(): void {
        $user = $this->getDataGenerator()->create_user();
        set_user_preference('pharos_diagnostic_profile', '{"employment":"education"}', $user->id);

        $contextlist = \block_pharos_onboarding\privacy\provider::get_contexts_for_userid($user->id);
        $this->assertCount(1, $contextlist);

        $contexts = $contextlist->get_contexts();
        $this->assertEquals(CONTEXT_SYSTEM, reset($contexts)->contextlevel);
    }

    // ── Privacy: export_user_data ─────────────────────────────────────────────

    public function test_export_user_data_writes_expected_fields(): void {
        $user = $this->getDataGenerator()->create_user();

        $profile = [
            'employment'        => 'education',
            'digital_exp'       => 'intermediate',
            'ai_use'            => 'occasional',
            'goals'             => ['understand', 'protect'],
            'time_weekly'       => '1to2',
            'recommended_level' => 'N2',
            'completed_at'      => 1700000000,
        ];
        set_user_preference('pharos_diagnostic_profile', json_encode($profile), $user->id);

        $contextlist = new \core_privacy\local\request\approved_contextlist(
            $user,
            'block_pharos_onboarding',
            [\context_system::instance()->id]
        );

        \block_pharos_onboarding\privacy\provider::export_user_data($contextlist);

        $writer = \core_privacy\local\request\writer::with_context(\context_system::instance());
        $data   = $writer->get_data(
            [get_string('pluginname', 'block_pharos_onboarding'), 'diagnostic_profile']
        );

        $this->assertNotNull($data);
        $this->assertEquals('education',   $data->employment);
        $this->assertEquals('intermediate', $data->digital_experience);
        $this->assertEquals('N2',          $data->recommended_level);
        $this->assertStringContainsString('understand', $data->learning_goals);
    }

    public function test_export_user_data_noop_when_no_preference(): void {
        $user = $this->getDataGenerator()->create_user();

        $contextlist = new \core_privacy\local\request\approved_contextlist(
            $user,
            'block_pharos_onboarding',
            [\context_system::instance()->id]
        );

        // Should not throw.
        \block_pharos_onboarding\privacy\provider::export_user_data($contextlist);

        $writer = \core_privacy\local\request\writer::with_context(\context_system::instance());
        $data   = $writer->get_data(
            [get_string('pluginname', 'block_pharos_onboarding'), 'diagnostic_profile']
        );
        $this->assertNull($data);
    }

    // ── Privacy: delete_data_for_user ────────────────────────────────────────

    public function test_delete_data_for_user_removes_preference(): void {
        $user = $this->getDataGenerator()->create_user();
        set_user_preference('pharos_diagnostic_profile', '{"employment":"education"}', $user->id);

        $this->assertNotNull(
            get_user_preferences('pharos_diagnostic_profile', null, $user->id)
        );

        $contextlist = new \core_privacy\local\request\approved_contextlist(
            $user,
            'block_pharos_onboarding',
            [\context_system::instance()->id]
        );
        \block_pharos_onboarding\privacy\provider::delete_data_for_user($contextlist);

        $this->assertNull(
            get_user_preferences('pharos_diagnostic_profile', null, $user->id)
        );
    }

    // ── Privacy: delete_data_for_users ───────────────────────────────────────

    public function test_delete_data_for_users_removes_batch(): void {
        $u1 = $this->getDataGenerator()->create_user();
        $u2 = $this->getDataGenerator()->create_user();
        $u3 = $this->getDataGenerator()->create_user();

        foreach ([$u1, $u2, $u3] as $u) {
            set_user_preference('pharos_diagnostic_profile', '{"employment":"education"}', $u->id);
        }

        $userlist = new \core_privacy\local\request\approved_userlist(
            \context_system::instance(),
            'block_pharos_onboarding',
            [$u1->id, $u2->id]
        );
        \block_pharos_onboarding\privacy\provider::delete_data_for_users($userlist);

        $this->assertNull(get_user_preferences('pharos_diagnostic_profile', null, $u1->id));
        $this->assertNull(get_user_preferences('pharos_diagnostic_profile', null, $u2->id));
        // u3 was NOT in the batch — preference must survive.
        $this->assertNotNull(get_user_preferences('pharos_diagnostic_profile', null, $u3->id));
    }

    // ── Privacy: get_metadata ────────────────────────────────────────────────

    public function test_get_metadata_declares_preference_key(): void {
        $collection = new \core_privacy\local\metadata\collection('block_pharos_onboarding');
        $result     = \block_pharos_onboarding\privacy\provider::get_metadata($collection);

        $items = $result->get_collection();
        $this->assertNotEmpty($items);

        $keys = array_map(fn($item) => $item->get_name(), $items);
        $this->assertContains('pharos_diagnostic_profile', $keys);
    }
}
