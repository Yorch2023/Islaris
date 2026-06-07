<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html
//
// Generates a personalised motivational message for a specific student,
// addressed TO the student so the teacher can copy and send it.

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

$courseId  = (int) ($data['courseid']  ?? 0);
$studentId = (int) ($data['student_id'] ?? 0);
$lang      = in_array($data['lang'] ?? '', ['es', 'it'], true) ? $data['lang'] : 'es';

if (!$courseId || !$studentId) {
    echo json_encode(['error' => 'Missing parameters']);
    exit;
}

$context = context_course::instance($courseId);
require_capability('block/pharos_teacher:view', $context);

if (!is_enrolled($context, $studentId)) {
    echo json_encode(['error' => 'User not enrolled']);
    exit;
}

// ── Build student profile (identical logic to ajax-advisor.php) ─────────────

$student    = $DB->get_record('user', ['id' => $studentId], 'id, firstname, lastname', MUST_EXIST);
$name       = fullname($student);
$level      = 1;
$xp         = 0;
$thresholds = [1 => 100, 2 => 250, 3 => 250];
$levelNames = [1 => 'N1', 2 => 'N2', 3 => 'N3'];
$lastSeen   = null;

try {
    if ($DB->get_manager()->table_exists('pharos_itinerary_progress') &&
            $DB->get_manager()->table_exists('pharos_itinerary')) {
        $itinerary = $DB->get_record_sql(
            "SELECT pi.id FROM {pharos_itinerary} pi
               JOIN {course_modules} cm ON cm.instance = pi.id
              WHERE pi.course = :course LIMIT 1",
            ['course' => $courseId]
        );
        if ($itinerary) {
            $progress = $DB->get_record('pharos_itinerary_progress', [
                'itineraryid' => $itinerary->id,
                'userid'      => $studentId,
            ]);
            if ($progress) {
                $level    = (int) $progress->level;
                $xp       = (int) $progress->xp;
                $lastSeen = (int) $progress->timemodified;
            }
        }
    }
} catch (Exception $e) {
    // No progress data.
}

$now          = time();
$daysSince    = $lastSeen ? (int) floor(($now - $lastSeen) / DAYSECS) : null;
$xpNext       = $thresholds[$level] ?? 250;
$xpPercent    = (int) min(100, round($xp / $xpNext * 100));
$daysInactive = $daysSince !== null ? "{$daysSince} días" : 'desconocido';

$aiSessionsTotal = 0;
$aiSessionsWeek  = 0;
try {
    if ($DB->get_manager()->table_exists('block_pharos_tutor_sessions')) {
        $weekAgo = $now - 7 * DAYSECS;
        $totals  = $DB->get_record_sql(
            "SELECT COUNT(*) AS total_sessions,
                    COALESCE(SUM(message_count), 0) AS total_messages,
                    MAX(timecreated) AS last_session
               FROM {block_pharos_tutor_sessions}
              WHERE userid = :uid AND courseid = :cid",
            ['uid' => $studentId, 'cid' => $courseId]
        );
        if ($totals) {
            $aiSessionsTotal = (int) $totals->total_sessions;
        }
        $aiSessionsWeek = (int) $DB->count_records_select(
            'block_pharos_tutor_sessions',
            'userid = :uid AND courseid = :cid AND timecreated >= :week',
            ['uid' => $studentId, 'cid' => $courseId, 'week' => $weekAgo]
        );
    }
} catch (Exception $e) {
    // No session data.
}

$studentProfile = <<<PROFILE
Nombre: {$name}
Nivel actual: {$levelNames[$level]}
XP: {$xp} / {$xpNext} ({$xpPercent}%)
Días de inactividad: {$daysInactive}
Sesiones totales con el tutor IA: {$aiSessionsTotal}
Sesiones esta semana: {$aiSessionsWeek}
PROFILE;

// ── Build the motivation prompt ───────────────────────────────────────────────

$promptEs = "Escribe un mensaje motivacional personalizado para enviarle directamente a este alumno/a. "
    . "Debe ser de 3 a 5 frases. Escríbelo como si fuera el docente hablando directamente al alumno (usa 'tú'). "
    . "Debe ser cálido, específico a su situación (nivel {$levelNames[$level]}, {$daysInactive} sin actividad), "
    . "y alentador sin ser condescendiente. No uses fórmulas genéricas. No menciones que eres una IA.";

$promptIt = "Scrivi un messaggio motivazionale personalizzato da inviare direttamente a questo studente. "
    . "Deve essere di 3-5 frasi. Scrivilo come se fosse il docente che parla direttamente allo studente (usa 'tu'). "
    . "Deve essere caloroso, specifico alla situazione dello studente (livello {$levelNames[$level]}, {$daysInactive} senza attività), "
    . "e incoraggiante senza essere condiscendente. Non usare formule generiche. Non dire di essere un'IA.";

$motivationPrompt = ($lang === 'it') ? $promptIt : $promptEs;

// ── Call advisor middleware with the motivation prompt ────────────────────────

$middlewareUrl = rtrim(
    get_config('block_pharos_tutor', 'middleware_url') ?: getenv('PHAROS_MIDDLEWARE_URL') ?: 'http://ai-layer:3001',
    '/'
);
$secret = getenv('MOODLE_SECRET') ?: get_config('block_pharos_tutor', 'moodle_secret') ?: '';

$payload = json_encode([
    'userId'         => (string) $USER->id,
    'lang'           => $lang,
    'studentProfile' => $studentProfile,
    'messages'       => [['role' => 'user', 'content' => $motivationPrompt]],
]);

$ch = curl_init($middlewareUrl . '/api/advisor/chat');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $secret,
    ],
    CURLOPT_TIMEOUT        => 25,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($curlErr || $httpCode !== 200) {
    echo json_encode(['error' => 'AI service unavailable']);
    exit;
}

$result = json_decode($response, true);
if (empty($result['reply'])) {
    echo json_encode(['error' => 'Empty response from AI']);
    exit;
}

echo json_encode([
    'ok'           => true,
    'message'      => $result['reply'],
    'student_name' => $name,
    'message_url'  => (new moodle_url('/message/index.php', ['id' => $studentId]))->out(false),
]);
exit;
