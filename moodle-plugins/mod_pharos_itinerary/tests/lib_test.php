<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/pharos_itinerary/lib.php');

/**
 * PHPUnit tests for mod_pharos_itinerary lib.php.
 *
 * @group mod_pharos_itinerary
 */
class mod_pharos_itinerary_lib_test extends advanced_testcase {

    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest(true);
    }

    private function createItinerary(): stdClass {
        global $DB;
        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();

        $record = (object) [
            'course'          => $course->id,
            'name'            => 'Test itinerary',
            'startlevel'      => 1,
            'xp_per_evidence' => 10,
            'timecreated'     => time(),
            'timemodified'    => time(),
        ];
        $record->id = $DB->insert_record('pharos_itinerary', $record);
        return $record;
    }

    public function test_get_or_create_progress_creates_record(): void {
        $generator  = $this->getDataGenerator();
        $user       = $generator->create_user();
        $itinerary  = $this->createItinerary();

        $progress = pharos_itinerary_get_or_create_progress($itinerary->id, $user->id);

        $this->assertEquals(1, $progress->level);
        $this->assertEquals(0, $progress->xp);
    }

    public function test_get_or_create_progress_is_idempotent(): void {
        $generator  = $this->getDataGenerator();
        $user       = $generator->create_user();
        $itinerary  = $this->createItinerary();

        $p1 = pharos_itinerary_get_or_create_progress($itinerary->id, $user->id);
        $p2 = pharos_itinerary_get_or_create_progress($itinerary->id, $user->id);

        $this->assertEquals($p1->id, $p2->id);
    }

    public function test_award_xp_accumulates(): void {
        $generator  = $this->getDataGenerator();
        $user       = $generator->create_user();
        $itinerary  = $this->createItinerary();

        pharos_itinerary_award_xp($itinerary->id, $user->id, 30);
        $progress = pharos_itinerary_award_xp($itinerary->id, $user->id, 25);

        $this->assertEquals(55, $progress->xp);
        $this->assertEquals(1, $progress->level);
    }

    public function test_award_xp_triggers_level_up_at_n1_threshold(): void {
        $generator  = $this->getDataGenerator();
        $user       = $generator->create_user();
        $itinerary  = $this->createItinerary();

        // N1 threshold is 100 XP.
        $progress = pharos_itinerary_award_xp($itinerary->id, $user->id, 100);

        $this->assertEquals(2, $progress->level);
    }

    public function test_award_xp_does_not_exceed_level_3(): void {
        $generator  = $this->getDataGenerator();
        $user       = $generator->create_user();
        $itinerary  = $this->createItinerary();

        pharos_itinerary_award_xp($itinerary->id, $user->id, 100); // N1→N2
        pharos_itinerary_award_xp($itinerary->id, $user->id, 250); // N2→N3
        $progress = pharos_itinerary_award_xp($itinerary->id, $user->id, 500); // stays N3

        $this->assertEquals(3, $progress->level);
    }
}
