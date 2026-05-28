/* PHAROS-AI theme — itinerary visual logic (vanilla JS) */
'use strict';

(function () {
    const container = document.querySelector('.pharos-itinerary');
    if (!container) return;

    // Animate XP bars on first intersection.
    const bars = container.querySelectorAll('.pharos-xp-bar__fill[data-target-width]');

    if (!bars.length) return;

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            const bar = entry.target;
            bar.style.width = bar.dataset.targetWidth;
            observer.unobserve(bar);
        });
    }, { threshold: 0.2 });

    bars.forEach(function (bar) {
        bar.style.width = '0%';
        observer.observe(bar);
    });

    // Toggle level detail panels.
    container.addEventListener('click', function (e) {
        const trigger = e.target.closest('[data-pharos-toggle]');
        if (!trigger) return;
        const targetId = trigger.dataset.pharosToggle;
        const panel    = document.getElementById(targetId);
        if (!panel) return;

        const expanded = trigger.getAttribute('aria-expanded') === 'true';
        trigger.setAttribute('aria-expanded', String(!expanded));
        panel.hidden = expanded;
    });
})();
