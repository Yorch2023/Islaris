// AMD module: block_pharos_teacher/activity-generator
// Handles the PHAROS-AI activity generator form: submit, display result, export.
define([], function () {
    'use strict';

    let _config = {};

    function init(config) {
        _config = config;

        const form    = document.getElementById('pharos-generator-form');
        const result  = document.getElementById('pharos-generator-result');
        const btnHtml = document.getElementById('pharos-export-html');
        const btnDocx = document.getElementById('pharos-export-docx');

        if (!form || !result) {
            return;
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            handleGenerate(form, result, btnHtml, btnDocx);
        });

        if (btnHtml) {
            btnHtml.addEventListener('click', function () {
                handleExport('html');
            });
        }

        if (btnDocx) {
            btnDocx.addEventListener('click', function () {
                handleExport('docx');
            });
        }
    }

    function handleGenerate(form, result, btnHtml, btnDocx) {
        const submitBtn = form.querySelector('[type="submit"]');
        const status    = document.getElementById('pharos-generator-status');
        const output    = document.getElementById('pharos-generator-output');
        const actions   = document.getElementById('pharos-generator-actions');

        setGenerating(true, submitBtn, status);
        result.hidden = true;
        if (actions) actions.hidden = true;

        const data = {
            sesskey:   _config.sesskey,
            courseid:  _config.courseId,
            level:     parseInt(form.querySelector('[name="level"]').value, 10),
            topic:     form.querySelector('[name="topic"]').value.trim(),
            objective: (form.querySelector('[name="objective"]') || {}).value || '',
            lang:      form.querySelector('[name="lang"]').value,
        };

        fetch(_config.ajaxUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(data),
        })
        .then(function (res) {
            if (!res.ok) {
                return res.json().then(function (body) {
                    throw new Error(body.error || 'HTTP ' + res.status);
                });
            }
            return res.json();
        })
        .then(function (body) {
            if (body.error) throw new Error(body.error);
            if (!body.activity) throw new Error('Empty response from server');

            // Store for export use.
            result.dataset.activity = body.activity;
            result.dataset.lang     = data.lang;

            if (output) {
                output.textContent = body.activity;
            }
            result.hidden = false;
            if (actions) actions.hidden = false;
            if (btnHtml) btnHtml.disabled = false;
            if (btnDocx) btnDocx.disabled = false;

            // Scroll to result.
            result.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Announce to screen readers.
            const liveRegion = document.getElementById('pharos-generator-live');
            if (liveRegion) {
                liveRegion.textContent = result.querySelector('[data-label="generated"]') ?
                    result.querySelector('[data-label="generated"]').textContent : 'Actividad generada.';
            }
        })
        .catch(function (err) {
            showError(err.message || 'Error al generar la actividad.');
        })
        .finally(function () {
            setGenerating(false, submitBtn, status);
        });
    }

    function handleExport(format) {
        const result   = document.getElementById('pharos-generator-result');
        const activity = result ? result.dataset.activity : '';
        const lang     = result ? (result.dataset.lang || 'es') : 'es';

        if (!activity) return;

        const data = {
            sesskey:  _config.sesskey,
            courseid: _config.courseId,
            activity: activity,
            format:   format,
            lang:     lang,
        };

        // Trigger download via a temporary anchor after fetching the blob.
        fetch(_config.exportUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(data),
        })
        .then(function (res) {
            if (!res.ok) throw new Error('Export failed: HTTP ' + res.status);
            const disposition = res.headers.get('content-disposition') || '';
            const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            const filename = match ? match[1].replace(/['"]/g, '') : ('pharos-activity.' + format);
            return res.blob().then(function (blob) {
                return { blob: blob, filename: filename };
            });
        })
        .then(function (result) {
            const url = URL.createObjectURL(result.blob);
            const a   = document.createElement('a');
            a.href     = url;
            a.download = result.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        })
        .catch(function (err) {
            showError(err.message || 'Error al exportar la actividad.');
        });
    }

    function setGenerating(loading, submitBtn, status) {
        if (submitBtn) submitBtn.disabled = loading;
        if (status) status.hidden = !loading;
    }

    function showError(message) {
        const errorEl = document.getElementById('pharos-generator-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.hidden = false;
        }
    }

    return { init: init };
});
