// AMD module: block_pharos_teacher/teacher-dashboard
// Animates mini XP bars in the teacher dashboard block on first paint.
define([], function () {
    'use strict';

    function init() {
        const root = document.querySelector('.pharos-teacher-dashboard');
        if (!root) return;

        animateXpBars(root);
    }

    function animateXpBars(root) {
        const bars = root.querySelectorAll('[data-xp-target]');
        if (!bars.length) return;

        // IntersectionObserver: animate only when the block scrolls into view.
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                const container = entry.target;
                const fill      = container.querySelector('.pharos-xp-bar__fill');
                if (!fill) return;

                requestAnimationFrame(function () {
                    fill.style.transition = 'width 0.5s ease';
                    fill.style.width      = container.dataset.xpTarget + '%';
                });
                observer.unobserve(container);
            });
        }, { threshold: 0.1 });

        bars.forEach(function (bar) { observer.observe(bar); });
    }

    return { init };
});
