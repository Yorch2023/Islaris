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
$string['privacy:metadata']                                                   = 'Il blocco Tutor IA PHAROS memorizza metadati di sessione (senza contenuto delle conversazioni) per l\'analisi pedagogica.';
$string['privacy:metadata:block_pharos_tutor_sessions']                      = 'Metadati delle sessioni di tutoría IA (senza contenuto delle conversazioni).';
$string['privacy:metadata:block_pharos_tutor_sessions:userid']               = 'ID utente di Moodle.';
$string['privacy:metadata:block_pharos_tutor_sessions:courseid']             = 'ID del corso.';
$string['privacy:metadata:block_pharos_tutor_sessions:level']                = 'Livello dell\'itinerario su cui si è lavorato.';
$string['privacy:metadata:block_pharos_tutor_sessions:message_count']        = 'Numero di messaggi scambiati.';
$string['privacy:metadata:block_pharos_tutor_sessions:duration_seconds']     = 'Durata della sessione in secondi.';
$string['privacy:metadata:block_pharos_tutor_sessions:timecreated']          = 'Data e ora della sessione.';
$string['privacy:metadata:block_pharos_tutor_memory']                        = 'Profilo di apprendimento del tutor IA derivato dalle conversazioni (nessun dialogo grezzo memorizzato).';
$string['privacy:metadata:block_pharos_tutor_memory:userid']                 = 'ID utente di Moodle.';
$string['privacy:metadata:block_pharos_tutor_memory:courseid']               = 'ID del corso.';
$string['privacy:metadata:block_pharos_tutor_memory:profile_json']           = 'Profilo di apprendimento strutturato: concetti esplorati, punti di forza, aree di miglioramento, stile di apprendimento, domande ricorrenti.';
$string['privacy:metadata:block_pharos_tutor_memory:timemodified']           = 'Data e ora dell\'ultimo aggiornamento del profilo.';
$string['evidence_registered']       = '✓ Attività registrata — continua così per ottenere la tua microcredenziale.';
$string['badge_unlocked']            = '🎖 Congratulazioni! Hai sbloccato una nuova microcredenziale PHAROS.';
$string['progress_title']            = 'I Miei Progressi — PHAROS-AI';
$string['progress_summary']          = 'Riepilogo del mio apprendimento';
$string['progress_level']            = 'Livello attuale';
$string['progress_xp']               = 'XP accumulati';
$string['progress_sessions']         = 'Sessioni con IA';
$string['progress_minutes']          = 'Minuti di apprendimento';
$string['progress_xp_heading']       = 'Avanzamento nell\'itinerario';
$string['progress_to_next_level']    = 'verso il livello successivo';
$string['progress_not_started']      = 'Non hai ancora iniziato l\'itinerario. Inizia oggi!';
$string['progress_badges']           = 'Micro-credenziali';
$string['progress_recent_sessions']  = 'Ultime sessioni con il tutor IA';
$string['progress_date']             = 'Data';
$string['progress_level_col']        = 'Livello';
$string['progress_no_sessions']      = 'Nessuna sessione con il tutor IA finora.';
$string['progress_this_week']        = 'Questa settimana';
$string['progress_sessions_week']    = 'Sessioni';
$string['progress_messages_total']   = 'Messaggi totali';
$string['progress_profile']          = 'Il mio profilo di apprendimento';
$string['progress_strengths']        = 'Punti di forza';
$string['progress_style']            = 'Stile di apprendimento';
$string['progress_topics']           = 'Argomenti trattati';
$string['progress_reflections']      = 'Le mie ultime riflessioni';
$string['progress_link']             = 'Vedi i miei progressi';
$string['learning_style_examples']   = 'Impara meglio con esempi concreti';
$string['learning_style_questions']  = 'Impara meglio facendo domande';
$string['learning_style_definitions']= 'Preferisce definizioni precise';
$string['learning_style_analogies']  = 'Collegamento migliore tramite analogie';
