<?php
namespace block_pharos_teacher\privacy;

use core_privacy\local\metadata\null_provider;

defined('MOODLE_INTERNAL') || die();

// This block only reads data — it does not store personal data itself.
class provider implements null_provider {
    public static function get_reason(): string {
        return 'privacy:metadata';
    }
}
