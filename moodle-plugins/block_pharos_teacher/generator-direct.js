/* PHAROS-AI Activity Generator — vanilla JS, no AMD dependency */
(function () {
    'use strict';

    var config = window.PHAROS_GENERATOR_CONFIG || {};

    function init() {
        var form     = document.getElementById('pharos-generator-form');
        var result   = document.getElementById('pharos-generator-result');
        var output   = document.getElementById('pharos-generator-output');
        var status   = document.getElementById('pharos-generator-status');
        var errorEl  = document.getElementById('pharos-generator-error');
        var actions  = document.getElementById('pharos-generator-actions');
        var btnHtml  = document.getElementById('pharos-export-html');
        var btnDocx  = document.getElementById('pharos-export-docx');

        if (!form || !result) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            errorEl.hidden = true;
            result.hidden  = true;
            if (actions) actions.hidden = true;
            var submitBtn = form.querySelector('[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;
            if (status)   status.hidden = false;

            var data = {
                sesskey:   config.sesskey,
                courseid:  config.courseId,
                level:     parseInt(form.querySelector('[name="level"]').value, 10),
                topic:     form.querySelector('[name="topic"]').value.trim(),
                objective: (form.querySelector('[name="objective"]') || {}).value || '',
                lang:      form.querySelector('[name="lang"]').value
            };

            fetch(config.ajaxUrl, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(data)
            })
            .then(function (res) {
                return res.json().then(function (body) {
                    if (!res.ok || body.error) throw new Error(body.error || 'Error HTTP ' + res.status);
                    return body;
                });
            })
            .then(function (body) {
                if (!body.activity) throw new Error('Respuesta vacía del servidor');
                result.dataset.activity = body.activity;
                result.dataset.lang     = data.lang;
                if (output) output.textContent = body.activity;
                result.hidden = false;
                if (actions) actions.hidden = false;
                if (btnHtml) btnHtml.disabled = false;
                if (btnDocx) btnDocx.disabled = false;
                result.scrollIntoView({ behavior: 'smooth', block: 'start' });
            })
            .catch(function (err) {
                errorEl.textContent = err.message || 'Error al generar la actividad.';
                errorEl.hidden = false;
            })
            .finally(function () {
                if (submitBtn) submitBtn.disabled = false;
                if (status)   status.hidden = true;
            });
        });

        if (btnHtml) btnHtml.addEventListener('click', function () { handleExport('html'); });
        if (btnDocx) btnDocx.addEventListener('click', function () { handleExport('docx'); });

        function handleExport(format) {
            var activity = result ? result.dataset.activity : '';
            var lang     = result ? (result.dataset.lang || 'es') : 'es';
            if (!activity) return;
            fetch(config.exportUrl, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ sesskey: config.sesskey, courseid: config.courseId, activity: activity, format: format, lang: lang })
            })
            .then(function (res) {
                if (!res.ok) throw new Error('Export failed');
                var disposition = res.headers.get('content-disposition') || '';
                var match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                var filename = match ? match[1].replace(/['"]/g, '') : ('pharos-activity.' + format);
                return res.blob().then(function (blob) { return { blob: blob, filename: filename }; });
            })
            .then(function (r) {
                var url = URL.createObjectURL(r.blob);
                var a = document.createElement('a');
                a.href = url; a.download = r.filename;
                document.body.appendChild(a); a.click();
                document.body.removeChild(a); URL.revokeObjectURL(url);
            })
            .catch(function (err) {
                errorEl.textContent = err.message || 'Error al exportar.';
                errorEl.hidden = false;
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
