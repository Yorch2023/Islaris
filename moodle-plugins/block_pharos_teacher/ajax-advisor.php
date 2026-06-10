<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html
//
// Proxies teacher messages to the PHAROS AI Advisor middleware.
// Builds the student profile from DB and injects it as context.
// MOODLE_SECRET is never sent to the browser — injected server-side here.

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
$messages  = $data['messages']          ?? [];
$lang      = in_array($data['lang'] ?? '', ['es', 'it'], true) ? $data['lang'] : 'es';

if (!$courseId || !$studentId) {
    echo json_encode(['error' => 'Missing parameters']);
    exit;
}

if (!is_array($messages) || empty($messages)) {
    echo json_encode(['error' => 'messages required']);
    exit;
}

$context = context_course::instance($courseId);
require_capability('block/pharos_teacher:view', $context);

if (!is_enrolled($context, $studentId)) {
    echo json_encode(['error' => 'User not enrolled']);
    exit;
}

// ── Build student profile ────────────────────────────────────────────────────

$student = $DB->get_record('user', ['id' => $studentId], 'id, firstname, lastname', MUST_EXIST);

$level      = 1;
$xp         = 0;
$thresholds = [1 => 100, 2 => 250, 3 => 250];
$levelNames = [1 => 'N1 — Fundamentos', 2 => 'N2 — IA en la práctica', 3 => 'N3 — Facilitación crítica'];
$lastSeen   = null;

// Itinerary progress.
try {
    if ($DB->get_manager()->table_exists('pharos_itinerary_progress')) {
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
    // No itinerary data; use defaults.
}

$xpNext    = $thresholds[$level] ?? 250;
$xpPercent = (int) min(100, round($xp / $xpNext * 100));
$now       = time();
$daysSince = $lastSeen ? (int) floor(($now - $lastSeen) / DAYSECS) : null;

// Evidence per level.
$evidenceByLevel = [];
try {
    if ($DB->get_manager()->table_exists('pharos_badges_evidence')) {
        $rows = $DB->get_records_sql(
            "SELECT level, COUNT(*) AS cnt
               FROM {pharos_badges_evidence}
              WHERE userid = :userid AND courseid = :courseid
              GROUP BY level",
            ['userid' => $studentId, 'courseid' => $courseId]
        );
        foreach ($rows as $row) {
            $evidenceByLevel[(int) $row->level] = (int) $row->cnt;
        }
    }
} catch (Exception $e) {
    // No evidence data.
}

// AI session stats.
$aiSessionsTotal = 0;
$aiSessionsWeek  = 0;
$aiMinutesTotal  = 0;
$lastAiSession   = null;
try {
    if ($DB->get_manager()->table_exists('block_pharos_tutor_sessions')) {
        $weekAgo = $now - (7 * DAYSECS);
        $totals  = $DB->get_record_sql(
            "SELECT COUNT(*) AS total_sessions,
                    COALESCE(SUM(message_count), 0) AS total_messages,
                    COALESCE(SUM(duration_seconds) / 60, 0) AS total_minutes,
                    MAX(timecreated) AS last_session
               FROM {block_pharos_tutor_sessions}
              WHERE userid = :uid AND courseid = :cid",
            ['uid' => $studentId, 'cid' => $courseId]
        );
        if ($totals) {
            $aiSessionsTotal = (int) $totals->total_sessions;
            $aiMinutesTotal  = (int) $totals->total_minutes;
            $lastAiSession   = $totals->last_session ? (int) $totals->last_session : null;
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

// ── Format profile text ──────────────────────────────────────────────────────

$name         = fullname($student);
$levelLabel   = $levelNames[$level] ?? "N{$level}";
$daysInactive = $daysSince !== null ? "{$daysSince} días" : 'desconocido';
$lastAiLabel  = $lastAiSession
    ? userdate($lastAiSession, get_string('strftimedatetimeshort', 'langconfig'))
    : 'nunca';

$evidenceLines = '';
foreach ([1, 2, 3] as $lvl) {
    $cnt = $evidenceByLevel[$lvl] ?? 0;
    $evidenceLines .= "  - Nivel {$lvl}: {$cnt} evidencias\n";
}

$studentProfile = <<<PROFILE
Nombre: {$name}
Nivel actual: {$levelLabel}
XP acumulado: {$xp} / {$xpNext} ({$xpPercent}%)
Días desde última actividad en el itinerario: {$daysInactive}

Sesiones con el Tutor IA:
  - Total histórico: {$aiSessionsTotal}
  - Esta semana: {$aiSessionsWeek}
  - Tiempo total: {$aiMinutesTotal} minutos
  - Última sesión IA: {$lastAiLabel}

Evidencias obtenidas por nivel:
{$evidenceLines}
PROFILE;

// ── Forward to middleware ────────────────────────────────────────────────────

$middlewareUrl = rtrim(get_config('block_pharos_tutor', 'middleware_url') ?: getenv('PHAROS_MIDDLEWARE_URL') ?: 'http://ai-layer:3001', '/');
$secret        = getenv('MOODLE_SECRET') ?: '';
$teacherId     = (string) $USER->id;

$payload = json_encode([
    'userId'         => $teacherId,
    'lang'           => $lang,
    'studentProfile' => $studentProfile,
    'messages'       => $messages,
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
    CURLOPT_TIMEOUT        => 30,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($curlErr || $httpCode !== 200) {
    echo json_encode(['error' => 'AI service unavailable']);
    exit;
}

// Forward the middleware response directly.
echo $response;
exit;
