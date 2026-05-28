<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace mod_pharos_badges;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/badgeslib.php');

/**
 * Handles automatic Open Badges 3.0 issuance for PHAROS-AI microcredentials.
 *
 * Three badges correspond to the three itinerary levels:
 *   - Badge 1: N1 Fundamentos         (EQF 2 / DigComp Area 1-2)
 *   - Badge 2: N2 IA en la práctica   (EQF 3 / DigComp Area 1-5)
 *   - Badge 3: N3 Facilitación crítica (EQF 4 / DigCompEdu)
 */
class badge_issuer {

    // Evidence type constants.
    const EVIDENCE_PRODUCT  = 'product';
    const EVIDENCE_PROCESS  = 'process';
    const EVIDENCE_IMPACT   = 'impact';

    // Minimum evidence items required per level to trigger badge issuance.
    private const EVIDENCE_THRESHOLD = [1 => 3, 2 => 4, 3 => 5];

    /**
     * Records a piece of evidence for a user and triggers badge issuance if
     * the threshold is met.
     *
     * @param int    $courseId   Moodle course ID.
     * @param int    $userId     Moodle user ID.
     * @param int    $level      Itinerary level (1, 2 or 3).
     * @param string $type       Evidence type (product/process/impact).
     * @param string $description Short description of the evidence.
     * @return bool  True if a badge was issued as a result of this evidence.
     */
    public static function record_evidence(
        int    $courseId,
        int    $userId,
        int    $level,
        string $type,
        string $description
    ): bool {
        global $DB;

        $allowedTypes = [self::EVIDENCE_PRODUCT, self::EVIDENCE_PROCESS, self::EVIDENCE_IMPACT];
        if (!in_array($type, $allowedTypes, true)) {
            throw new \coding_exception('Invalid evidence type: ' . $type);
        }

        if (!array_key_exists($level, self::EVIDENCE_THRESHOLD)) {
            throw new \coding_exception('Invalid level: ' . $level);
        }

        // Store the evidence record.
        $DB->insert_record('pharos_badges_evidence', (object) [
            'userid'       => $userId,
            'courseid'     => $courseId,
            'level'        => $level,
            'type'         => $type,
            'description'  => $description,
            'timecreated'  => time(),
        ]);

        // Check if the threshold has been reached.
        $count = $DB->count_records('pharos_badges_evidence', [
            'userid'   => $userId,
            'courseid' => $courseId,
            'level'    => $level,
        ]);

        if ($count >= self::EVIDENCE_THRESHOLD[$level]) {
            return self::issue_badge($courseId, $userId, $level);
        }

        return false;
    }

    /**
     * Issues the Moodle badge corresponding to the given level, if the user
     * does not already hold it and a matching badge exists in the course.
     */
    private static function issue_badge(int $courseId, int $userId, int $level): bool {
        global $DB;

        $badgeName = self::badge_name_for_level($level);

        $badge = $DB->get_record('badge', [
            'courseid' => $courseId,
            'name'     => $badgeName,
            'status'   => BADGE_STATUS_ACTIVE,
        ]);

        if (!$badge) {
            // Badge not configured in this course yet — nothing to issue.
            return false;
        }

        $badgeObj = new \badge($badge->id);

        if ($badgeObj->is_issued($userId)) {
            return false;
        }

        $badgeObj->issue($userId, true);
        return true;
    }

    private static function badge_name_for_level(int $level): string {
        return match ($level) {
            1 => 'PHAROS N1 — Fundamentos de IA',
            2 => 'PHAROS N2 — IA en la práctica',
            3 => 'PHAROS N3 — Facilitación crítica',
            default => throw new \coding_exception('Invalid level'),
        };
    }

    /**
     * Returns all evidence records for a user in a course, grouped by level.
     */
    public static function get_user_evidence(int $courseId, int $userId): array {
        global $DB;

        $records = $DB->get_records('pharos_badges_evidence', [
            'userid'   => $userId,
            'courseid' => $courseId,
        ], 'timecreated ASC');

        $grouped = [1 => [], 2 => [], 3 => []];
        foreach ($records as $r) {
            $grouped[$r->level][] = $r;
        }
        return $grouped;
    }
}
