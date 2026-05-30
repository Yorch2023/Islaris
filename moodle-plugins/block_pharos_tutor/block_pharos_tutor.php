<?php
// This file is part of the PHAROS-AI Moodle plugin.
// License: GPL-3.0 https://www.gnu.org/licenses/gpl-3.0.html

defined('MOODLE_INTERNAL') || die();

/**
 * PHAROS-AI Tutor IA block.
 *
 * Renders a chat interface that communicates with the Node.js middleware
 * via POST /api/tutor/chat, proxied through an internal Moodle web service
 * to keep the shared secret out of the browser.
 */
class block_pharos_tutor extends block_base {

    public function name(): string {
        return 'pharos_tutor';
    }

    public function init(): void {
        $this->title = get_string('pluginname', 'block_pharos_tutor');
    }

    public function has_config(): bool {
        return true;
    }

    public function applicable_formats(): array {
        return [
            'site'         => true,
            'course'       => true,
            'my'           => true,
        ];
    }

    public function get_content(): ?stdClass {
        global $USER, $COURSE, $PAGE, $DB;

        if ($this->content !== null) {
            return $this->content;
        }

        $this->content = new stdClass();
        $this->content->footer = '';

        $middlewareUrl = get_config('block_pharos_tutor', 'middleware_url');
        $secret        = get_config('block_pharos_tutor', 'moodle_secret');

        if (empty($middlewareUrl) || empty($secret)) {
            $this->content->text = html_writer::tag(
                'p',
                get_string('middleware_not_configured', 'block_pharos_tutor'),
                ['class' => 'pharos-tutor-error alert alert-warning']
            );
            return $this->content;
        }

        // Determine the itinerary level for this user by querying the DB.
        $userLevel = 1;
        $itinerary = $DB->get_record_sql(
            "SELECT pp.level
               FROM {pharos_itinerary_progress} pp
               JOIN {pharos_itinerary} pi ON pi.id = pp.itineraryid
              WHERE pi.course = :course AND pp.userid = :userid
              LIMIT 1",
            ['course' => $COURSE->id, 'userid' => $USER->id]
        );
        if ($itinerary) {
            $userLevel = max(1, min(3, (int) $itinerary->level));
        }

        // Derive language ('es' or 'it') from Moodle's current language.
        $lang = current_language();
        $lang = str_starts_with($lang, 'it') ? 'it' : 'es';

        // Proxy URLs: non-streaming and SSE streaming.
        $proxyUrl       = new moodle_url('/blocks/pharos_tutor/ajax.php');
        $streamProxyUrl = new moodle_url('/blocks/pharos_tutor/ajax-stream.php');

        $templateData = [
            'proxy_url'        => $proxyUrl->out(false),
            'stream_proxy_url' => $streamProxyUrl->out(false),
            'user_id'          => (string) $USER->id,
            'user_level'       => $userLevel,
            'lang'             => $lang,
            'sesskey'          => sesskey(),
            'strings'          => [
                'pluginname'    => get_string('pluginname',       'block_pharos_tutor'),
                'placeholder'   => get_string('chat_placeholder', 'block_pharos_tutor'),
                'send'          => get_string('chat_send',        'block_pharos_tutor'),
                'thinking'      => get_string('chat_thinking',    'block_pharos_tutor'),
                'error'         => get_string('chat_error',       'block_pharos_tutor'),
                'welcome'       => get_string('chat_welcome',     'block_pharos_tutor'),
                'skip_to_input' => get_string('chat_skip_to_input', 'block_pharos_tutor'),
                'messages_label'=> get_string('chat_messages_label','block_pharos_tutor'),
                'form_label'    => get_string('chat_form_label',  'block_pharos_tutor'),
            ],
        ];

        $renderer = $PAGE->get_renderer('core');
        $this->content->text = $renderer->render_from_template(
            'block_pharos_tutor/tutor_chat',
            $templateData
        );

        $PAGE->requires->js_call_amd('block_pharos_tutor/tutor-chat', 'init');

        return $this->content;
    }
}
