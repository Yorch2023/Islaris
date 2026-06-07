<?php
defined('MOODLE_INTERNAL') || die();

$string['pluginname']               = 'Badges PHAROS';
$string['modulename']               = 'Badges PHAROS';
$string['modulenameplural']         = 'Badges PHAROS';
$string['pharos_badges:view']               = 'Ver badges PHAROS';
$string['pharos_badges:submit_evidence']    = 'Enviar evidencia';
$string['microcredenciales']        = 'Microcredenciales';
$string['evidence_product']         = 'Evidencia de producto';
$string['evidence_process']         = 'Evidencia de proceso';
$string['evidence_impact']          = 'Evidencia de impacto';
$string['badge_earned']             = 'Badge obtenido';
$string['evidence_recorded']        = 'Evidencia registrada correctamente.';
$string['badge_issued']             = '¡Enhorabuena! Has obtenido una nueva microcredencial.';
$string['evidencias_requeridas']    = 'evidencias requeridas';
$string['no_evidence_yet']          = 'Aún no has enviado evidencias para este nivel.';
$string['submit_evidence']          = 'Enviar evidencia';
$string['nivel']                    = 'Nivel';
$string['tipo_evidencia']           = 'Tipo de evidencia';
$string['descripcion_evidencia']    = 'Descripción de la evidencia';
$string['descripcion_evidencia_hint'] = 'Máximo 1000 caracteres. Describe qué aprendiste, creaste o aplicaste.';
$string['evidencias_enviadas']      = 'Evidencias enviadas';
$string['tipo']                     = 'Tipo';
$string['de']                       = 'de';
$string['pageheading']              = 'Mis evidencias y microcredenciales';
$string['level1_desc']              = 'Fundamentos';
$string['level2_desc']              = 'IA en la práctica';
$string['level3_desc']              = 'Facilitación crítica';

$string['evidence_ai_interaction']  = 'Sesión con tutor IA';
$string['ai_evidence_title']        = 'Las evidencias se generan automáticamente';
$string['ai_evidence_info']         = 'Cada conversación de 5 o más intercambios con el Tutor IA PHAROS registra automáticamente una evidencia de aprendizaje para ese nivel. Sin formularios, sin subida de documentos.';

// Privacy API
$string['privacy:metadata']                                      = 'El módulo Badges PHAROS almacena evidencias enviadas por los estudiantes.';
$string['privacy:metadata:pharos_badges_evidence']               = 'Evidencias enviadas por el usuario para obtener microcredenciales.';
$string['privacy:metadata:pharos_badges_evidence:userid']        = 'ID del usuario de Moodle.';
$string['privacy:metadata:pharos_badges_evidence:level']         = 'Nivel del itinerario al que corresponde la evidencia.';
$string['privacy:metadata:pharos_badges_evidence:type']          = 'Tipo de evidencia (producto, proceso o impacto).';
$string['privacy:metadata:pharos_badges_evidence:description']   = 'Descripción textual de la evidencia aportada por el usuario.';
$string['privacy:metadata:pharos_badges_evidence:timecreated']   = 'Fecha y hora de envío de la evidencia.';

// Notifications
$string['messageprovider:badge_earned']  = 'Notificaciones de microcredencial PHAROS';
$string['notify_badge_subject']          = '🎖 ¡Has obtenido la microcredencial {$a->badge}!';
$string['notify_badge_body']             = "¡Hola {$a->name}!\n\n¡Felicidades! Has completado el {$a->level} y obtenido la microcredencial:\n\n{$a->badge}\n\nEsta microcredencial certifica tu competencia en alfabetización crítica en IA y puede añadirse a tu perfil de Europass.\n\nAccede al curso: {$a->courseurl}\n\nEl equipo PHAROS-AI";
