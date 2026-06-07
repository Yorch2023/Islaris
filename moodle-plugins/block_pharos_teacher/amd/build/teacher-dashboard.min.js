// AMD module: block_pharos_teacher/teacher-dashboard
// Animates XP bars and handles the AI usage detail modal.
define([], function () {
    'use strict';

    function init() {
        const root = document.querySelector('.pharos-teacher-dashboard');
        if (!root) return;
        animateXpBars(root);
        initAiDetailButtons(root);
    }

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

            if (typeof $ !== 'undefined') {
                $(modal).modal('show');
            } else {
                modal.classList.add('show');
                modal.style.display = 'block';
                document.body.classList.add('modal-open');
            }

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
                if (typeof $ !== 'undefined') {
                    $(modal).modal('hide');
                } else {
                    modal.classList.remove('show');
                    modal.style.display = '';
                    document.body.classList.remove('modal-open');
                }
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

    return { init };
});
