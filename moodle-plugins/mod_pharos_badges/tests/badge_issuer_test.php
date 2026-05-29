<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace mod_pharos_badges;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/pharos_badges/classes/badge_issuer.php');
require_once($CFG->dirroot . '/mod/pharos_badges/lib.php');

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

    public function test_record_evidence_at_n1_threshold_returns_false_when_badge_not_configured(): void {
        // N1 threshold = 3. When reached with no badge in the course, issue_badge returns false.
        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $user      = $generator->create_user();

        badge_issuer::record_evidence($course->id, $user->id, 1, 'product', 'Ev 1');
        badge_issuer::record_evidence($course->id, $user->id, 1, 'process', 'Ev 2');
        $result = badge_issuer::record_evidence($course->id, $user->id, 1, 'impact', 'Ev 3');

        $this->assertFalse($result);
    }

    public function test_n2_requires_4_evidence_to_reach_threshold(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $user      = $generator->create_user();

        // First 3 are below the N2 threshold of 4.
        badge_issuer::record_evidence($course->id, $user->id, 2, 'product', 'Ev 1');
        badge_issuer::record_evidence($course->id, $user->id, 2, 'process', 'Ev 2');
        $belowThreshold = badge_issuer::record_evidence($course->id, $user->id, 2, 'impact', 'Ev 3');
        $this->assertFalse($belowThreshold);

        // 4th evidence is the threshold; no badge configured so still false, but count == 4.
        badge_issuer::record_evidence($course->id, $user->id, 2, 'product', 'Ev 4');
        $count = $DB->count_records('pharos_badges_evidence', [
            'userid'   => $user->id,
            'courseid' => $course->id,
            'level'    => 2,
        ]);
        $this->assertEquals(4, $count);
    }

    public function test_n3_requires_5_evidence_to_reach_threshold(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $user      = $generator->create_user();

        // First 4 are below the N3 threshold of 5.
        for ($i = 1; $i <= 4; $i++) {
            $result = badge_issuer::record_evidence($course->id, $user->id, 3, 'product', "Ev {$i}");
            $this->assertFalse($result, "Expected false for evidence #{$i} (N3 threshold not reached)");
        }

        // 5th evidence is the threshold.
        badge_issuer::record_evidence($course->id, $user->id, 3, 'impact', 'Ev 5');
        $count = $DB->count_records('pharos_badges_evidence', [
            'userid'   => $user->id,
            'courseid' => $course->id,
            'level'    => 3,
        ]);
        $this->assertEquals(5, $count);
    }

    public function test_evidence_counts_are_isolated_per_level(): void {
        // Evidences for N1 must not count towards the N2 threshold and vice-versa.
        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $user      = $generator->create_user();

        // N1: 2 evidences (below threshold of 3).
        badge_issuer::record_evidence($course->id, $user->id, 1, 'product', 'N1 Ev 1');
        badge_issuer::record_evidence($course->id, $user->id, 1, 'process', 'N1 Ev 2');

        // N2: 3 evidences (below N2 threshold of 4).
        badge_issuer::record_evidence($course->id, $user->id, 2, 'product', 'N2 Ev 1');
        badge_issuer::record_evidence($course->id, $user->id, 2, 'process', 'N2 Ev 2');
        $result = badge_issuer::record_evidence($course->id, $user->id, 2, 'impact', 'N2 Ev 3');

        // N2 still below threshold; N1 count must not have inflated N2 count.
        $this->assertFalse($result);
    }

    public function test_delete_instance_removes_evidence(): void {
        global $DB;

        $generator = $this->getDataGenerator();
        $course    = $generator->create_course();
        $user      = $generator->create_user();

        $instanceId = $DB->insert_record('pharos_badges_instance', (object) [
            'course'       => $course->id,
            'name'         => 'Test badges instance',
            'intro'        => '',
            'introformat'  => FORMAT_HTML,
            'timecreated'  => time(),
            'timemodified' => time(),
        ]);

        badge_issuer::record_evidence($course->id, $user->id, 1, 'product', 'Ev 1');
        badge_issuer::record_evidence($course->id, $user->id, 2, 'process', 'Ev 2');

        $this->assertEquals(2, $DB->count_records('pharos_badges_evidence', ['courseid' => $course->id]));

        pharos_badges_delete_instance($instanceId);

        $this->assertEquals(0, $DB->count_records('pharos_badges_evidence', ['courseid' => $course->id]));
        $this->assertFalse($DB->record_exists('pharos_badges_instance', ['id' => $instanceId]));
    }
}
