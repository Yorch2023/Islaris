<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

namespace block_pharos_teacher;

defined('MOODLE_INTERNAL') || die();

/**
 * Centralised dropout-risk scoring formula for the PHAROS teacher block.
 *
 * Four weighted factors (max 100):
 *   - Factor 1: days since last itinerary activity  (0-40 pts)
 *   - Factor 2: AI tutor session recency            (0-30 pts)
 *   - Factor 3: XP progress                        (0-20 pts)
 *   - Factor 4: evidence submitted                  (0-10 pts)
 *
 * Thresholds: HIGH >= 65, MEDIUM >= 35, LOW < 35.
 */
class risk_scorer {

    public const THRESHOLD_HIGH   = 65;
    public const THRESHOLD_MEDIUM = 35;

    /**
     * Compute the dropout risk score and level for one student.
     *
     * @param int|null $dayssince  Days since last itinerary activity; null = never active.
     * @param int      $lastaitutor  Unix timestamp of last AI session (0 = never).
     * @param int      $xp           Raw XP value.
     * @param int      $xppercent    XP as percentage of the current-level threshold (0-100).
     * @param bool     $hasevidence  Whether the student has submitted any evidence.
     * @param int      $now          Current Unix timestamp (injectable for testing).
     * @return array{score: int, level: string}  level is 'high', 'medium', or 'low'.
     */
    public static function compute(
        ?int $dayssince,
        int  $lastaitutor,
        int  $xp,
        int  $xppercent,
        bool $hasevidence,
        int  $now = 0
    ): array {
        if ($now === 0) {
            $now = time();
        }

        $weekago      = $now - 7  * DAYSECS;
        $twoweeksago  = $now - 14 * DAYSECS;

        $score = 0;

        // Factor 1: inactivity (0-40 pts).
        if ($dayssince === null)    { $score += 35; }
        elseif ($dayssince > 21)   { $score += 40; }
        elseif ($dayssince > 14)   { $score += 28; }
        elseif ($dayssince > 7)    { $score += 15; }
        elseif ($dayssince > 4)    { $score += 5;  }

        // Factor 2: AI session recency (0-30 pts).
        if ($lastaitutor === 0)              { $score += 20; }
        elseif ($lastaitutor < $twoweeksago) { $score += 30; }
        elseif ($lastaitutor < $weekago)     { $score += 14; }

        // Factor 3: XP progress (0-20 pts).
        if ($xp === 0)            { $score += 20; }
        elseif ($xppercent < 15)  { $score += 8;  }

        // Factor 4: no evidence (0-10 pts).
        if (!$hasevidence) { $score += 10; }

        $score = min(100, $score);
        $level = $score >= self::THRESHOLD_HIGH   ? 'high'
               : ($score >= self::THRESHOLD_MEDIUM ? 'medium' : 'low');

        return ['score' => $score, 'level' => $level];
    }
}
