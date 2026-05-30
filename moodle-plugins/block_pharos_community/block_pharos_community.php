<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * PHAROS-AI Community block.
 *
 * Displays transnational practice community features:
 * - Forums filtered by level and country (España / Italia)
 * - Upcoming BigBlueButton webinars
 * - Shared resources from consortium partners
 */
class block_pharos_community extends block_base {

    public function name(): string {
        return 'pharos_community';
    }

    public function init(): void {
        $this->title = get_string('pluginname', 'block_pharos_community');
    }

    public function has_config(): bool {
        return true;
    }

    public function applicable_formats(): array {
        return [
            'site'   => true,
            'course' => true,
            'my'     => true,
        ];
    }

    public function get_content(): ?stdClass {
        global $USER, $COURSE, $PAGE, $OUTPUT, $DB;

        if ($this->content !== null) {
            return $this->content;
        }

        $this->content         = new stdClass();
        $this->content->footer = '';

        if (!has_capability('block/pharos_community:view', $this->context)) {
            $this->content->text = '';
            return $this->content;
        }

        // Determine user level from itinerary progress.
        // Gracefully fall back to level 1 if the PHAROS tables do not exist yet.
        $userLevel = 1;
        try {
            if ($DB->get_manager()->table_exists('pharos_itinerary_progress') &&
                    $DB->get_manager()->table_exists('pharos_itinerary')) {
                $record = $DB->get_record_sql(
                    "SELECT pp.level
                       FROM {pharos_itinerary_progress} pp
                       JOIN {pharos_itinerary} pi ON pi.id = pp.itineraryid
                      WHERE pi.course = :course AND pp.userid = :userid
                   ORDER BY pp.level DESC
                      LIMIT 1",
                    ['course' => $COURSE->id, 'userid' => $USER->id]
                );
                if ($record) {
                    $userLevel = max(1, min(3, (int) $record->level));
                }
            }
        } catch (Exception $e) {
            // Tables not yet installed; default level 1 is fine.
        }

        // Build forum list: forums whose name contains a level tag and the
        // country tags 'ES' or 'IT'. We surface real Moodle forum instances
        // plus any configured external links from plugin settings.
        $forums      = $this->get_community_forums($userLevel);
        $webinars    = $this->get_upcoming_webinars();
        $resources   = $this->get_shared_resources();

        $levelLabels = [
            1 => get_string('level1_label', 'block_pharos_community'),
            2 => get_string('level2_label', 'block_pharos_community'),
            3 => get_string('level3_label', 'block_pharos_community'),
        ];

        $data = [
            'user_level'       => $userLevel,
            'user_level_label' => $levelLabels[$userLevel] ?? '',
            'forums'           => $forums,
            'webinars'         => $webinars,
            'resources'        => $resources,
            'has_forums'       => !empty($forums),
            'has_webinars'     => !empty($webinars),
            'has_resources'    => !empty($resources),
            'forum_url'        => get_config('block_pharos_community', 'forum_url') ?: '',
            'consortium_url'   => get_config('block_pharos_community', 'consortium_url') ?: '',
        ];

        $this->content->text = $OUTPUT->render_from_template(
            'block_pharos_community/community_view',
            $data
        );

        return $this->content;
    }

    // -------------------------------------------------------------------------

    /**
     * Return forum instances visible to the user for their level.
     * Falls back gracefully if mod_forum is not present.
     *
     * @param int $userLevel
     * @return array
     */
    private function get_community_forums(int $userLevel): array {
        global $DB, $COURSE;

        if (!$DB->get_manager()->table_exists('forum')) {
            return [];
        }

        // Tag convention: forum name must contain "[PHAROS-N{level}]".
        $tag   = sprintf('[PHAROS-N%d]', $userLevel);
        $forums = $DB->get_records_sql(
            "SELECT f.id, f.name, f.intro,
                    cm.id AS cmid
               FROM {forum} f
               JOIN {course_modules} cm ON cm.instance = f.id
               JOIN {modules} m ON m.id = cm.module AND m.name = 'forum'
              WHERE cm.course  = :course
                AND cm.visible = 1
                AND " . $DB->sql_like('f.name', ':tag', false),
            ['course' => $COURSE->id, 'tag' => '%' . $DB->sql_like_escape($tag) . '%']
        );

        $result = [];
        foreach ($forums as $f) {
            $result[] = [
                'id'    => $f->id,
                'name'  => format_string($f->name),
                'url'   => (new moodle_url('/mod/forum/view.php', ['id' => $f->cmid]))->out(false),
                'es'    => strpos($f->name, '[ES]') !== false,
                'it'    => strpos($f->name, '[IT]') !== false,
            ];
        }
        return $result;
    }

    /**
     * Return upcoming BBB webinars from configured plugin setting JSON.
     * Setting `webinars_json` holds a JSON array of
     * { title, date_iso, url, country } objects.
     *
     * @return array
     */
    private function get_upcoming_webinars(): array {
        $json = get_config('block_pharos_community', 'webinars_json');
        if (!$json) {
            return [];
        }

        $items = json_decode($json, true);
        if (!is_array($items)) {
            return [];
        }

        $now    = time();
        $result = [];
        foreach ($items as $item) {
            if (!isset($item['date_iso'], $item['title'], $item['url'])) {
                continue;
            }
            $ts = strtotime($item['date_iso']);
            if ($ts === false || $ts < $now) {
                continue;
            }
            $result[] = [
                'title'   => clean_param($item['title'], PARAM_TEXT),
                'date'    => userdate($ts, get_string('strftimedatetimeshort', 'langconfig')),
                'url'     => clean_param($item['url'], PARAM_URL),
                'country' => clean_param($item['country'] ?? '', PARAM_ALPHA),
            ];
        }

        // Sort ascending by date.
        usort($result, static fn($a, $b) => strcmp($a['date'], $b['date']));

        return array_slice($result, 0, 5);
    }

    /**
     * Return shared resource links from configured plugin setting JSON.
     * Setting `resources_json` holds a JSON array of
     * { title, url, type, lang } objects.
     *
     * @return array
     */
    private function get_shared_resources(): array {
        $json = get_config('block_pharos_community', 'resources_json');
        if (!$json) {
            return [];
        }

        $items = json_decode($json, true);
        if (!is_array($items)) {
            return [];
        }

        $allowedTypes = ['doc', 'video', 'link'];
        $result = [];
        foreach ($items as $item) {
            if (!isset($item['title'], $item['url'])) {
                continue;
            }
            $type = clean_param($item['type'] ?? 'link', PARAM_ALPHA);
            if (!in_array($type, $allowedTypes, true)) {
                $type = 'link';
            }
            $result[] = [
                'title'      => clean_param($item['title'], PARAM_TEXT),
                'url'        => clean_param($item['url'], PARAM_URL),
                'type'       => $type,
                'type_label' => get_string('resource_type_' . $type, 'block_pharos_community'),
                'lang'       => clean_param($item['lang'] ?? 'es', PARAM_ALPHA),
            ];
        }
        return array_slice($result, 0, 10);
    }
}
