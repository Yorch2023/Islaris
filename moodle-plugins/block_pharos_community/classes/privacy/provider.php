<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace block_pharos_community\privacy;

use core_privacy\local\metadata\null_provider;

/**
 * Privacy provider.
 *
 * The Community block is read-only: it surfaces existing Moodle forum
 * data and externally configured webinar/resource links. No personal data
 * is stored by this block itself.
 */
class provider implements null_provider {

    public static function get_reason(): string {
        return 'privacy:metadata';
    }
}
