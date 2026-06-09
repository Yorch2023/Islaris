<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/../classes/risk_scorer.php');

/**
 * PHPUnit tests for block_pharos_teacher\risk_scorer.
 *
 * @group block_pharos_teacher
 */
class risk_scorer_test extends advanced_testcase {

    /** A fixed reference timestamp (Monday 2025-01-06 08:00 UTC). */
    private const NOW = 1736150400;

    // ── Threshold constants ────────────────────────────────────────────────

    public function test_threshold_high_is_65(): void {
        $this->assertSame(65, \block_pharos_teacher\risk_scorer::THRESHOLD_HIGH);
    }

    public function test_threshold_medium_is_35(): void {
        $this->assertSame(35, \block_pharos_teacher\risk_scorer::THRESHOLD_MEDIUM);
    }

    // ── Level label ────────────────────────────────────────────────────────

    public function test_level_high_when_score_ge_65(): void {
        // Worst case: never active, no AI, no XP, no evidence → 35+20+20+10 = 85.
        $result = \block_pharos_teacher\risk_scorer::compute(null, 0, 0, 0, false, self::NOW);
        $this->assertSame('high', $result['level']);
        $this->assertGreaterThanOrEqual(65, $result['score']);
    }

    public function test_level_medium_when_score_35_to_64(): void {
        // Inactive 8 days (+15), no AI (+20), XP present (0), evidence present (0) = 35 → medium.
        $result = \block_pharos_teacher\risk_scorer::compute(8, 0, 10, 50, true, self::NOW);
        $this->assertSame('medium', $result['level']);
        $this->assertSame(35, $result['score']);
    }

    public function test_level_low_when_score_lt_35(): void {
        // Active yesterday, AI session yesterday, good XP, has evidence → 0.
        $yesterday = self::NOW - DAYSECS;
        $result = \block_pharos_teacher\risk_scorer::compute(1, $yesterday, 100, 80, true, self::NOW);
        $this->assertSame('low', $result['level']);
        $this->assertSame(0, $result['score']);
    }

    // ── Factor 1: inactivity ───────────────────────────────────────────────

    public function test_factor1_null_days_adds_35(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(null, self::NOW, 100, 80, true, self::NOW);
        $this->assertSame(35, $result['score']);
    }

    public function test_factor1_over_21_days_adds_40(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(22, self::NOW, 100, 80, true, self::NOW);
        $this->assertSame(40, $result['score']);
    }

    public function test_factor1_over_14_days_adds_28(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(15, self::NOW, 100, 80, true, self::NOW);
        $this->assertSame(28, $result['score']);
    }

    public function test_factor1_over_7_days_adds_15(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(8, self::NOW, 100, 80, true, self::NOW);
        $this->assertSame(15, $result['score']);
    }

    public function test_factor1_over_4_days_adds_5(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(5, self::NOW, 100, 80, true, self::NOW);
        $this->assertSame(5, $result['score']);
    }

    public function test_factor1_4_days_or_less_adds_0(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(4, self::NOW, 100, 80, true, self::NOW);
        $this->assertSame(0, $result['score']);
    }

    // ── Factor 2: AI session recency ──────────────────────────────────────

    public function test_factor2_never_used_ai_adds_20(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(0, 0, 100, 80, true, self::NOW);
        $this->assertSame(20, $result['score']);
    }

    public function test_factor2_older_than_2_weeks_adds_30(): void {
        $threeWeeksAgo = self::NOW - (21 * DAYSECS);
        $result = \block_pharos_teacher\risk_scorer::compute(0, $threeWeeksAgo, 100, 80, true, self::NOW);
        $this->assertSame(30, $result['score']);
    }

    public function test_factor2_between_1_and_2_weeks_adds_14(): void {
        $tenDaysAgo = self::NOW - (10 * DAYSECS);
        $result = \block_pharos_teacher\risk_scorer::compute(0, $tenDaysAgo, 100, 80, true, self::NOW);
        $this->assertSame(14, $result['score']);
    }

    public function test_factor2_within_last_week_adds_0(): void {
        $twoDaysAgo = self::NOW - (2 * DAYSECS);
        $result = \block_pharos_teacher\risk_scorer::compute(0, $twoDaysAgo, 100, 80, true, self::NOW);
        $this->assertSame(0, $result['score']);
    }

    // ── Factor 3: XP ──────────────────────────────────────────────────────

    public function test_factor3_zero_xp_adds_20(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(0, self::NOW, 0, 0, true, self::NOW);
        $this->assertSame(20, $result['score']);
    }

    public function test_factor3_xp_percent_under_15_adds_8(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(0, self::NOW, 5, 10, true, self::NOW);
        $this->assertSame(8, $result['score']);
    }

    public function test_factor3_xp_percent_15_or_above_adds_0(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(0, self::NOW, 50, 20, true, self::NOW);
        $this->assertSame(0, $result['score']);
    }

    // ── Factor 4: evidence ────────────────────────────────────────────────

    public function test_factor4_no_evidence_adds_10(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(0, self::NOW, 100, 80, false, self::NOW);
        $this->assertSame(10, $result['score']);
    }

    public function test_factor4_has_evidence_adds_0(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(0, self::NOW, 100, 80, true, self::NOW);
        $this->assertSame(0, $result['score']);
    }

    // ── Score is capped at 100 ────────────────────────────────────────────

    public function test_score_never_exceeds_100(): void {
        $result = \block_pharos_teacher\risk_scorer::compute(null, 0, 0, 0, false, self::NOW);
        $this->assertLessThanOrEqual(100, $result['score']);
        // Theoretical max without cap: 35+20+20+10 = 85 (well under 100 already).
        $this->assertSame(85, $result['score']);
    }

    // ── $now defaults to time() ────────────────────────────────────────────

    public function test_now_defaults_to_current_time(): void {
        // Just verify no exception and a valid result is returned.
        $result = \block_pharos_teacher\risk_scorer::compute(null, 0, 0, 0, false);
        $this->assertArrayHasKey('score', $result);
        $this->assertArrayHasKey('level', $result);
    }
}
