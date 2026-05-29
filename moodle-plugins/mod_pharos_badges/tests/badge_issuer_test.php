<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace mod_pharos_badges;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/pharos_badges/classes/badge_issuer.php');

/**
 * PHPUnit tests for badge_issuer.
 *
 * @group mod_pharos_badges
 */
class badge_issuer_test extends \advanced_testcase {

    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest(true);
    }

    public function test_record_evidence_below_threshold_returns_false(): void {
        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $user      = $generator->create_user();

        // N1 threshold is 3; record only 2.
        badge_issuer::record_evidence($course->id, $user->id, 1, 'product', 'Evidencia 1');
        $result = badge_issuer::record_evidence($course->id, $user->id, 1, 'process', 'Evidencia 2');

        $this->assertFalse($result);
    }

    public function test_get_user_evidence_returns_correct_structure(): void {
        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $user      = $generator->create_user();

        badge_issuer::record_evidence($course->id, $user->id, 1, 'product', 'Evidencia A');
        badge_issuer::record_evidence($course->id, $user->id, 2, 'impact',  'Evidencia B');

        $evidence = badge_issuer::get_user_evidence($course->id, $user->id);

        $this->assertCount(1, $evidence[1]);
        $this->assertCount(1, $evidence[2]);
        $this->assertCount(0, $evidence[3]);
        $this->assertEquals('product', $evidence[1][0]->type);
    }

    public function test_record_evidence_throws_on_invalid_type(): void {
        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $user      = $generator->create_user();

        $this->expectException(\coding_exception::class);
        badge_issuer::record_evidence($course->id, $user->id, 1, 'invalid_type', 'Desc');
    }

    public function test_record_evidence_throws_on_invalid_level(): void {
        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $user      = $generator->create_user();

        $this->expectException(\coding_exception::class);
        badge_issuer::record_evidence($course->id, $user->id, 5, 'product', 'Desc');
    }

    public function test_evidence_is_scoped_per_course(): void {
        $generator = $this->getDataGenerator();
        $course1   = $generator->create_course();
        $course2   = $generator->create_course();
        $user      = $generator->create_user();

        badge_issuer::record_evidence($course1->id, $user->id, 1, 'product', 'Evidencia curso 1');

        $evidenceCourse1 = badge_issuer::get_user_evidence($course1->id, $user->id);
        $evidenceCourse2 = badge_issuer::get_user_evidence($course2->id, $user->id);

        $this->assertCount(1, $evidenceCourse1[1]);
        $this->assertCount(0, $evidenceCourse2[1]);
    }
}
