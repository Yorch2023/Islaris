<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

// ---- Moodle module API (required functions) --------------------------------

function pharos_itinerary_add_instance(stdClass $data, ?mod_pharos_itinerary_mod_form $form = null): int {
    global $DB;
    $data->timecreated  = time();
    $data->timemodified = $data->timecreated;
    return $DB->insert_record('pharos_itinerary', $data);
}

function pharos_itinerary_update_instance(stdClass $data, ?mod_pharos_itinerary_mod_form $form = null): bool {
    global $DB;
    $data->timemodified = time();
    $data->id = $data->instance;
    return $DB->update_record('pharos_itinerary', $data);
}

function pharos_itinerary_delete_instance(int $id): bool {
    global $DB;
    $DB->delete_records('pharos_itinerary_progress', ['itineraryid' => $id]);
    return $DB->delete_records('pharos_itinerary', ['id' => $id]);
}

function pharos_itinerary_supports(int $feature): ?bool {
    return match ($feature) {
        FEATURE_MOD_INTRO            => true,
        FEATURE_SHOW_DESCRIPTION     => true,
        FEATURE_COMPLETION_TRACKS_VIEWS => true,
        FEATURE_GRADE_HAS_GRADE      => false,
        FEATURE_BACKUP_MOODLE2       => true,
        default                      => null,
    };
}

// ---- XP helpers ------------------------------------------------------------

/**
 * Returns the XP record for a user in a given itinerary, creating it if needed.
 */
function pharos_itinerary_get_or_create_progress(int $itineraryId, int $userId): stdClass {
    global $DB;

    $record = $DB->get_record('pharos_itinerary_progress', [
        'itineraryid' => $itineraryId,
        'userid'      => $userId,
    ]);

    if ($record) {
        return $record;
    }

    $record = (object) [
        'itineraryid' => $itineraryId,
        'userid'      => $userId,
        'level'       => 1,
        'xp'          => 0,
        'timecreated' => time(),
        'timemodified'=> time(),
    ];
    $record->id = $DB->insert_record('pharos_itinerary_progress', $record);
    return $record;
}

/**
 * Awards XP to a user and handles level-up logic.
 * Fires xp_awarded event and, when the threshold is crossed, level_up event.
 */
function pharos_itinerary_award_xp(int $itineraryId, int $userId, int $amount): stdClass {
    global $DB;

    $progress   = pharos_itinerary_get_or_create_progress($itineraryId, $userId);
    $prevLevel  = $progress->level;

    $progress->xp           += $amount;
    $progress->timemodified  = time();

    // XP thresholds per level.
    $thresholds = [1 => 100, 2 => 250, 3 => PHP_INT_MAX];

    if ($progress->level < 3 && $progress->xp >= $thresholds[$progress->level]) {
        $progress->level++;
    }

    $DB->update_record('pharos_itinerary_progress', $progress);

    // Dispatch events (only when Moodle context is available).
    if (defined('MOODLE_INTERNAL')) {
        $cm = get_coursemodule_from_instance('pharos_itinerary', $itineraryId);
        if ($cm) {
            $context = \context_module::instance($cm->id);

            \mod_pharos_itinerary\event\xp_awarded::create([
                'context'    => $context,
                'objectid'   => $progress->id,
                'userid'     => $userId,
                'other'      => ['xp_amount' => $amount],
            ])->trigger();

            if ($progress->level > $prevLevel) {
                \mod_pharos_itinerary\event\level_up::create([
                    'context'  => $context,
                    'objectid' => $progress->id,
                    'userid'   => $userId,
                    'other'    => ['new_level' => $progress->level],
                ])->trigger();
            }
        }
    }

    return $progress;
}
