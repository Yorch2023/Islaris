/* PHAROS-AI theme — main JS (vanilla, no jQuery) */
'use strict';

(function () {
    // Load Inter from Google Fonts for better typography.
    if (!document.querySelector('link[href*="Inter"]')) {
        const pre = document.createElement('link');
        pre.rel = 'preconnect';
        pre.href = 'https://fonts.googleapis.com';
        document.head.appendChild(pre);
        const font = document.createElement('link');
        font.rel = 'stylesheet';
        font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
        document.head.appendChild(font);
    }
    // Smooth-scroll anchor links within the page.
    document.addEventListener('click', function (e) {
        const link = e.target.closest('a[href^="#"]');
        if (!link) return;
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            target.focus({ preventScroll: true });
        }
    });

    // Auto-dismiss alerts after 6 s (keep aria-live ones).
    document.querySelectorAll('.alert:not([aria-live])').forEach(function (el) {
        setTimeout(function () {
            el.style.transition = 'opacity 0.5s';
            el.style.opacity = '0';
            setTimeout(function () { el.remove(); }, 500);
        }, 6000);
    });

    // Ensure navbar brand always shows "PHAROS-AI" regardless of Moodle site name setting.
    document.querySelectorAll('.navbar-brand').forEach(function (el) {
        for (var i = 0; i < el.childNodes.length; i++) {
            var node = el.childNodes[i];
            if (node.nodeType === 3 && node.textContent.trim()) {
                node.textContent = ' PHAROS-AI';
                break;
            }
        }
    });

    // Mark external links with rel="noopener" and a screen-reader indicator.
    const isItalian = document.documentElement.lang.startsWith('it');
    const externalLinkSr = isItalian
        ? ' (si apre in una nuova scheda)'
        : ' (abre en nueva pestaña)';

    document.querySelectorAll('a[href^="http"]').forEach(function (a) {
        if (!a.hostname || a.hostname === location.hostname) return;
        a.rel = (a.rel ? a.rel + ' ' : '') + 'noopener noreferrer';
        if (!a.querySelector('.sr-only')) {
            const sr = document.createElement('span');
            sr.className = 'sr-only';
            sr.textContent = externalLinkSr;
            a.appendChild(sr);
        }
    });
})();
