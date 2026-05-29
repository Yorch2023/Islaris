<?php
/**
 * PHAROS-AI · Demo seeder
 *
 * Crea datos de prueba para el piloto:
 *  - 1 curso PHAROS con los tres módulos activos
 *  - 10 alumnos demo + 2 docentes demo
 *  - Progreso variado: distintos niveles y XP
 *  - Algunas evidencias enviadas y un badge emitido
 *
 * Uso (desde el directorio raíz de Moodle):
 *   sudo -u www-data php /ruta/al/repo/scripts/seed-demo.php
 */

define('CLI_SCRIPT', true);

// Adjust path to your Moodle installation.
$moodleRoot = getenv('MOODLE_ROOT') ?: '/var/www/moodle';
require_once($moodleRoot . '/config.php');
require_once($CFG->dirroot . '/mod/pharos_itinerary/lib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->libdir  . '/enrollib.php');

use mod_pharos_badges\badge_issuer;

echo "PHAROS-AI · Seed demo\n";
echo "======================\n\n";

// ---- Course -----------------------------------------------------------------
$existingCourse = $DB->get_record('course', ['shortname' => 'PHAROS-DEMO']);
if ($existingCourse) {
    echo "El curso PHAROS-DEMO ya existe (id={$existingCourse->id}). Saliendo.\n";
    exit(0);
}

$courseRecord = (object) [
    'fullname'  => 'PHAROS-AI — Curso de demostración',
    'shortname' => 'PHAROS-DEMO',
    'summary'   => 'Curso de prueba para el piloto PHAROS-AI (Erasmus+).',
    'format'    => 'topics',
    'numsections'=> 3,
    'lang'      => 'es',
    'visible'   => 1,
];
$course = create_course($courseRecord);
echo "Curso creado: id={$course->id}\n";

// ---- Module instances -------------------------------------------------------
// mod_pharos_itinerary
$itineraryData = (object) [
    'course'          => $course->id,
    'name'            => 'Mi itinerario PHAROS',
    'startlevel'      => 1,
    'xp_per_evidence' => 10,
    'timecreated'     => time(),
    'timemodified'    => time(),
];
$itineraryId = $DB->insert_record('pharos_itinerary', $itineraryData);
echo "Itinerario creado: id=$itineraryId\n";

// ---- Users ------------------------------------------------------------------
$generator = new testing_data_generator();

$roles       = $DB->get_records_menu('role', null, '', 'shortname, id');
$studentRole = $roles['student'];
$teacherRole = $roles['editingteacher'];
$context     = context_course::instance($course->id);

// Docentes demo.
$teachers = [];
foreach (['Ana López', 'Marco Rossi'] as $i => $fullname) {
    [$firstName, $lastName] = explode(' ', $fullname);
    $user = $generator->create_user([
        'firstname' => $firstName,
        'lastname'  => $lastName,
        'username'  => 'pharos_teacher_' . ($i + 1),
        'email'     => 'pharos_teacher_' . ($i + 1) . '@demo.pharos.eu',
    ]);
    role_assign($teacherRole, $user->id, $context->id);
    $teachers[] = $user;
    echo "Docente: {$fullname} (id={$user->id})\n";
}

// Alumnos demo con distintos niveles de progreso.
$studentProfiles = [
    ['name' => 'Carmen Díaz',      'xp' => 15,  'evidences' => 1],
    ['name' => 'Luigi Esposito',   'xp' => 60,  'evidences' => 2],
    ['name' => 'María Fernández',  'xp' => 105, 'evidences' => 3],
    ['name' => 'Antonio García',   'xp' => 150, 'evidences' => 4],
    ['name' => 'Giulia Conti',     'xp' => 200, 'evidences' => 4],
    ['name' => 'Rosa Martínez',    'xp' => 255, 'evidences' => 5],
    ['name' => 'Pablo Rodríguez',  'xp' => 0,   'evidences' => 0],
    ['name' => 'Sofia Ricci',      'xp' => 40,  'evidences' => 1],
    ['name' => 'Juan Torres',      'xp' => 90,  'evidences' => 2],
    ['name' => 'Elena Moreno',     'xp' => 120, 'evidences' => 3],
];

$evidenceTypes = ['product', 'process', 'impact'];

foreach ($studentProfiles as $i => $profile) {
    [$firstName, $lastName] = explode(' ', $profile['name']);
    $user = $generator->create_user([
        'firstname' => $firstName,
        'lastname'  => $lastName,
        'username'  => 'pharos_student_' . ($i + 1),
        'email'     => 'pharos_student_' . ($i + 1) . '@demo.pharos.eu',
    ]);
    role_assign($studentRole, $user->id, $context->id);

    // Set itinerary progress.
    if ($profile['xp'] > 0) {
        pharos_itinerary_award_xp($itineraryId, $user->id, $profile['xp']);
    } else {
        pharos_itinerary_get_or_create_progress($itineraryId, $user->id);
    }

    // Add evidence records.
    for ($e = 0; $e < $profile['evidences']; $e++) {
        $type  = $evidenceTypes[$e % 3];
        $level = $e < 3 ? 1 : ($e < 4 ? 2 : 3);
        badge_issuer::record_evidence(
            $course->id,
            $user->id,
            $level,
            $type,
            "Evidencia de demostración #{$e} para {$profile['name']}"
        );
    }

    echo "Alumno: {$profile['name']} (xp={$profile['xp']}, evidencias={$profile['evidences']})\n";
}

echo "\nSeed completado. Accede al curso PHAROS-DEMO en Moodle.\n";
