// AMD module: block_pharos_onboarding/onboarding
// Drives the 3-step diagnostic wizard and animates the XP bar.
define([], function () {
    'use strict';

    function init() {
        animateXpBar();
        initWizard();
    }

    // ── XP bar ──────────────────────────────────────────────────────────────

    function animateXpBar() {
        var bar = document.querySelector('.pharos-onboarding--compact [data-xp-target]');
        if (!bar) return;
        var fill = bar.querySelector('.pharos-xp-bar__fill');
        if (!fill) return;
        requestAnimationFrame(function () {
            fill.style.transition = 'width 0.6s ease';
            fill.style.width = bar.dataset.xpTarget + '%';
        });
    }

    // ── Wizard ───────────────────────────────────────────────────────────────

    function initWizard() {
        var root = document.querySelector('.pharos-onboarding:not(.pharos-onboarding--compact)');
        if (!root) return;

        var saveUrl      = root.dataset.saveUrl;
        var sesskey      = root.dataset.sesskey;
        var itineraryUrl = root.dataset.itineraryUrl;
        if (!saveUrl) return;

        // Navigation buttons.
        root.querySelectorAll('.pharos-ob-next').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var currentStep = parseInt(btn.closest('fieldset').id.replace('pharos-ob-step-', ''), 10);
                if (!validateStep(root, currentStep)) return;
                showStep(root, parseInt(btn.dataset.next, 10));
            });
        });

        root.querySelectorAll('.pharos-ob-back').forEach(function (btn) {
            btn.addEventListener('click', function () {
                showStep(root, parseInt(btn.dataset.back, 10));
            });
        });

        // Submit.
        var form = document.getElementById('pharos-ob-form');
        if (!form) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!validateStep(root, 3)) return;

            var submitBtn = document.getElementById('pharos-ob-submit');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '…';
            }

            var payload = collectAnswers(form);
            payload.sesskey = sesskey;

            fetch(saveUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.error) {
                    showError(root, data.error);
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = getSubmitLabel(root); }
                } else {
                    showResult(root, data, itineraryUrl);
                }
            })
            .catch(function () {
                showError(root, 'Error de conexión. Inténtalo de nuevo.');
                if (submitBtn) { submitBtn.disabled = false; }
            });
        });
    }

    function showStep(root, stepNum) {
        root.querySelectorAll('.pharos-ob-panel').forEach(function (panel) {
            panel.classList.add('d-none');
        });
        var target = document.getElementById('pharos-ob-step-' + stepNum);
        if (target) {
            target.classList.remove('d-none');
            target.querySelector('select, input') && target.querySelector('select, input').focus();
        }
        // Update step dots.
        root.querySelectorAll('.pharos-ob-step').forEach(function (dot) {
            var s = parseInt(dot.dataset.step, 10);
            dot.classList.toggle('pharos-ob-step--active', s === stepNum);
            dot.classList.toggle('pharos-ob-step--done', s < stepNum);
        });
    }

    function validateStep(root, stepNum) {
        var panel = document.getElementById('pharos-ob-step-' + stepNum);
        if (!panel) return true;

        // Check required selects.
        var selects = panel.querySelectorAll('select[required]');
        for (var i = 0; i < selects.length; i++) {
            if (!selects[i].value) {
                selects[i].classList.add('is-invalid');
                selects[i].focus();
                return false;
            }
            selects[i].classList.remove('is-invalid');
        }

        // Check required radio groups.
        var radioNames = {};
        panel.querySelectorAll('input[type="radio"][required]').forEach(function (r) {
            radioNames[r.name] = true;
        });
        for (var name in radioNames) {
            if (!panel.querySelector('input[type="radio"][name="' + name + '"]:checked')) {
                var firstRadio = panel.querySelector('input[type="radio"][name="' + name + '"]');
                if (firstRadio) firstRadio.focus();
                highlightRadioGroup(panel, name);
                return false;
            }
        }

        return true;
    }

    function highlightRadioGroup(panel, name) {
        var group = panel.querySelector('input[type="radio"][name="' + name + '"]');
        if (group) {
            var container = group.closest('.pharos-ob-radio-group');
            if (container) {
                container.style.outline = '2px solid #C8102E';
                container.style.outlineOffset = '2px';
                setTimeout(function () { container.style.outline = ''; }, 2500);
            }
        }
    }

    function collectAnswers(form) {
        var fd = new FormData(form);
        return {
            employment:  fd.get('employment')  || 'professional',
            digital_exp: fd.get('digital_exp') || 'basic',
            ai_use:      fd.get('ai_use')      || 'never',
            goals:       fd.getAll('goals'),
            time_weekly: fd.get('time_weekly') || 'lt1',
        };
    }

    function showResult(root, data, itineraryUrl) {
        // Hide all wizard panels.
        root.querySelectorAll('.pharos-ob-panel').forEach(function (p) {
            p.classList.add('d-none');
        });

        // Mark all steps done.
        root.querySelectorAll('.pharos-ob-step').forEach(function (dot) {
            dot.classList.remove('pharos-ob-step--active');
            dot.classList.add('pharos-ob-step--done');
        });

        var resultDiv = document.getElementById('pharos-ob-result');
        if (!resultDiv) return;

        var levelColors = { 1: '#C8102E', 2: '#e07b00', 3: '#0D1520' };
        var color = levelColors[data.recommended_level] || '#C8102E';

        var ctaHtml = itineraryUrl
            ? '<a href="' + itineraryUrl + '" class="btn btn-danger btn-sm btn-block mt-3">' + getLabelStart(root) + '</a>'
            : '';

        resultDiv.innerHTML =
            '<div class="text-center py-2">' +
            '<p class="mb-1" style="font-size:1.5rem">🎯</p>' +
            '<p class="small mb-1">' + getLabelRecommend(root) + '</p>' +
            '<p class="h6 mb-1 font-weight-bold" style="color:' + color + '">' +
                data.level_label +
            '</p>' +
            '<p class="small text-muted mb-0">' + (data.explanation || '') + '</p>' +
            ctaHtml +
            '</div>';

        resultDiv.classList.remove('d-none');
        resultDiv.focus();
    }

    function showError(root, msg) {
        var result = document.getElementById('pharos-ob-result');
        if (!result) return;
        result.innerHTML = '<p class="text-danger small">' + msg + '</p>';
        result.classList.remove('d-none');
    }

    function getSubmitLabel(root) {
        var btn = document.getElementById('pharos-ob-submit');
        return btn ? btn.textContent : 'Finalizar';
    }

    function getLabelRecommend(root) {
        // Try to get translated string from a data attribute injected by PHP, fallback to ES.
        return root.dataset.labelRecommend || 'Tu nivel de inicio recomendado:';
    }

    function getLabelStart(root) {
        return root.dataset.labelStart || 'Comenzar mi itinerario';
    }

    return { init };
});
