// AMD module: block_pharos_tutor/tutor-chat
// Handles the PHAROS-AI tutor chat UI with session tracking for evidence auto-creation.
define([], function () {
    'use strict';

    const MAX_HISTORY       = 20;
    const EVIDENCE_THRESHOLD = 5;   // User messages in one session to trigger evidence creation.
    const STREAM_SUPPORTED  = typeof ReadableStream !== 'undefined' &&
                              typeof TextDecoder    !== 'undefined';

    function init() {
        const root = document.querySelector('.pharos-tutor');
        if (!root) return;

        const config = {
            proxyUrl:       root.dataset.proxyUrl,
            streamProxyUrl: root.dataset.streamProxyUrl,
            sessionUrl:     root.dataset.sessionUrl,
            memoryUrl:      root.dataset.memoryUrl,
            courseId:       root.dataset.courseId,
            userId:         root.dataset.userId,
            level:          parseInt(root.dataset.level, 10) || 1,
            lang:           root.dataset.lang || 'es',
            sesskey:        root.dataset.sesskey,
        };

        const ui = {
            messages:      root.querySelector('#pharos-tutor-messages'),
            status:        root.querySelector('#pharos-tutor-status'),
            form:          root.querySelector('#pharos-tutor-form'),
            input:         root.querySelector('#pharos-tutor-input'),
            send:          root.querySelector('.pharos-tutor__send'),
            sessionBar:    root.querySelector('#pharos-tutor-session-progress'),
            evidenceToast: root.querySelector('#pharos-tutor-evidence-toast'),
        };

        const history = [];
        const session = {
            start:        Date.now(),
            messageCount: 0,
            saved:        false,
            memorySaved:  false,
        };

        ui.form.addEventListener('submit', function (e) {
            e.preventDefault();
            const text = ui.input.value.trim();
            if (!text) return;
            handleSend(text, config, ui, history, session);
        });

        ui.input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ui.form.dispatchEvent(new Event('submit'));
            }
        });

        // Live character count for WCAG 2.1 (SC 1.3.1).
        const charCount = root.querySelector('#pharos-tutor-char-count');
        const maxLen    = parseInt(ui.input.getAttribute('maxlength'), 10) || 4000;
        if (charCount) {
            ui.input.addEventListener('input', function () {
                const remaining = maxLen - ui.input.value.length;
                charCount.textContent = remaining + ' / ' + maxLen;
            });
        }

        // Save session and trigger memory extraction on page unload.
        window.addEventListener('beforeunload', function () {
            if (session.messageCount > 0) {
                if (!session.saved && config.sessionUrl) {
                    saveSession(config, session, ui);
                }
                if (!session.memorySaved && config.memoryUrl && history.length >= 2) {
                    saveMemory(config, history);
                }
            }
        });
    }

    async function handleSend(text, config, ui, history, session) {
        setLoading(ui, true);
        appendMessage(ui.messages, 'user', text);
        history.push({ role: 'user', content: text });
        ui.input.value = '';
        trimHistory(history);

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
            bubble.setAttribute('tabindex', '-1');
            bubble.focus();

            // Count only successful user messages.
            session.messageCount++;
            updateSessionBar(ui, session);

            // Auto-save when threshold reached (and only once per session).
            if (session.messageCount >= EVIDENCE_THRESHOLD && !session.saved) {
                await saveSession(config, session, ui);
                // Trigger memory extraction asynchronously — no need to await.
                if (!session.memorySaved && config.memoryUrl && history.length >= 2) {
                    saveMemory(config, history);
                    session.memorySaved = true;
                }
            }

        } catch (_err) {
            bubble.textContent = ui.status.dataset.errorText || 'Error de conexión.';
            bubble.classList.add('pharos-tutor__bubble--error');
            bubble.classList.remove('pharos-tutor__bubble--streaming');
            history.pop();
        } finally {
            setLoading(ui, false);
            scrollToBottom(ui.messages);
        }
    }

    async function saveSession(config, session, ui) {
        if (!config.sessionUrl || session.saved) return;
        session.saved = true; // Prevent duplicate saves.

        const duration = Math.round((Date.now() - session.start) / 1000);

        try {
            const resp = await fetch(config.sessionUrl, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sesskey:       config.sesskey,
                    courseid:      config.courseId,
                    level:         config.level,
                    message_count: session.messageCount,
                    duration:      duration,
                }),
                keepalive: true, // Ensures delivery even on beforeunload.
            });

            if (resp.ok) {
                const data = await resp.json();
                if (data.evidence_created && ui.evidenceToast) {
                    showEvidenceToast(ui, data.badge_issued);
                }
            }
        } catch (_e) {
            // Non-critical — session metadata could not be saved.
        }
    }

    // Sends the conversation to the memory extraction endpoint.
    // Fire-and-forget: failures are non-critical.
    function saveMemory(config, history) {
        if (!config.memoryUrl || !history.length) return;
        // Send at most the last 20 messages (well within keepalive size limits).
        const messages = history.slice(-20).map(function (m) {
            return { role: m.role, content: String(m.content).slice(0, 3000) };
        });
        try {
            fetch(config.memoryUrl, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sesskey:  config.sesskey,
                    courseid: config.courseId,
                    messages: messages,
                }),
                keepalive: true,
            });
        } catch (_e) {
            // Non-critical.
        }
    }

    function updateSessionBar(ui, session) {
        if (!ui.sessionBar) return;
        const pct   = Math.min(100, Math.round(session.messageCount / EVIDENCE_THRESHOLD * 100));
        const filled = Math.min(session.messageCount, EVIDENCE_THRESHOLD);
        ui.sessionBar.innerHTML =
            '<div class="pharos-session-bar" aria-hidden="true">' +
            '<div class="pharos-session-bar__fill" style="width:' + pct + '%"></div>' +
            '</div>' +
            '<small class="pharos-session-bar__label">' + filled + ' / ' + EVIDENCE_THRESHOLD + '</small>';
    }

    function showEvidenceToast(ui, badgeIssued) {
        if (!ui.evidenceToast) return;
        ui.evidenceToast.classList.remove('pharos-tutor__evidence-toast--hidden');
        if (badgeIssued) {
            ui.evidenceToast.classList.add('pharos-tutor__evidence-toast--badge');
        }
        setTimeout(function () {
            ui.evidenceToast.classList.add('pharos-tutor__evidence-toast--hidden');
        }, 6000);
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
            buffer = lines.pop();

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
            courseId: config.courseId,
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
