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

    // ── Block basics ──────────────────────────────────────────────────────────

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
        $this->assertStringContainsString('pharos-tutor-error', $content->text ?? '');
    }

    // ── Sessions DB table ─────────────────────────────────────────────────────

    public function test_sessions_table_exists(): void {
        global $DB;
        $this->assertTrue($DB->get_manager()->table_exists('block_pharos_tutor_sessions'));
    }

    public function test_sessions_table_has_expected_columns(): void {
        global $DB;
        $columns = array_keys($DB->get_columns('block_pharos_tutor_sessions'));
        foreach (['id', 'userid', 'courseid', 'level', 'message_count', 'duration_seconds', 'timecreated'] as $col) {
            $this->assertContains($col, $columns, "Missing column: $col");
        }
    }

    public function test_memory_table_exists(): void {
        global $DB;
        $this->assertTrue($DB->get_manager()->table_exists('block_pharos_tutor_memory'));
    }

    // ── Privacy: metadata ─────────────────────────────────────────────────────

    public function test_get_metadata_declares_sessions_and_memory_tables(): void {
        $collection = new \core_privacy\local\metadata\collection('block_pharos_tutor');
        $result     = \block_pharos_tutor\privacy\provider::get_metadata($collection);

        $items = $result->get_collection();
        $names = array_map(fn($item) => $item->get_name(), $items);
        $this->assertContains('block_pharos_tutor_sessions', $names);
        $this->assertContains('block_pharos_tutor_memory',   $names);
    }

    // ── Privacy: get_contexts_for_userid ─────────────────────────────────────

    public function test_get_contexts_empty_when_no_sessions(): void {
        $user = $this->getDataGenerator()->create_user();

        $contextlist = \block_pharos_tutor\privacy\provider::get_contexts_for_userid($user->id);
        $this->assertCount(0, $contextlist);
    }

    public function test_get_contexts_returns_course_context_when_session_exists(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $user      = $generator->create_user();
        $course    = $generator->create_course();

        $DB->insert_record('block_pharos_tutor_sessions', (object) [
            'userid'           => $user->id,
            'courseid'         => $course->id,
            'level'            => 1,
            'message_count'    => 5,
            'duration_seconds' => 300,
            'timecreated'      => time(),
        ]);

        $contextlist = \block_pharos_tutor\privacy\provider::get_contexts_for_userid($user->id);
        $this->assertCount(1, $contextlist);

        $contexts = $contextlist->get_contexts();
        $ctx      = reset($contexts);
        $this->assertEquals(CONTEXT_COURSE, $ctx->contextlevel);
        $this->assertEquals($course->id, $ctx->instanceid);
    }

    // ── Privacy: export_user_data ─────────────────────────────────────────────

    public function test_export_user_data_includes_sessions(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $user      = $generator->create_user();
        $course    = $generator->create_course();

        $DB->insert_record('block_pharos_tutor_sessions', (object) [
            'userid'           => $user->id,
            'courseid'         => $course->id,
            'level'            => 2,
            'message_count'    => 8,
            'duration_seconds' => 420,
            'timecreated'      => time(),
        ]);

        $ctx = context_course::instance($course->id);
        $contextlist = new \core_privacy\local\request\approved_contextlist(
            $user, 'block_pharos_tutor', [$ctx->id]
        );

        \block_pharos_tutor\privacy\provider::export_user_data($contextlist);

        $writer = \core_privacy\local\request\writer::with_context($ctx);
        $data   = $writer->get_data([get_string('pluginname', 'block_pharos_tutor')]);

        $this->assertNotNull($data);
        $this->assertNotEmpty($data->sessions);
        $first = reset($data->sessions);
        $this->assertEquals(8, (int) $first->message_count);
    }

    public function test_export_user_data_includes_memory_profile(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $user      = $generator->create_user();
        $course    = $generator->create_course();

        $profile = json_encode(['strengths' => 'Critical thinker', 'concepts_explored' => ['AI bias']]);
        $DB->insert_record('block_pharos_tutor_memory', (object) [
            'userid'       => $user->id,
            'courseid'     => $course->id,
            'profile_json' => $profile,
            'timemodified' => time(),
        ]);

        $DB->insert_record('block_pharos_tutor_sessions', (object) [
            'userid'           => $user->id,
            'courseid'         => $course->id,
            'level'            => 1,
            'message_count'    => 5,
            'duration_seconds' => 200,
            'timecreated'      => time(),
        ]);

        $ctx = context_course::instance($course->id);
        $contextlist = new \core_privacy\local\request\approved_contextlist(
            $user, 'block_pharos_tutor', [$ctx->id]
        );

        \block_pharos_tutor\privacy\provider::export_user_data($contextlist);

        $writer = \core_privacy\local\request\writer::with_context($ctx);
        $data   = $writer->get_data([get_string('pluginname', 'block_pharos_tutor')]);

        $this->assertNotNull($data->learning_profile);
        $this->assertEquals('Critical thinker', $data->learning_profile['strengths']);
    }

    // ── Privacy: delete_data_for_user ────────────────────────────────────────

    public function test_delete_data_for_user_removes_sessions_and_memory(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $user      = $generator->create_user();
        $course    = $generator->create_course();

        $DB->insert_record('block_pharos_tutor_sessions', (object) [
            'userid'           => $user->id,
            'courseid'         => $course->id,
            'level'            => 1,
            'message_count'    => 5,
            'duration_seconds' => 200,
            'timecreated'      => time(),
        ]);
        $DB->insert_record('block_pharos_tutor_memory', (object) [
            'userid'       => $user->id,
            'courseid'     => $course->id,
            'profile_json' => '{"strengths":"test"}',
            'timemodified' => time(),
        ]);

        $this->assertEquals(1, $DB->count_records('block_pharos_tutor_sessions', ['userid' => $user->id]));
        $this->assertEquals(1, $DB->count_records('block_pharos_tutor_memory',   ['userid' => $user->id]));

        $ctx = context_course::instance($course->id);
        $contextlist = new \core_privacy\local\request\approved_contextlist(
            $user, 'block_pharos_tutor', [$ctx->id]
        );
        \block_pharos_tutor\privacy\provider::delete_data_for_user($contextlist);

        $this->assertEquals(0, $DB->count_records('block_pharos_tutor_sessions', ['userid' => $user->id]));
        $this->assertEquals(0, $DB->count_records('block_pharos_tutor_memory',   ['userid' => $user->id]));
    }

    // ── Privacy: delete_data_for_all_users_in_context ────────────────────────

    public function test_delete_all_users_in_context_clears_course_data(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $u1     = $generator->create_user();
        $u2     = $generator->create_user();
        $course = $generator->create_course();

        foreach ([$u1, $u2] as $u) {
            $DB->insert_record('block_pharos_tutor_sessions', (object) [
                'userid'           => $u->id,
                'courseid'         => $course->id,
                'level'            => 1,
                'message_count'    => 5,
                'duration_seconds' => 100,
                'timecreated'      => time(),
            ]);
        }

        \block_pharos_tutor\privacy\provider::delete_data_for_all_users_in_context(
            context_course::instance($course->id)
        );

        $this->assertEquals(0, $DB->count_records('block_pharos_tutor_sessions', ['courseid' => $course->id]));
    }
}
