<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

$string['pluginname']                   = 'PHAROS AI Tutor';
$string['pharos_tutor:addinstance']     = 'Add PHAROS AI Tutor block';
$string['pharos_tutor:myaddinstance']   = 'Add PHAROS AI Tutor block to My Moodle';

$string['setting_middleware_url']       = 'AI middleware URL';
$string['setting_middleware_url_desc']  = 'Base address of the Node.js server (e.g. http://localhost:3001).';
$string['setting_moodle_secret']        = 'Shared secret token';
$string['setting_moodle_secret_desc']   = 'Token shared with the middleware to authenticate requests (MOODLE_SECRET in .env).';

$string['chat_placeholder']            = 'Type your question about AI…';
$string['chat_send']                   = 'Send';
$string['chat_thinking']               = 'The tutor is thinking…';
$string['chat_error']                  = 'Could not connect to the tutor. Please try again.';
$string['chat_welcome']                = 'Hello! I am your PHAROS-AI tutor. How can I help you today with artificial intelligence?';
$string['middleware_not_configured']   = 'The AI Tutor block is not configured. Please contact the administrator.';
$string['chat_skip_to_input']         = 'Skip to tutor input field';
$string['chat_messages_label']        = 'AI tutor messages';
$string['chat_form_label']            = 'Question form for the tutor';
$string['privacy:metadata']                                               = 'The PHAROS AI Tutor block stores session metadata (no conversation content) for pedagogical analytics.';
$string['privacy:metadata:block_pharos_tutor_sessions']                  = 'AI tutoring session metadata (no conversation content stored).';
$string['privacy:metadata:block_pharos_tutor_sessions:userid']           = 'Moodle user ID.';
$string['privacy:metadata:block_pharos_tutor_sessions:courseid']         = 'Course ID.';
$string['privacy:metadata:block_pharos_tutor_sessions:level']            = 'Itinerary level worked on.';
$string['privacy:metadata:block_pharos_tutor_sessions:message_count']    = 'Number of messages exchanged.';
$string['privacy:metadata:block_pharos_tutor_sessions:duration_seconds'] = 'Session duration in seconds.';
$string['privacy:metadata:block_pharos_tutor_sessions:timecreated']      = 'Session date and time.';
$string['privacy:metadata:block_pharos_tutor_memory']                   = 'AI tutor learning profile derived from conversations (no raw dialogue stored).';
$string['privacy:metadata:block_pharos_tutor_memory:userid']            = 'Moodle user ID.';
$string['privacy:metadata:block_pharos_tutor_memory:courseid']          = 'Course ID.';
$string['privacy:metadata:block_pharos_tutor_memory:profile_json']      = 'Structured learning profile: concepts explored, strengths, growth areas, learning style, recurring questions.';
$string['privacy:metadata:block_pharos_tutor_memory:timemodified']      = 'Date and time the profile was last updated.';
$string['evidence_registered']       = '✓ Activity recorded — keep going to earn your microcredential.';
$string['badge_unlocked']            = '🎖 Congratulations! You have unlocked a new PHAROS microcredential.';
$string['progress_title']            = 'My Progress — PHAROS-AI';
$string['progress_summary']          = 'My learning summary';
$string['progress_level']            = 'Current level';
$string['progress_xp']               = 'XP earned';
$string['progress_sessions']         = 'AI sessions';
$string['progress_minutes']          = 'Learning minutes';
$string['progress_xp_heading']       = 'Itinerary progress';
$string['progress_to_next_level']    = 'to next level';
$string['progress_not_started']      = 'You have not started the itinerary yet. Start today!';
$string['progress_badges']           = 'Micro-credentials';
$string['progress_recent_sessions']  = 'Latest AI tutor sessions';
$string['progress_date']             = 'Date';
$string['progress_level_col']        = 'Level';
$string['progress_no_sessions']      = 'No sessions with the AI tutor yet.';
$string['progress_this_week']        = 'This week';
$string['progress_sessions_week']    = 'Sessions';
$string['progress_messages_total']   = 'Total messages';
$string['progress_profile']          = 'My learning profile';
$string['progress_strengths']        = 'Strengths';
$string['progress_style']            = 'Learning style';
$string['progress_topics']           = 'Topics covered';
$string['progress_reflections']      = 'My latest reflections';
$string['progress_link']             = 'View my progress';
$string['learning_style_examples']   = 'Learns best with concrete examples';
$string['learning_style_questions']  = 'Learns best by asking questions';
$string['learning_style_definitions']= 'Prefers precise definitions';
$string['learning_style_analogies']  = 'Connects better through analogies';
