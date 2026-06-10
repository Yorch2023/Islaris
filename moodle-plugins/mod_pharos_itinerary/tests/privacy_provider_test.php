<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * PHPUnit tests for mod_pharos_itinerary privacy provider.
 *
 * @group mod_pharos_itinerary
 */
class mod_pharos_itinerary_privacy_provider_test extends advanced_testcase {

    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest(true);
    }

    // ── get_metadata ──────────────────────────────────────────────────────

    public function test_metadata_declares_progress_table(): void {
        $collection = new \core_privacy\local\metadata\collection('mod_pharos_itinerary');
        $result     = \mod_pharos_itinerary\privacy\provider::get_metadata($collection);
        $names      = array_map(fn($i) => $i->get_name(), $result->get_collection());
        $this->assertContains('pharos_itinerary_progress', $names);
    }

    // ── get_contexts_for_userid ───────────────────────────────────────────

    public function test_get_contexts_empty_when_no_progress(): void {
        $user = $this->getDataGenerator()->create_user();
        $ctx  = \mod_pharos_itinerary\privacy\provider::get_contexts_for_userid($user->id);
        $this->assertCount(0, $ctx);
    }

    public function test_get_contexts_returns_module_context(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $user      = $generator->create_user();
        $course    = $generator->create_course();
        $cm        = $generator->create_module('pharos_itinerary', ['course' => $course->id]);

        $DB->insert_record('pharos_itinerary_progress', (object) [
            'itineraryid'  => $cm->instance,
            'userid'       => $user->id,
            'level'        => 1,
            'xp'           => 50,
            'timemodified' => time(),
        ]);

        $ctx = \mod_pharos_itinerary\privacy\provider::get_contexts_for_userid($user->id);
        $this->assertGreaterThanOrEqual(1, count($ctx));
    }

    // ── get_users_in_context ──────────────────────────────────────────────

    public function test_get_users_in_context_empty_non_module_context(): void {
        $course  = $this->getDataGenerator()->create_course();
        $context = context_course::instance($course->id);
        $userlist = new \core_privacy\local\request\userlist($context, 'mod_pharos_itinerary');
        \mod_pharos_itinerary\privacy\provider::get_users_in_context($userlist);
        $this->assertCount(0, $userlist);
    }

    // ── delete_data_for_all_users_in_context ──────────────────────────────

    public function test_delete_all_users_noop_on_non_module_context(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $user      = $generator->create_user();
        $course    = $generator->create_course();
        $cm        = $generator->create_module('pharos_itinerary', ['course' => $course->id]);

        $DB->insert_record('pharos_itinerary_progress', (object) [
            'itineraryid'  => $cm->instance,
            'userid'       => $user->id,
            'level'        => 1,
            'xp'           => 10,
            'timemodified' => time(),
        ]);

        // Passing a course context should be a no-op.
        \mod_pharos_itinerary\privacy\provider::delete_data_for_all_users_in_context(
            context_course::instance($course->id)
        );

        $this->assertEquals(1, $DB->count_records('pharos_itinerary_progress', [
            'itineraryid' => $cm->instance,
        ]));
    }

    public function test_delete_all_users_clears_progress_for_module_context(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $u1        = $generator->create_user();
        $u2        = $generator->create_user();
        $course    = $generator->create_course();
        $cm        = $generator->create_module('pharos_itinerary', ['course' => $course->id]);

        foreach ([$u1, $u2] as $u) {
            $DB->insert_record('pharos_itinerary_progress', (object) [
                'itineraryid'  => $cm->instance,
                'userid'       => $u->id,
                'level'        => 1,
                'xp'           => 30,
                'timemodified' => time(),
            ]);
        }

        \mod_pharos_itinerary\privacy\provider::delete_data_for_all_users_in_context(
            context_module::instance($cm->id)
        );

        $this->assertEquals(0, $DB->count_records('pharos_itinerary_progress', [
            'itineraryid' => $cm->instance,
        ]));
    }

    // ── get_users_in_context ──────────────────────────────────────────────

    public function test_get_users_in_context_finds_users_with_progress(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $u1        = $generator->create_user();
        $u2        = $generator->create_user();
        $course    = $generator->create_course();
        $cm        = $generator->create_module('pharos_itinerary', ['course' => $course->id]);

        foreach ([$u1, $u2] as $u) {
            $DB->insert_record('pharos_itinerary_progress', (object) [
                'itineraryid'  => $cm->instance,
                'userid'       => $u->id,
                'level'        => 1,
                'xp'           => 20,
                'timemodified' => time(),
            ]);
        }

        $ctx      = context_module::instance($cm->id);
        $userlist = new \core_privacy\local\request\userlist($ctx, 'mod_pharos_itinerary');
        \mod_pharos_itinerary\privacy\provider::get_users_in_context($userlist);
        $this->assertCount(2, $userlist);
    }

    // ── delete_data_for_user ──────────────────────────────────────────────

    public function test_delete_data_for_user_removes_only_that_user(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $u1        = $generator->create_user();
        $u2        = $generator->create_user();
        $course    = $generator->create_course();
        $cm        = $generator->create_module('pharos_itinerary', ['course' => $course->id]);

        foreach ([$u1, $u2] as $u) {
            $DB->insert_record('pharos_itinerary_progress', (object) [
                'itineraryid'  => $cm->instance,
                'userid'       => $u->id,
                'level'        => 1,
                'xp'           => 25,
                'timemodified' => time(),
            ]);
        }

        $ctx      = context_module::instance($cm->id);
        $ctxlist  = new \core_privacy\local\request\approved_contextlist($u1, 'mod_pharos_itinerary', [$ctx->id]);
        \mod_pharos_itinerary\privacy\provider::delete_data_for_user($ctxlist);

        $this->assertFalse($DB->record_exists('pharos_itinerary_progress', [
            'itineraryid' => $cm->instance, 'userid' => $u1->id,
        ]));
        $this->assertTrue($DB->record_exists('pharos_itinerary_progress', [
            'itineraryid' => $cm->instance, 'userid' => $u2->id,
        ]));
    }

    // ── delete_data_for_users ─────────────────────────────────────────────

    public function test_delete_data_for_users_batch(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $u1        = $generator->create_user();
        $u2        = $generator->create_user();
        $u3        = $generator->create_user();
        $course    = $generator->create_course();
        $cm        = $generator->create_module('pharos_itinerary', ['course' => $course->id]);

        foreach ([$u1, $u2, $u3] as $u) {
            $DB->insert_record('pharos_itinerary_progress', (object) [
                'itineraryid'  => $cm->instance,
                'userid'       => $u->id,
                'level'        => 2,
                'xp'           => 100,
                'timemodified' => time(),
            ]);
        }

        $ctx      = context_module::instance($cm->id);
        $userlist = new \core_privacy\local\request\approved_userlist(
            $ctx, 'mod_pharos_itinerary', [$u1->id, $u2->id]
        );
        \mod_pharos_itinerary\privacy\provider::delete_data_for_users($userlist);

        $this->assertFalse($DB->record_exists('pharos_itinerary_progress',
            ['itineraryid' => $cm->instance, 'userid' => $u1->id]));
        $this->assertFalse($DB->record_exists('pharos_itinerary_progress',
            ['itineraryid' => $cm->instance, 'userid' => $u2->id]));
        $this->assertTrue($DB->record_exists('pharos_itinerary_progress',
            ['itineraryid' => $cm->instance, 'userid' => $u3->id]));
    }

    // ── export_user_data ──────────────────────────────────────────────────

    public function test_export_user_data_noop_on_non_module_context(): void {
        $user    = $this->getDataGenerator()->create_user();
        $course  = $this->getDataGenerator()->create_course();
        $ctx     = context_course::instance($course->id);
        $ctxlist = new \core_privacy\local\request\approved_contextlist($user, 'mod_pharos_itinerary', [$ctx->id]);
        // Should not throw.
        \mod_pharos_itinerary\privacy\provider::export_user_data($ctxlist);
        $this->assertTrue(true);
    }
}
