<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

$string['pluginname']                   = 'Tutor IA PHAROS';
$string['pharos_tutor:addinstance']     = 'Añadir bloque Tutor IA PHAROS';
$string['pharos_tutor:myaddinstance']   = 'Añadir bloque Tutor IA PHAROS a Mi Moodle';

$string['setting_middleware_url']       = 'URL del middleware IA';
$string['setting_middleware_url_desc']  = 'Dirección base del servidor Node.js (ej. http://localhost:3001).';
$string['setting_moodle_secret']        = 'Token secreto';
$string['setting_moodle_secret_desc']   = 'Token compartido con el middleware para autenticar las peticiones (MOODLE_SECRET en .env).';

$string['chat_placeholder']            = 'Escribe tu pregunta sobre IA…';
$string['chat_send']                   = 'Enviar';
$string['chat_thinking']               = 'El tutor está pensando…';
$string['chat_error']                  = 'No se pudo conectar con el tutor. Inténtalo de nuevo.';
$string['chat_welcome']                = '¡Hola! Soy tu tutor de PHAROS-AI. ¿En qué puedo ayudarte hoy sobre inteligencia artificial?';
$string['middleware_not_configured']   = 'El bloque Tutor IA no está configurado. Contacta con el administrador.';
$string['chat_skip_to_input']         = 'Saltar al campo de texto del tutor';
$string['chat_messages_label']        = 'Mensajes del tutor IA';
$string['chat_form_label']            = 'Formulario de pregunta al tutor';
$string['privacy:metadata']                                                   = 'El bloque Tutor IA PHAROS almacena metadatos de sesión (sin contenido de las conversaciones) para analítica pedagógica.';
$string['privacy:metadata:block_pharos_tutor_sessions']                      = 'Metadatos de sesiones de tutoría IA (sin contenido de conversaciones).';
$string['privacy:metadata:block_pharos_tutor_sessions:userid']               = 'ID del usuario de Moodle.';
$string['privacy:metadata:block_pharos_tutor_sessions:courseid']             = 'ID del curso.';
$string['privacy:metadata:block_pharos_tutor_sessions:level']                = 'Nivel del itinerario trabajado.';
$string['privacy:metadata:block_pharos_tutor_sessions:message_count']        = 'Número de mensajes intercambiados.';
$string['privacy:metadata:block_pharos_tutor_sessions:duration_seconds']     = 'Duración de la sesión en segundos.';
$string['privacy:metadata:block_pharos_tutor_sessions:timecreated']          = 'Fecha y hora de la sesión.';
$string['evidence_registered']       = '✓ Actividad registrada — sigue así para obtener tu microcredencial.';
$string['badge_unlocked']            = '🎖 ¡Enhorabuena! Has desbloqueado una nueva microcredencial PHAROS.';
$string['progress_title']            = 'Mi Progreso — PHAROS-AI';
$string['progress_summary']          = 'Resumen de mi aprendizaje';
$string['progress_level']            = 'Nivel actual';
$string['progress_xp']               = 'XP acumulados';
$string['progress_sessions']         = 'Sesiones con IA';
$string['progress_minutes']          = 'Minutos de aprendizaje';
$string['progress_xp_heading']       = 'Progreso en el itinerario';
$string['progress_to_next_level']    = 'hacia el siguiente nivel';
$string['progress_not_started']      = 'Todavía no has iniciado el itinerario. ¡Empieza hoy!';
$string['progress_badges']           = 'Microcredenciales';
$string['progress_recent_sessions']  = 'Últimas sesiones con el tutor IA';
$string['progress_date']             = 'Fecha';
$string['progress_level_col']        = 'Nivel';
$string['progress_no_sessions']      = 'Aún no has iniciado ninguna sesión con el tutor.';
$string['progress_this_week']        = 'Esta semana';
$string['progress_sessions_week']    = 'Sesiones';
$string['progress_messages_total']   = 'Mensajes totales';
$string['progress_profile']          = 'Mi perfil de aprendizaje';
$string['progress_strengths']        = 'Puntos fuertes';
$string['progress_style']            = 'Estilo de aprendizaje';
$string['progress_topics']           = 'Temas trabajados';
$string['progress_reflections']      = 'Mis últimas reflexiones';
$string['progress_link']             = 'Ver mi progreso';
$string['learning_style_examples']   = 'Aprende mejor con ejemplos concretos';
$string['learning_style_questions']  = 'Aprende mejor haciendo preguntas';
$string['learning_style_definitions']= 'Prefiere definiciones precisas';
$string['learning_style_analogies']  = 'Conecta mejor con analogías';
