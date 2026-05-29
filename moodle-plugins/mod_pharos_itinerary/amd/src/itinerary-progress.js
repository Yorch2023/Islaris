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

    return {init: init};
});
