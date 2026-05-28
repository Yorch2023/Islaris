<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace block_pharos_tutor\privacy;

use core_privacy\local\metadata\null_provider;

/**
 * Privacy provider.
 *
 * The tutor chat is stateless: no conversation data is stored in Moodle's
 * database (conversations are not persisted between page loads by design).
 */
class provider implements null_provider {

    public static function get_reason(): string {
        return 'privacy:metadata';
    }
}
