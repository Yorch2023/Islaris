// AMD module: mod_pharos_itinerary/itinerary-progress
// Handles the visual itinerary progress page: XP bar animation, level
// accordion, and activity completion toggling via Moodle's completion API.
define(['core/ajax', 'core/notification'], function (Ajax, Notification) {
    'use strict';

    function init(contextId) {
        const container = document.querySelector('.pharos-itinerary');
        if (!container) {
            return;
        }

        animateXpBars(container);
        wireAccordions(container);
        wireCompletionToggles(container, contextId);
    }

    // Animate all XP bars on first intersection.
    function animateXpBars(container) {
        const bars = container.querySelectorAll('.pharos-xp-bar__fill[data-target-width]');
        if (!bars.length) return;

        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                const bar = entry.target;
                // requestAnimationFrame ensures the 0% start is painted first.
                requestAnimationFrame(function () {
                    bar.style.transition = 'width 0.6s ease';
                    bar.style.width = bar.dataset.targetWidth;
                });
                observer.unobserve(bar);
            });
        }, { threshold: 0.1 });

        bars.forEach(function (bar) {
            bar.style.width = '0%';
            observer.observe(bar);
        });
    }

    // Level accordion: toggle detail panels.
    function wireAccordions(container) {
        container.addEventListener('click', function (e) {
            const trigger = e.target.closest('[data-itinerary-toggle]');
            if (!trigger) return;

            const panelId = trigger.dataset.itineraryToggle;
            const panel   = document.getElementById(panelId);
            if (!panel) return;

            const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
            trigger.setAttribute('aria-expanded', String(!isExpanded));
            panel.hidden = isExpanded;
        });
    }

    // Activity completion checkboxes: POST to Moodle's completion webservice.
    function wireCompletionToggles(container, _contextId) {
        container.addEventListener('change', function (e) {
            const checkbox = e.target.closest('input[data-cmid]');
            if (!checkbox) return;

            const cmId      = parseInt(checkbox.dataset.cmid, 10);
            const completed = checkbox.checked ? 1 : 0;

            Ajax.call([{
                methodname: 'core_completion_update_activity_completion_status_manually',
                args: { cmid: cmId, completed: completed },
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

    return { init };
});
