<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * PHAROS-AI Onboarding block.
 *
 * Shows new students a 3-step diagnostic wizard (~5 minutes) that:
 *  1. Captures their professional context and digital background.
 *  2. Assesses their prior AI familiarity.
 *  3. Identifies their learning goals.
 *
 * On completion the wizard recommends a starting level (N1/N2/N3),
 * stores the profile in user_preferences, and presents the itinerary
 * entry point.  Returning students see a compact welcome-back summary.
 */
class block_pharos_onboarding extends block_base {

    public function name(): string {
        return 'pharos_onboarding';
    }

    public function init(): void {
        $this->title = get_string('pluginname', 'block_pharos_onboarding');
    }

    public function has_config(): bool {
        return false;
    }

    public function applicable_formats(): array {
        return ['course' => true, 'my' => true, 'site' => false];
    }

    public function get_content(): ?stdClass {
        global $USER, $COURSE, $PAGE, $OUTPUT, $DB;

        if ($this->content !== null) {
            return $this->content;
        }

        $this->content         = new stdClass();
        $this->content->footer = '';

        // Check whether the student has already completed onboarding.
        $profileJson = get_user_preferences('pharos_diagnostic_profile', '', $USER->id);
        $profile     = $profileJson ? json_decode($profileJson, true) : null;
        $completed   = !empty($profile);

        // Determine existing itinerary progress.
        $level    = 1;
        $xp       = 0;
        $itCmid   = 0;
        try {
            if ($DB->get_manager()->table_exists('pharos_itinerary_progress') &&
                    $DB->get_manager()->table_exists('pharos_itinerary')) {
                $itinerary = $DB->get_record_sql(
                    "SELECT pi.id, cm.id AS cmid
                       FROM {pharos_itinerary} pi
                       JOIN {course_modules} cm ON cm.instance = pi.id
                      WHERE pi.course = :course LIMIT 1",
                    ['course' => $COURSE->id]
                );
                if ($itinerary) {
                    $itCmid = (int) $itinerary->cmid;
                    $progress = $DB->get_record('pharos_itinerary_progress', [
                        'itineraryid' => $itinerary->id,
                        'userid'      => $USER->id,
                    ]);
                    if ($progress) {
                        $level = (int) $progress->level;
                        $xp    = (int) $progress->xp;
                    }
                }
            }
        } catch (Exception $e) {
            // Tables not yet installed.
        }

        $hasProgress  = ($xp > 0);
        $itineraryUrl = $itCmid
            ? (new moodle_url('/mod/pharos_itinerary/view.php', ['id' => $itCmid]))->out(false)
            : '';

        $levelLabels = [
            1 => get_string('level_n1', 'block_pharos_onboarding'),
            2 => get_string('level_n2', 'block_pharos_onboarding'),
            3 => get_string('level_n3', 'block_pharos_onboarding'),
        ];

        $thresholds = [1 => 100, 2 => 250, 3 => 250];
        $xpPercent  = (int) min(100, round($xp / ($thresholds[$level] ?? 250) * 100));

        $saveUrl = (new moodle_url(
            '/blocks/pharos_onboarding/ajax-profile.php',
            ['courseid' => $COURSE->id]
        ))->out(false);

        $lang = (substr(current_language(), 0, 2) === 'it') ? 'it' : 'es';

        $data = [
            'completed'      => $completed,
            'has_progress'   => $hasProgress,
            'level'          => $level,
            'level_label'    => $levelLabels[$level] ?? 'N1',
            'xp'             => $xp,
            'xp_percent'     => $xpPercent,
            'itinerary_url'  => $itineraryUrl,
            'save_url'       => $saveUrl,
            'sesskey'        => sesskey(),
            'lang'           => $lang,
            // Stored profile values (for completed state).
            'rec_level'      => $profile['recommended_level'] ?? 1,
            'rec_level_label'=> $levelLabels[$profile['recommended_level'] ?? 1] ?? 'N1',
        ];

        $this->content->text = $OUTPUT->render_from_template(
            'block_pharos_onboarding/onboarding_wizard',
            $data
        );

        $PAGE->requires->js_call_amd('block_pharos_onboarding/onboarding', 'init');

        return $this->content;
    }
}
