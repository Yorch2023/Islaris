<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html
//
// Saves the student's diagnostic profile to user_preferences and
// returns a recommended starting level.

define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');

require_login();

header('Content-Type: application/json');

$rawBody = file_get_contents('php://input');
$data    = json_decode($rawBody, true);

if (!$data || !confirm_sesskey($data['sesskey'] ?? '')) {
    echo json_encode(['error' => 'Invalid session key']);
    exit;
}

// Validate and sanitise incoming diagnostic answers.
$allowed = [
    'employment'   => ['education', 'professional', 'job_seeker', 'retired'],
    'digital_exp'  => ['basic', 'intermediate', 'advanced'],
    'ai_use'       => ['never', 'occasional', 'regular', 'teaches'],
    'goals'        => null,  // array of strings — validated below
    'time_weekly'  => ['lt1', '1to2', 'gt2'],
];

$employment  = in_array($data['employment']  ?? '', $allowed['employment'],  true) ? $data['employment']  : 'professional';
$digitalExp  = in_array($data['digital_exp'] ?? '', $allowed['digital_exp'], true) ? $data['digital_exp'] : 'basic';
$aiUse       = in_array($data['ai_use']      ?? '', $allowed['ai_use'],      true) ? $data['ai_use']      : 'never';
$timeWeekly  = in_array($data['time_weekly'] ?? '', $allowed['time_weekly'], true) ? $data['time_weekly'] : 'lt1';

$rawGoals = is_array($data['goals'] ?? null) ? $data['goals'] : [];
$validGoals = ['understand', 'protect', 'work_tools', 'teach_others'];
$goals = array_values(array_filter($rawGoals, fn($g) => in_array($g, $validGoals, true)));

// ── Level recommendation logic ────────────────────────────────────────────────

// AI familiarity is the primary signal; digital experience modulates it.
$recommendedLevel = 1;

if ($aiUse === 'teaches') {
    $recommendedLevel = 3;
} elseif ($aiUse === 'regular') {
    $recommendedLevel = ($digitalExp === 'advanced') ? 2 : 2;
} elseif ($aiUse === 'occasional') {
    // Light AI use: stay at N1 unless advanced digital background.
    $recommendedLevel = ($digitalExp === 'advanced' && $employment === 'education') ? 2 : 1;
} else {
    // Never used AI.
    $recommendedLevel = 1;
}

// Teaching-oriented goals can boost a level for experienced users.
if (in_array('teach_others', $goals, true) && $recommendedLevel === 2 && $digitalExp === 'advanced') {
    $recommendedLevel = 3;
}

// ── Save profile to user_preferences ─────────────────────────────────────────

$profile = [
    'employment'         => $employment,
    'digital_exp'        => $digitalExp,
    'ai_use'             => $aiUse,
    'goals'              => $goals,
    'time_weekly'        => $timeWeekly,
    'recommended_level'  => $recommendedLevel,
    'completed_at'       => time(),
];

set_user_preference('pharos_diagnostic_profile', json_encode($profile), $USER->id);

// ── Build a personalised explanation text ────────────────────────────────────

$lang = (substr(current_language(), 0, 2) === 'it') ? 'it' : 'es';

$levelLabels = [
    1 => ($lang === 'it') ? 'N1 — Fondamenti'        : 'N1 — Fundamentos',
    2 => ($lang === 'it') ? 'N2 — IA nella pratica'  : 'N2 — IA en la práctica',
    3 => ($lang === 'it') ? 'N3 — Facilitazione critica' : 'N3 — Facilitación crítica',
];

$explanations = [
    'es' => [
        1 => 'Empezarás con los fundamentos: qué es la IA, cómo funciona y cómo protegerte. Es el mejor punto de partida para construir una base sólida.',
        2 => 'Tu experiencia digital te permite saltarte los conceptos básicos y comenzar a explorar cómo la IA cambia tu sector y tu vida laboral.',
        3 => 'Tu dominio de la IA te posiciona para profundizar en la facilitación crítica: podrás guiar a otros y contribuir al debate sobre IA ética.',
    ],
    'it' => [
        1 => 'Inizierai dalle basi: cos\'è l\'IA, come funziona e come proteggersi. È il punto di partenza ideale per costruire fondamenta solide.',
        2 => 'La tua esperienza digitale ti permette di saltare i concetti di base e iniziare a esplorare come l\'IA trasforma il tuo settore e la tua vita lavorativa.',
        3 => 'La tua padronanza dell\'IA ti posiziona per approfondire la facilitazione critica: potrai guidare altri e contribuire al dibattito sull\'IA etica.',
    ],
];

echo json_encode([
    'ok'                => true,
    'recommended_level' => $recommendedLevel,
    'level_label'       => $levelLabels[$recommendedLevel],
    'explanation'       => $explanations[$lang][$recommendedLevel] ?? '',
]);
exit;
