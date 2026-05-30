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
$string['privacy:metadata']           = 'The PHAROS AI Tutor block does not store personal data. Conversations are not persisted in the Moodle database.';
