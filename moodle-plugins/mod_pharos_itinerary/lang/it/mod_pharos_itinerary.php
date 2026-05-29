<?php
defined('MOODLE_INTERNAL') || die();

$string['pluginname']          = 'Itinerario PHAROS';
$string['modulename']          = 'Itinerario PHAROS';
$string['modulenameplural']    = 'Itinerari PHAROS';
$string['modulename_help']     = 'Il modulo Itinerario PHAROS mostra il percorso formativo personalizzato dello studente con livelli progressivi, XP e microcredenziali.';
$string['pharos_itinerary:view']         = 'Visualizza itinerario';
$string['pharos_itinerary:addinstance']  = 'Aggiungi itinerario';
$string['startlevel']          = 'Livello iniziale';
$string['nivel']               = 'Livello';
$string['xp_per_evidence']     = 'XP per prova';
$string['mi_itinerario']       = 'Il mio itinerario';
$string['actividades']         = 'Attività';
$string['microcredenciales']       = 'Le mie microcredenziali';
$string['level1_desc']             = 'Concetti di base sull\'IA, strumenti quotidiani e primi passi.';
$string['level2_desc']             = 'Applicazioni professionali, uso critico e valutazione degli strumenti IA.';
$string['level3_desc']             = 'Progettazione di attività, leadership pedagogica e impatto sulla politica educativa.';
$string['nivel_bloqueado']         = 'Livello bloccato — completa prima il livello precedente';
$string['nivel_actual']            = 'Livello attuale';
$string['skip_to_levels']          = 'Vai ai livelli dell\'itinerario';
$string['current_level']           = 'Livello attuale';
$string['xp_progress']             = 'Progresso XP';
$string['no_activities']           = 'Nessuna attività assegnata a questo livello.';
$string['ver_microcredenciales']   = 'Visualizza le mie microcredenziali';
$string['manage_activities']           = 'Gestisci le attività dell\'itinerario';
$string['manage_activities_intro']     = 'Assegna le attività del corso a ciascun livello dell\'itinerario. Le attività assegnate appariranno nell\'itinerario dello studente.';
$string['available_activities']        = 'Attività disponibili da assegnare';
$string['no_available_activities']     = 'Tutte le attività del corso sono già assegnate all\'itinerario.';
$string['assign_to_level']             = 'Assegna al livello';
$string['remove']                      = 'Rimuovi';
$string['move_up']                     = 'Su';
$string['move_down']                   = 'Giù';
$string['activity_assigned']           = 'Attività aggiunta all\'itinerario.';
$string['activity_removed']            = 'Attività rimossa dall\'itinerario.';
$string['manage_activities_link']      = 'Gestisci attività';

// Privacy API
$string['privacy:metadata']                                   = 'Il modulo Itinerario PHAROS memorizza i dati di avanzamento dell\'utente.';
$string['privacy:metadata:pharos_itinerary_progress']         = 'Avanzamento dell\'utente nell\'itinerario (livello e XP accumulati).';
$string['privacy:metadata:pharos_itinerary_progress:userid']  = 'ID utente Moodle.';
$string['privacy:metadata:pharos_itinerary_progress:level']   = 'Livello attuale dell\'itinerario (1, 2 o 3).';
$string['privacy:metadata:pharos_itinerary_progress:xp']      = 'Punti esperienza (XP) accumulati.';
$string['privacy:metadata:pharos_itinerary_progress:timemodified'] = 'Data e ora dell\'ultimo aggiornamento dell\'avanzamento.';

// Events
$string['event_xp_awarded']           = 'XP assegnati';
$string['event_level_up']             = 'Aumento di livello';

// Web service
$string['ws_get_user_progress']       = 'Ottieni il progresso dell\'utente nell\'itinerario';
$string['ws_award_xp']                = 'Assegna XP all\'utente nell\'itinerario';

// Recommendation widget
$string['recommend_heading']          = 'Cosa fare dopo?';
$string['recommend_loading']          = 'Caricamento raccomandazione…';
$string['recommend_error']            = 'Impossibile caricare la raccomandazione.';
