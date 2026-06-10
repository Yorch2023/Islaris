// AMD module: block_pharos_teacher/teacher-dashboard
// Animates XP bars, handles the AI usage detail modal, the AI Advisor chat, and the motivation generator.
define([], function () {
    'use strict';

    function init() {
        const root = document.querySelector('.pharos-teacher-dashboard');
        if (!root) return;
        animateXpBars(root);
        initAiDetailButtons(root);
        initAdvisorButtons(root);
        initMotivateButtons(root);
    }

    // ── XP bar animation ───────────────────────────────────────────────────

    function animateXpBars(root) {
        const bars = root.querySelectorAll('[data-xp-target]');
        if (!bars.length) return;
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                const container = entry.target;
                const fill = container.querySelector('.pharos-xp-bar__fill');
                if (!fill) return;
                requestAnimationFrame(function () {
                    fill.style.transition = 'width 0.5s ease';
                    fill.style.width = container.dataset.xpTarget + '%';
                });
                observer.unobserve(container);
            });
        }, { threshold: 0.1 });
        bars.forEach(function (bar) { observer.observe(bar); });
    }

    // ── AI session detail modal ────────────────────────────────────────────

    function initAiDetailButtons(root) {
        const detailUrl = root.dataset.aiDetailUrl;
        const sesskey = root.dataset.sesskey;
        if (!detailUrl) return;

        const modal = document.getElementById('pharos-ai-detail-modal');
        const modalTitle = document.getElementById('pharos-ai-detail-title');
        const modalBody = document.getElementById('pharos-ai-detail-body');
        if (!modal || !modalTitle || !modalBody) return;

        root.addEventListener('click', function (e) {
            const btn = e.target.closest('.pharos-ai-detail-btn');
            if (!btn) return;

            const studentId = btn.dataset.studentId;
            const courseId = new URLSearchParams(new URL(detailUrl).search).get('courseid');

            modalTitle.textContent = btn.dataset.studentName;
            modalBody.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-danger" role="status"><span class="sr-only">…</span></div></div>';

            showModal(modal);

            fetch(detailUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sesskey: sesskey, courseid: courseId, student_id: studentId }),
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                modalBody.innerHTML = data.error
                    ? '<p class="text-danger">' + data.error + '</p>'
                    : renderAiDetail(data);
            })
            .catch(function () {
                modalBody.innerHTML = '<p class="text-danger">Error al cargar los datos.</p>';
            });
        });

        modal.addEventListener('click', function (e) {
            if (e.target.closest('[data-dismiss="modal"]') || e.target === modal) {
                hideModal(modal);
            }
        });
    }

    function renderAiDetail(data) {
        const levelColors = { 1: '#C8102E', 2: '#e07b00', 3: '#0D1520' };
        let html = '<div class="d-flex mb-3 text-center">' +
            stat(data.total_sessions, 'Sesiones') +
            stat(data.total_messages, 'Mensajes') +
            stat(data.total_minutes + ' min', 'Tiempo') +
            '</div>';

        if (!data.sessions || !data.sessions.length) {
            return html + '<p class="text-muted small">Sin sesiones en los últimos 30 días.</p>';
        }

        html += '<p class="text-muted small mb-1">Últimas 30 días:</p>' +
            '<table class="table table-sm table-borderless mb-0"><thead><tr>' +
            '<th class="small">Fecha</th><th class="small">Nivel</th>' +
            '<th class="small text-right">Msg</th><th class="small text-right">Min</th>' +
            '</tr></thead><tbody>';

        data.sessions.forEach(function (s) {
            const c = levelColors[s.level] || '#999';
            html += '<tr>' +
                '<td class="small text-muted" style="white-space:nowrap">' + s.date + '</td>' +
                '<td><span class="badge" style="background:' + c + ';color:#fff">' + s.level_label + '</span></td>' +
                '<td class="small text-right">' + s.message_count + '</td>' +
                '<td class="small text-right">' + s.duration_min + '</td>' +
                '</tr>';
        });

        return html + '</tbody></table>';
    }

    function stat(value, label) {
        return '<div class="flex-fill text-center">' +
            '<p class="h5 mb-0 text-danger">' + value + '</p>' +
            '<small class="text-muted">' + label + '</small>' +
            '</div>';
    }

    // ── AI Advisor chat modal ──────────────────────────────────────────────

    const advisorState = {
        studentId:   null,
        studentName: null,
        courseId:    null,
        messages:    [],
        sending:     false,
    };

    function initAdvisorButtons(root) {
        const advisorUrl = root.dataset.advisorUrl;
        const sesskey    = root.dataset.sesskey;
        const lang       = root.dataset.advisorLang || 'es';
        if (!advisorUrl) return;

        const modal    = document.getElementById('pharos-advisor-modal');
        const subtitle = modal && modal.querySelector('.pharos-advisor-subtitle');
        const msgBox   = document.getElementById('pharos-advisor-messages');
        const input    = document.getElementById('pharos-advisor-input');
        const sendBtn  = document.getElementById('pharos-advisor-send');
        if (!modal || !msgBox || !input || !sendBtn) return;

        const courseId = new URLSearchParams(new URL(advisorUrl).search).get('courseid');

        root.addEventListener('click', function (e) {
            const btn = e.target.closest('.pharos-advisor-btn');
            if (!btn) return;

            advisorState.studentId   = btn.dataset.studentId;
            advisorState.studentName = btn.dataset.studentName;
            advisorState.courseId    = courseId;
            advisorState.messages    = [];

            if (subtitle) {
                subtitle.textContent = advisorState.studentName;
            }
            msgBox.innerHTML = '';
            input.value = '';

            showModal(modal);
            input.focus();
        });

        sendBtn.addEventListener('click', function () {
            sendAdvisorMessage(advisorUrl, sesskey, lang, msgBox, input, sendBtn);
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendAdvisorMessage(advisorUrl, sesskey, lang, msgBox, input, sendBtn);
            }
        });

        modal.addEventListener('click', function (e) {
            if (e.target.closest('[data-dismiss="modal"]') || e.target === modal) {
                hideModal(modal);
            }
        });
    }

    function sendAdvisorMessage(advisorUrl, sesskey, lang, msgBox, input, sendBtn) {
        if (advisorState.sending) return;
        const text = input.value.trim();
        if (!text) return;

        advisorState.messages.push({ role: 'user', content: text });
        appendMessage(msgBox, 'user', text);
        input.value = '';
        advisorState.sending = true;
        sendBtn.disabled = true;

        const typingId = appendTyping(msgBox);

        fetch(advisorUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sesskey:    sesskey,
                courseid:   advisorState.courseId,
                student_id: advisorState.studentId,
                lang:       lang,
                messages:   advisorState.messages,
            }),
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            removeTyping(msgBox, typingId);
            if (data.error) {
                appendMessage(msgBox, 'error', data.error);
            } else {
                advisorState.messages.push({ role: 'assistant', content: data.reply });
                appendMessage(msgBox, 'assistant', data.reply);
            }
        })
        .catch(function () {
            removeTyping(msgBox, typingId);
            appendMessage(msgBox, 'error', 'Error de conexión. Inténtalo de nuevo.');
        })
        .finally(function () {
            advisorState.sending = false;
            sendBtn.disabled = false;
            input.focus();
        });
    }

    function appendMessage(msgBox, role, text) {
        const div = document.createElement('div');
        div.className = 'pharos-advisor-msg pharos-advisor-msg--' + role;
        div.textContent = text;
        msgBox.appendChild(div);
        msgBox.scrollTop = msgBox.scrollHeight;
    }

    function appendTyping(msgBox) {
        const id = 'pharos-typing-' + Date.now();
        const div = document.createElement('div');
        div.id = id;
        div.className = 'pharos-advisor-msg pharos-advisor-msg--typing';
        div.setAttribute('aria-label', 'Escribiendo…');
        div.innerHTML = '<span></span><span></span><span></span>';
        msgBox.appendChild(div);
        msgBox.scrollTop = msgBox.scrollHeight;
        return id;
    }

    function removeTyping(msgBox, id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // ── Motivation message generator ──────────────────────────────────────

    function initMotivateButtons(root) {
        const motivateUrl = root.dataset.motivateUrl;
        const sesskey     = root.dataset.sesskey;
        const lang        = root.dataset.advisorLang || 'es';
        if (!motivateUrl) return;

        const modal    = document.getElementById('pharos-motivate-modal');
        const subtitle = modal && modal.querySelector('.pharos-motivate-subtitle');
        const loading  = document.getElementById('pharos-motivate-loading');
        const result   = document.getElementById('pharos-motivate-result');
        const message  = document.getElementById('pharos-motivate-message');
        const copyBtn  = document.getElementById('pharos-motivate-copy');
        const sendLink = document.getElementById('pharos-motivate-send-link');
        const errorBox = document.getElementById('pharos-motivate-error');
        if (!modal || !loading || !result || !message || !copyBtn || !sendLink || !errorBox) return;

        const courseId = new URLSearchParams(new URL(motivateUrl).search).get('courseid');

        root.addEventListener('click', function (e) {
            const btn = e.target.closest('.pharos-motivate-btn');
            if (!btn) return;

            const studentId  = btn.dataset.studentId;
            const studentName = btn.dataset.studentName;
            const messageUrl  = btn.dataset.messageUrl;

            if (subtitle) subtitle.textContent = studentName;
            loading.classList.remove('d-none');
            result.classList.add('d-none');
            errorBox.classList.add('d-none');
            message.textContent = '';

            showModal(modal);

            fetch(motivateUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sesskey:    sesskey,
                    courseid:   parseInt(courseId, 10),
                    student_id: parseInt(studentId, 10),
                    lang:       lang,
                }),
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                loading.classList.add('d-none');
                if (data.error) {
                    errorBox.textContent = data.error;
                    errorBox.classList.remove('d-none');
                } else {
                    message.textContent = data.message;
                    sendLink.href = data.message_url || messageUrl;
                    result.classList.remove('d-none');
                }
            })
            .catch(function () {
                loading.classList.add('d-none');
                errorBox.textContent = 'Error de conexión. Inténtalo de nuevo.';
                errorBox.classList.remove('d-none');
            });
        });

        copyBtn.addEventListener('click', function () {
            const text = message.textContent;
            if (!text) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () {
                    copyBtn.textContent = '✓';
                    setTimeout(function () { copyBtn.textContent = copyBtn.dataset.label || 'Copiar'; }, 2000);
                });
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                copyBtn.textContent = '✓';
                setTimeout(function () { copyBtn.textContent = copyBtn.dataset.label || 'Copiar'; }, 2000);
            }
        });

        modal.addEventListener('click', function (e) {
            if (e.target.closest('[data-dismiss="modal"]') || e.target === modal) {
                hideModal(modal);
            }
        });
    }

    // ── Modal helpers ──────────────────────────────────────────────────────

    function showModal(modal) {
        if (typeof $ !== 'undefined') {
            $(modal).modal('show');
        } else {
            modal.classList.add('show');
            modal.style.display = 'block';
            document.body.classList.add('modal-open');
        }
    }

    function hideModal(modal) {
        if (typeof $ !== 'undefined') {
            $(modal).modal('hide');
        } else {
            modal.classList.remove('show');
            modal.style.display = '';
            document.body.classList.remove('modal-open');
        }
    }

    return { init };
});
