<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

/**
 * AJAX proxy: fetches a personalised learning recommendation from the
 * Node.js middleware (/api/tutor/recommend) using the authenticated user's
 * actual progress data from the Moodle DB.
 *
 * The MOODLE_SECRET is injected server-side and never reaches the browser.
 * The browser only sends: sesskey, lang (optional), and the course module id
 * needed to look up the right itinerary instance.
 */

define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');

require_login();
require_sesskey();

$middlewareUrl = get_config('block_pharos_tutor', 'middleware_url');
$secret        = get_config('block_pharos_tutor', 'moodle_secret');

if (empty($middlewareUrl) || empty($secret)) {
    http_response_code(503);
    echo json_encode(['error' => 'Middleware not configured']);
    die();
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    die();
}

// Validate lang from browser.
$allowedLangs = ['es', 'it'];
$lang = in_array($data['lang'] ?? '', $allowedLangs, true) ? $data['lang'] : 'es';

// Look up the user's current itinerary progress from DB.
// The browser passes cmid so we can find the right itinerary instance.
$cmid = isset($data['cmid']) ? (int) $data['cmid'] : 0;

$level         = 1;
$xp            = 0;
$evidenceCount = 0;

if ($cmid > 0) {
    $cm = get_coursemodule_from_id('pharos_itinerary', $cmid);
    if ($cm) {
        $progress = $DB->get_record('pharos_itinerary_progress', [
            'itineraryid' => $cm->instance,
            'userid'      => $USER->id,
        ]);
        if ($progress) {
            $level = (int) $progress->level;
            $xp    = (int) $progress->xp;
        }

        // Count evidence submissions for this user in this course.
        $evidenceCount = (int) $DB->count_records('pharos_badges_evidence', [
            'userid'   => $USER->id,
            'courseid' => $cm->course,
            'level'    => $level,
        ]);
    }
}

$payload = [
    'userId'        => (string) $USER->id,
    'userName'      => fullname($USER),
    'level'         => $level,
    'xp'            => $xp,
    'evidenceCount' => $evidenceCount,
    'lang'          => $lang,
];

$ch = curl_init(rtrim($middlewareUrl, '/') . '/api/tutor/recommend');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $secret,
    ],
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response  = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    echo json_encode(['error' => 'Could not reach AI middleware']);
    die();
}

http_response_code($httpCode);
header('Content-Type: application/json');
echo $response;
