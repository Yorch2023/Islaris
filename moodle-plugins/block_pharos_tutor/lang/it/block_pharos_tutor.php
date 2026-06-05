<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

$string['pluginname']                   = 'Tutor IA PHAROS';
$string['pharos_tutor:addinstance']     = 'Aggiungi blocco Tutor IA PHAROS';
$string['pharos_tutor:myaddinstance']   = 'Aggiungi blocco Tutor IA PHAROS a La mia home';

$string['setting_middleware_url']       = 'URL del middleware IA';
$string['setting_middleware_url_desc']  = 'Indirizzo base del server Node.js (es. http://localhost:3001).';
$string['setting_moodle_secret']        = 'Token segreto';
$string['setting_moodle_secret_desc']   = 'Token condiviso con il middleware per autenticare le richieste (MOODLE_SECRET nel file .env).';

$string['chat_placeholder']            = 'Scrivi la tua domanda sull\'IA…';
$string['chat_send']                   = 'Invia';
$string['chat_thinking']               = 'Il tutor sta pensando…';
$string['chat_error']                  = 'Impossibile connettersi al tutor. Riprova.';
$string['chat_welcome']                = 'Ciao! Sono il tuo tutor PHAROS-AI. Come posso aiutarti oggi sull\'intelligenza artificiale?';
$string['middleware_not_configured']   = 'Il blocco Tutor IA non è configurato. Contatta l\'amministratore.';
$string['chat_skip_to_input']         = 'Vai al campo di testo del tutor';
$string['chat_messages_label']        = 'Messaggi del tutor IA';
$string['chat_form_label']            = 'Modulo per la domanda al tutor';
$string['privacy:metadata']           = 'Il blocco Tutor IA PHAROS memorizza metadati di sessione (senza contenuto delle conversazioni) per l\'analisi pedagogica.';
$string['evidence_registered']       = '✓ Attività registrata — continua così per ottenere la tua microcredenziale.';
$string['badge_unlocked']            = '🎖 Congratulazioni! Hai sbloccato una nuova microcredenziale PHAROS.';
