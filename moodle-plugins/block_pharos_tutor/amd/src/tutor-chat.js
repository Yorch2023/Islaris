// AMD module: block_pharos_tutor/tutor-chat
// Handles the PHAROS-AI tutor chat UI.
// Calls the Moodle AJAX proxy (ajax.php) which forwards to the Node.js middleware.
define([], function () {
    'use strict';

    const MAX_HISTORY = 20; // Keep last N messages in memory

    /**
     * Find the block's root element and wire up all event listeners.
     */
    function init() {
        const root = document.querySelector('.pharos-tutor');
        if (!root) {
            return;
        }

        const config = {
            proxyUrl: root.dataset.proxyUrl,
            userId:   root.dataset.userId,
            level:    parseInt(root.dataset.level, 10) || 1,
            lang:     root.dataset.lang || 'es',
            sesskey:  root.dataset.sesskey,
        };

        const ui = {
            messages: root.querySelector('#pharos-tutor-messages'),
            status:   root.querySelector('#pharos-tutor-status'),
            form:     root.querySelector('#pharos-tutor-form'),
            input:    root.querySelector('#pharos-tutor-input'),
            send:     root.querySelector('.pharos-tutor__send'),
        };

        const errorText = ui.status ? ui.status.dataset.errorText || 'Error' : 'Error';

        // In-memory conversation history (no persistence — privacy by design).
        const history = [];

        ui.form.addEventListener('submit', function (e) {
            e.preventDefault();
            const text = ui.input.value.trim();
            if (!text) {
                return;
            }
            handleSend(text, config, ui, history, errorText);
        });

        // Allow Shift+Enter for newline, Enter alone to submit.
        ui.input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ui.form.dispatchEvent(new Event('submit'));
            }
        });
    }

    async function handleSend(text, config, ui, history, errorText) {
        setLoading(ui, true);

        appendMessage(ui.messages, 'user', text);
        history.push({ role: 'user', content: text });
        ui.input.value = '';

        if (history.length > MAX_HISTORY) {
            history.splice(0, history.length - MAX_HISTORY);
        }

        try {
            const reply = await sendToProxy(config, history);
            appendMessage(ui.messages, 'assistant', reply);
            history.push({ role: 'assistant', content: reply });

            if (history.length > MAX_HISTORY) {
                history.splice(0, history.length - MAX_HISTORY);
            }
        } catch (_err) {
            appendMessage(ui.messages, 'assistant', errorText, true);
            // Remove the user message that failed so history stays consistent.
            history.pop();
        } finally {
            setLoading(ui, false);
            scrollToBottom(ui.messages);
        }
    }

    async function sendToProxy(config, messages) {
        const body = {
            sesskey:  config.sesskey,
            userId:   config.userId,
            level:    config.level,
            lang:     config.lang,
            messages: messages,
        };

        const response = await fetch(config.proxyUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return data.reply || '';
    }

    function appendMessage(container, role, text, isError) {
        const wrapper = document.createElement('div');
        wrapper.className = 'pharos-tutor__message pharos-tutor__message--' + role;

        const avatar = document.createElement('span');
        avatar.className = 'pharos-tutor__avatar';
        avatar.setAttribute('aria-hidden', 'true');

        const bubble = document.createElement('div');
        bubble.className = 'pharos-tutor__bubble' + (isError ? ' text-danger' : '');
        bubble.textContent = text;

        wrapper.appendChild(avatar);
        wrapper.appendChild(bubble);
        container.appendChild(wrapper);
        scrollToBottom(container);
    }

    function setLoading(ui, loading) {
        ui.send.disabled = loading;
        ui.input.disabled = loading;

        if (loading) {
            ui.status.classList.remove('pharos-tutor__status--hidden');
        } else {
            ui.status.classList.add('pharos-tutor__status--hidden');
        }
    }

    function scrollToBottom(container) {
        container.scrollTop = container.scrollHeight;
    }

    return { init };
});
