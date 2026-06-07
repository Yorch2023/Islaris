<?php
defined('MOODLE_INTERNAL') || die();

$string['pluginname']          = 'Itinerario PHAROS';
$string['modulename']          = 'Itinerario PHAROS';
$string['modulenameplural']    = 'Itinerarios PHAROS';
$string['modulename_help']     = 'El módulo Itinerario PHAROS muestra el recorrido formativo personalizado del alumno con niveles progresivos, XP y microcredenciales.';
$string['pharos_itinerary:view']         = 'Ver itinerario';
$string['pharos_itinerary:addinstance']  = 'Añadir itinerario';
$string['startlevel']          = 'Nivel inicial';
$string['nivel']               = 'Nivel';
$string['xp_per_evidence']     = 'XP por evidencia';
$string['mi_itinerario']       = 'Mi itinerario';
$string['actividades']         = 'Actividades';
$string['microcredenciales']       = 'Mis microcredenciales';
$string['level1_desc']             = 'Conceptos básicos de IA, herramientas cotidianas y primeros pasos.';
$string['level2_desc']             = 'Aplicaciones profesionales, uso crítico y evaluación de herramientas IA.';
$string['level3_desc']             = 'Diseño de actividades, liderazgo pedagógico e impacto en política educativa.';
$string['nivel_bloqueado']         = 'Nivel bloqueado — completa el nivel anterior primero';
$string['nivel_actual']            = 'Nivel actual';
$string['skip_to_levels']          = 'Saltar a los niveles del itinerario';
$string['current_level']           = 'Nivel actual';
$string['xp_progress']             = 'Progreso XP';
$string['no_activities']           = 'No hay actividades asignadas a este nivel.';
$string['ver_microcredenciales']   = 'Ver mis microcredenciales';
$string['manage_activities']           = 'Gestionar actividades del itinerario';
$string['manage_activities_intro']     = 'Asigna actividades del curso a cada nivel del itinerario. Las actividades asignadas aparecerán en el itinerario del alumno.';
$string['available_activities']        = 'Actividades disponibles para asignar';
$string['no_available_activities']     = 'Todas las actividades del curso ya están asignadas al itinerario.';
$string['assign_to_level']             = 'Asignar al nivel';
$string['remove']                      = 'Quitar';
$string['move_up']                     = 'Subir';
$string['move_down']                   = 'Bajar';
$string['activity_assigned']           = 'Actividad añadida al itinerario.';
$string['activity_removed']            = 'Actividad eliminada del itinerario.';
$string['manage_activities_link']      = 'Gestionar actividades';

// Privacy API
$string['privacy:metadata']                                   = 'El módulo Itinerario PHAROS almacena datos de progreso del usuario.';
$string['privacy:metadata:pharos_itinerary_progress']         = 'Progreso del usuario en el itinerario (nivel y XP acumulado).';
$string['privacy:metadata:pharos_itinerary_progress:userid']  = 'ID del usuario de Moodle.';
$string['privacy:metadata:pharos_itinerary_progress:level']   = 'Nivel actual del itinerario (1, 2 o 3).';
$string['privacy:metadata:pharos_itinerary_progress:xp']      = 'Puntos de experiencia (XP) acumulados.';
$string['privacy:metadata:pharos_itinerary_progress:timemodified'] = 'Fecha y hora de la última actualización del progreso.';

// Web service
$string['ws_get_user_progress']       = 'Obtener progreso del usuario en el itinerario';
$string['ws_award_xp']                = 'Conceder XP al usuario en el itinerario';

// Events
$string['event_xp_awarded']           = 'XP concedido';
$string['event_level_up']             = 'Subida de nivel';

// Recommendation widget
$string['recommend_heading']          = '¿Qué hacer a continuación?';
$string['recommend_loading']          = 'Cargando recomendación…';
$string['recommend_error']            = 'No se pudo cargar la recomendación.';

// Reflection system
$string['reflect_btn']         = 'Reflexionar';
$string['reflect_title']       = 'Reflexión de actividad';
$string['reflect_label']       = 'Escribe tu reflexión sobre esta actividad';
$string['reflect_placeholder'] = 'Describe qué aprendiste, qué te sorprendió, cómo lo conectas con tu vida o trabajo… (mín. 50 caracteres)';
$string['reflect_hint']        = 'Mín. 50 caracteres · Máx. 1000 · Ctrl+Enter para enviar';
$string['reflect_submit']      = 'Enviar reflexión';
$string['reflect_close']       = 'Cerrar';
