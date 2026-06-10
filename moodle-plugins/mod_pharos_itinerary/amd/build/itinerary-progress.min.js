// AMD module: mod_pharos_itinerary/itinerary-progress
// Handles the visual itinerary progress page: XP bar animation, level
// accordion, activity completion toggling, and the AI recommendation widget.
define(['core/ajax', 'core/notification'], function (Ajax, Notification) {
    'use strict';

    function init(contextId, cmid, lang) {
        const container = document.querySelector('.pharos-itinerary');
        if (!container) {
            return;
        }

        animateXpBars(container);
        wireAccordions(container);
        wireCompletionToggles(container, contextId);
        loadRecommendation(cmid, lang);
        initReflectModal(container);
    }

    // Animate all XP bars on first intersection.
    function animateXpBars(container) {
        const bars = container.querySelectorAll('.pharos-xp-bar__fill[data-target-width]');
        if (!bars.length) {
            return;
        }

        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) {
                    return;
                }
                const bar = entry.target;
                // requestAnimationFrame ensures the 0% start is painted first.
                requestAnimationFrame(function () {
                    bar.style.transition = 'width 0.6s ease';
                    bar.style.width = bar.dataset.targetWidth;
                });
                observer.unobserve(bar);
            });
        }, {threshold: 0.1});

        bars.forEach(function (bar) {
            bar.style.width = '0%';
            observer.observe(bar);
        });
    }

    // Level accordion: toggle detail panels.
    function wireAccordions(container) {
        container.addEventListener('click', function (e) {
            const trigger = e.target.closest('[data-itinerary-toggle]');
            if (!trigger) {
                return;
            }

            const panelId = trigger.dataset.itineraryToggle;
            const panel   = document.getElementById(panelId);
            if (!panel) {
                return;
            }

            const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
            trigger.setAttribute('aria-expanded', String(!isExpanded));
            panel.hidden = isExpanded;
        });
    }

    // Activity completion checkboxes: POST to Moodle's completion webservice.
    function wireCompletionToggles(container, _contextId) {
        container.addEventListener('change', function (e) {
            const checkbox = e.target.closest('input[data-cmid]');
            if (!checkbox) {
                return;
            }

            const cmId      = parseInt(checkbox.dataset.cmid, 10);
            const completed = checkbox.checked ? 1 : 0;

            Ajax.call([{
                methodname: 'core_completion_update_activity_completion_status_manually',
                args: {cmid: cmId, completed: completed},
            }])[0].then(function () {
                const label = checkbox.closest('.pharos-activity-item');
                if (label) {
                    label.classList.toggle('pharos-activity-item--done', checkbox.checked);
                }
                return null;
            }).catch(function (err) {
                Notification.exception(err);
                checkbox.checked = !checkbox.checked; // revert on failure
            });
        });
    }

    // Fetch an AI recommendation from the server and render it.
    function loadRecommendation(cmid, lang) {
        const widget = document.getElementById('pharos-recommend-widget');
        if (!widget || !cmid) {
            return;
        }

        const url = M.cfg.wwwroot + '/blocks/pharos_tutor/ajax-recommend.php';

        fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                sesskey: M.cfg.sesskey,
                cmid: cmid,
                lang: lang || 'es',
            }),
        })
        .then(function (resp) {
            if (!resp.ok) {
                return null;
            }
            return resp.json();
        })
        .then(function (data) {
            if (!data || !data.message) {
                return;
            }
            renderRecommendation(widget, data);
        })
        .catch(function () {
            // Recommendation is optional — fail silently.
        });
    }

    function renderRecommendation(widget, data) {
        const card = document.createElement('div');
        card.className = 'card border-primary pharos-recommend-card';

        const body = document.createElement('div');
        body.className = 'card-body';

        const heading = document.createElement('h3');
        heading.className = 'h6 card-title text-primary';
        heading.textContent = '✨ ' + (widget.getAttribute('aria-label') || 'Recomendación');

        const message = document.createElement('p');
        message.className = 'card-text small mb-2';
        message.textContent = data.message;

        body.appendChild(heading);
        body.appendChild(message);

        if (data.next_level_hint) {
            const hint = document.createElement('p');
            hint.className = 'card-text small text-muted mb-2';
            hint.textContent = '→ ' + data.next_level_hint;
            body.appendChild(hint);
        }

        if (Array.isArray(data.suggested_activities) && data.suggested_activities.length > 0) {
            const list = document.createElement('ul');
            list.className = 'list-unstyled mb-0';
            data.suggested_activities.forEach(function (act) {
                const item = document.createElement('li');
                item.className = 'small mb-1';
                item.textContent = '• ' + act.title;
                if (act.estimated_minutes) {
                    const minutes = document.createElement('span');
                    minutes.className = 'text-muted ml-1';
                    minutes.textContent = '(' + act.estimated_minutes + ' min)';
                    item.appendChild(minutes);
                }
                list.appendChild(item);
            });
            body.appendChild(list);
        }

        card.appendChild(body);
        widget.innerHTML = '';
        widget.appendChild(card);
    }

    // ── Reflection modal ─────────────────────────────────────────────────────

    function initReflectModal(container) {
        const reflectUrl = container.dataset.reflectUrl;
        const sesskey    = container.dataset.sesskey;
        const courseid   = new URLSearchParams(new URL(reflectUrl || location.href).search).get('courseid')
                           || container.dataset.cmid;
        const lang       = container.dataset.lang || 'es';
        if (!reflectUrl) return;

        const modal      = document.getElementById('pharos-reflect-modal');
        const actLabel   = modal && modal.querySelector('.pharos-reflect-activity-label');
        const inputSec   = document.getElementById('pharos-reflect-input-section');
        const textarea   = document.getElementById('pharos-reflect-textarea');
        const counter    = document.getElementById('pharos-reflect-counter');
        const submitBtn  = document.getElementById('pharos-reflect-submit');
        const loading    = document.getElementById('pharos-reflect-loading');
        const resultSec  = document.getElementById('pharos-reflect-result');
        const feedbackEl = document.getElementById('pharos-reflect-feedback');
        const xpMsg      = document.getElementById('pharos-reflect-xp-msg');
        const evidenceMsg= document.getElementById('pharos-reflect-evidence-msg');
        const errorEl    = document.getElementById('pharos-reflect-error');
        if (!modal || !textarea || !submitBtn || !loading || !resultSec) return;

        var currentActivityName = '';
        var currentLevel = 1;

        // Character counter.
        textarea.addEventListener('input', function () {
            const len = textarea.value.length;
            if (counter) counter.textContent = len + ' / 1000';
        });

        // Open modal when a reflect button is clicked.
        container.addEventListener('click', function (e) {
            const btn = e.target.closest('.pharos-reflect-btn');
            if (!btn) return;

            currentActivityName = btn.dataset.activityName || '';
            currentLevel        = parseInt(btn.dataset.level, 10) || 1;

            if (actLabel) actLabel.textContent = currentActivityName;
            textarea.value = '';
            if (counter) counter.textContent = '0 / 1000';
            inputSec.classList.remove('d-none');
            loading.classList.add('d-none');
            resultSec.classList.add('d-none');
            errorEl.classList.add('d-none');

            showModal(modal);
            setTimeout(function () { textarea.focus(); }, 200);
        });

        // Submit reflection.
        submitBtn.addEventListener('click', function () {
            submitReflection();
        });

        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                submitReflection();
            }
        });

        modal.addEventListener('click', function (e) {
            if (e.target.closest('[data-dismiss="modal"]') || e.target === modal) {
                hideModal(modal);
            }
        });

        function submitReflection() {
            const text = textarea.value.trim();
            if (text.length < 50) {
                errorEl.textContent = lang === 'it'
                    ? 'La riflessione deve essere di almeno 50 caratteri.'
                    : 'La reflexión debe tener al menos 50 caracteres.';
                errorEl.classList.remove('d-none');
                return;
            }
            errorEl.classList.add('d-none');
            inputSec.classList.add('d-none');
            loading.classList.remove('d-none');

            fetch(reflectUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sesskey:       sesskey,
                    courseid:      parseInt(courseid, 10),
                    level:         currentLevel,
                    activity_name: currentActivityName,
                    reflection:    text,
                    lang:          lang,
                }),
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                loading.classList.add('d-none');

                if (data.error) {
                    errorEl.textContent = data.error;
                    errorEl.classList.remove('d-none');
                    inputSec.classList.remove('d-none');
                    return;
                }

                feedbackEl.textContent = data.feedback || '';
                feedbackEl.className = 'alert mb-3 ' + (data.valid ? 'alert-success' : 'alert-warning');

                if (data.xp_gained && data.xp_gained > 0) {
                    xpMsg.textContent = '+ ' + data.xp_gained + ' XP';
                    xpMsg.classList.remove('d-none');
                } else {
                    xpMsg.classList.add('d-none');
                }

                if (data.evidence_count !== undefined) {
                    const threshold = data.threshold || 3;
                    const countText = lang === 'it'
                        ? 'Prove registrate: ' + data.evidence_count + ' / ' + threshold
                        : 'Evidencias registradas: ' + data.evidence_count + ' / ' + threshold;
                    evidenceMsg.textContent = countText;
                }

                resultSec.classList.remove('d-none');
            })
            .catch(function () {
                loading.classList.add('d-none');
                inputSec.classList.remove('d-none');
                errorEl.textContent = lang === 'it'
                    ? 'Errore di connessione. Riprova.'
                    : 'Error de conexión. Inténtalo de nuevo.';
                errorEl.classList.remove('d-none');
            });
        }
    }

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

    return {init: init};
});
