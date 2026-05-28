<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/moodleform_mod.php');

class mod_pharos_itinerary_mod_form extends moodleform_mod {

    public function definition(): void {
        $mform = $this->_form;

        // General section.
        $mform->addElement('header', 'general', get_string('general', 'form'));

        $mform->addElement('text', 'name', get_string('name'), ['size' => '64']);
        $mform->setType('name', PARAM_TEXT);
        $mform->addRule('name', null, 'required', null, 'client');
        $mform->addRule('name', get_string('maximumchars', '', 255), 'maxlength', 255, 'client');

        $this->standard_intro_elements();

        // Starting level.
        $mform->addElement(
            'select',
            'startlevel',
            get_string('startlevel', 'mod_pharos_itinerary'),
            [1 => 'N1 — Fundamentos', 2 => 'N2 — IA en la práctica', 3 => 'N3 — Facilitación crítica']
        );
        $mform->setDefault('startlevel', 1);

        // XP per evidence.
        $mform->addElement('text', 'xp_per_evidence', get_string('xp_per_evidence', 'mod_pharos_itinerary'), ['size' => '4']);
        $mform->setType('xp_per_evidence', PARAM_INT);
        $mform->setDefault('xp_per_evidence', 10);

        $this->standard_coursemodule_elements();
        $this->add_action_buttons();
    }
}
