<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace mod_pharos_itinerary;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/pharos_itinerary/lib.php');
require_once($CFG->libdir . '/externallib.php');

/**
 * PHPUnit tests for mod_pharos_itinerary external API.
 *
 * @group mod_pharos_itinerary
 */
class external_test extends \advanced_testcase {

    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest(true);
    }

    private function setup_course_with_itinerary(): array {
        global $DB;

        $generator = $this->getDataGenerator();
        $course    = $generator->create_course(['enablecompletion' => 1]);
        $teacher   = $generator->create_user();
        $student   = $generator->create_user();

        $generator->enrol_user($teacher->id, $course->id, 'editingteacher');
        $generator->enrol_user($student->id, $course->id, 'student');

        $module = $DB->get_record('modules', ['name' => 'pharos_itinerary']);
        if (!$module) {
            // Register a fake module entry so the CM can be created.
            $module = new \stdClass();
            $module->name = 'pharos_itinerary';
            $module->id   = $DB->insert_record('modules', $module);
        }

        $instance = (object) [
            'course'          => $course->id,
            'name'            => 'Test itinerary',
            'startlevel'      => 1,
            'xp_per_evidence' => 10,
            'timecreated'     => time(),
            'timemodified'    => time(),
        ];
        $instance->id = $DB->insert_record('pharos_itinerary', $instance);

        $cm = (object) [
            'course'   => $course->id,
            'module'   => $module->id,
            'instance' => $instance->id,
            'section'  => 0,
            'visible'  => 1,
            'groupmode'=> 0,
            'added'    => time(),
        ];
        $cm->id = $DB->insert_record('course_modules', $cm);

        return [$course, $cm, $instance, $teacher, $student];
    }

    public function test_get_user_progress_own_data(): void {
        [$course, $cm, $itinerary, $teacher, $student] = $this->setup_course_with_itinerary();

        $this->setUser($student);

        // Award some XP first.
        pharos_itinerary_award_xp($itinerary->id, $student->id, 40);

        $result = external::get_user_progress($cm->id, 0);

        $this->assertEquals($student->id, $result['userid']);
        $this->assertEquals(1, $result['level']);
        $this->assertEquals(40, $result['xp']);
        $this->assertEquals(100, $result['xp_next']);
        $this->assertEquals(40, $result['xp_percent']);
    }

    public function test_get_user_progress_teacher_can_query_other_user(): void {
        [$course, $cm, $itinerary, $teacher, $student] = $this->setup_course_with_itinerary();

        pharos_itinerary_award_xp($itinerary->id, $student->id, 50);

        $this->setUser($teacher);

        $result = external::get_user_progress($cm->id, $student->id);

        $this->assertEquals($student->id, $result['userid']);
        $this->assertEquals(50, $result['xp']);
    }

    public function test_get_user_progress_student_cannot_query_other_user(): void {
        [$course, $cm, $itinerary, $teacher, $student] = $this->setup_course_with_itinerary();
        $other = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($other->id, $course->id, 'student');

        $this->setUser($student);

        $this->expectException(\required_capability_exception::class);
        external::get_user_progress($cm->id, $other->id);
    }

    public function test_award_xp_requires_teacher_capability(): void {
        [$course, $cm, $itinerary, $teacher, $student] = $this->setup_course_with_itinerary();

        $this->setUser($student);

        $this->expectException(\required_capability_exception::class);
        external::award_xp($cm->id, $student->id, 10);
    }

    public function test_award_xp_invalid_amount_throws(): void {
        [$course, $cm, $itinerary, $teacher, $student] = $this->setup_course_with_itinerary();

        $this->setUser($teacher);

        $this->expectException(\invalid_parameter_exception::class);
        external::award_xp($cm->id, $student->id, 0);
    }

    public function test_award_xp_returns_updated_progress(): void {
        [$course, $cm, $itinerary, $teacher, $student] = $this->setup_course_with_itinerary();

        $this->setUser($teacher);

        $result = external::award_xp($cm->id, $student->id, 50);

        $this->assertEquals($student->id, $result['userid']);
        $this->assertEquals(50, $result['xp']);
        $this->assertEquals(1, $result['level']);
        $this->assertFalse($result['levelled_up']);
    }

    public function test_award_xp_detects_level_up(): void {
        [$course, $cm, $itinerary, $teacher, $student] = $this->setup_course_with_itinerary();

        $this->setUser($teacher);

        $result = external::award_xp($cm->id, $student->id, 100);

        $this->assertEquals(2, $result['level']);
        $this->assertTrue($result['levelled_up']);
    }
}
