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
$string['privacy:metadata']           = 'El bloque Tutor IA PHAROS no almacena datos personales. Las conversaciones no se persisten en la base de datos de Moodle.';
