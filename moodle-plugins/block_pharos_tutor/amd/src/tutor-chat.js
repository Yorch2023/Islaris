// AMD module: block_pharos_tutor/tutor-chat
// Handles the PHAROS-AI tutor chat UI with SSE streaming support.
// Falls back to non-streaming if the browser does not support ReadableStream.
define([], function () {
    'use strict';

    const MAX_HISTORY = 20;
    const STREAM_SUPPORTED = typeof ReadableStream !== 'undefined' &&
                             typeof TextDecoder    !== 'undefined';

    function init() {
        const root = document.querySelector('.pharos-tutor');
        if (!root) return;

        const config = {
            proxyUrl:       root.dataset.proxyUrl,
            streamProxyUrl: root.dataset.streamProxyUrl,
            userId:         root.dataset.userId,
            level:          parseInt(root.dataset.level, 10) || 1,
            lang:           root.dataset.lang || 'es',
            sesskey:        root.dataset.sesskey,
        };

        const ui = {
            messages: root.querySelector('#pharos-tutor-messages'),
            status:   root.querySelector('#pharos-tutor-status'),
            form:     root.querySelector('#pharos-tutor-form'),
            input:    root.querySelector('#pharos-tutor-input'),
            send:     root.querySelector('.pharos-tutor__send'),
        };

        const history = [];

        ui.form.addEventListener('submit', function (e) {
            e.preventDefault();
            const text = ui.input.value.trim();
            if (!text) return;
            handleSend(text, config, ui, history);
        });

        ui.input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ui.form.dispatchEvent(new Event('submit'));
            }
        });
    }

    async function handleSend(text, config, ui, history) {
        setLoading(ui, true);
        appendMessage(ui.messages, 'user', text);
        history.push({ role: 'user', content: text });
        ui.input.value = '';
        trimHistory(history);

        // Create an empty assistant bubble that will be filled progressively.
        const bubble = appendMessage(ui.messages, 'assistant', '');
        bubble.classList.add('pharos-tutor__bubble--streaming');

        try {
            if (STREAM_SUPPORTED && config.streamProxyUrl) {
                await streamReply(config, history, bubble, ui);
            } else {
                const reply = await fetchReply(config, history);
                bubble.textContent = reply;
            }

            const finalText = bubble.textContent;
            history.push({ role: 'assistant', content: finalText });
            trimHistory(history);
            bubble.classList.remove('pharos-tutor__bubble--streaming');

        } catch (_err) {
            bubble.textContent = ui.status.dataset.errorText || 'Error de conexión.';
            bubble.classList.add('pharos-tutor__bubble--error');
            bubble.classList.remove('pharos-tutor__bubble--streaming');
            history.pop(); // Remove the failed user message.
        } finally {
            setLoading(ui, false);
            scrollToBottom(ui.messages);
        }
    }

    // Streaming path: reads SSE chunks and fills the bubble progressively.
    async function streamReply(config, messages, bubble, ui) {
        const body = buildBody(config, messages);

        const response = await fetch(config.streamProxyUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });

        if (!response.ok) throw new Error('HTTP ' + response.status);
        if (!response.body)  throw new Error('No readable stream');

        const reader  = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete last line.

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const raw = line.slice(6).trim();
                if (raw === '[DONE]') return;

                let parsed;
                try { parsed = JSON.parse(raw); } catch { continue; }

                if (parsed.error) throw new Error(parsed.error);
                if (parsed.delta) {
                    bubble.textContent += parsed.delta;
                    scrollToBottom(ui.messages);
                }
            }
        }
    }

    // Non-streaming fallback.
    async function fetchReply(config, messages) {
        const response = await fetch(config.proxyUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(buildBody(config, messages)),
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data.reply || '';
    }

    function buildBody(config, messages) {
        return {
            sesskey:  config.sesskey,
            userId:   config.userId,
            level:    config.level,
            lang:     config.lang,
            messages: messages,
        };
    }

    function appendMessage(container, role, text) {
        const wrapper = document.createElement('div');
        wrapper.className = 'pharos-tutor__message pharos-tutor__message--' + role;

        const avatar = document.createElement('span');
        avatar.className = 'pharos-tutor__avatar';
        avatar.setAttribute('aria-hidden', 'true');

        const bubble = document.createElement('div');
        bubble.className = 'pharos-tutor__bubble';
        bubble.textContent = text;

        wrapper.appendChild(avatar);
        wrapper.appendChild(bubble);
        container.appendChild(wrapper);
        scrollToBottom(container);
        return bubble;
    }

    function setLoading(ui, loading) {
        ui.send.disabled  = loading;
        ui.input.disabled = loading;
        ui.status.classList.toggle('pharos-tutor__status--hidden', !loading);
    }

    function scrollToBottom(container) {
        container.scrollTop = container.scrollHeight;
    }

    function trimHistory(history) {
        if (history.length > MAX_HISTORY) {
            history.splice(0, history.length - MAX_HISTORY);
        }
    }

    return { init };
});
