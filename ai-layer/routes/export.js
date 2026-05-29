'use strict';

const express = require('express');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = require('docx');

const { validateMoodleToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/generator/export
 *
 * Converts a generated activity string to a downloadable file.
 *
 * Body:
 *   userId   {string}  Moodle user ID (used by validateMoodleToken)
 *   activity {string}  The activity text from /api/generator/activity
 *   format   {string}  'docx' | 'html'
 *   lang     {string}  'es' | 'it'  (used for document locale metadata)
 *
 * Returns:
 *   docx → application/vnd.openxmlformats-officedocument.wordprocessingml.document
 *   html → text/html; charset=utf-8
 */
router.post('/export', validateMoodleToken, async (req, res, next) => {
    try {
        const { userId, activity, format, lang } = req.body;

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ error: 'userId is required' });
        }
        if (!activity || typeof activity !== 'string' || activity.trim().length === 0) {
            return res.status(400).json({ error: 'activity is required' });
        }
        if (!['docx', 'html'].includes(format)) {
            return res.status(400).json({ error: 'format must be "docx" or "html"' });
        }
        if (!['es', 'it'].includes(lang)) {
            return res.status(400).json({ error: 'lang must be "es" or "it"' });
        }

        const sections = parseActivity(activity);
        const filename = `actividad-pharos-${Date.now()}`;

        if (format === 'html') {
            const html = renderHtml(sections, lang);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.html"`);
            return res.send(html);
        }

        // DOCX
        const buffer = await buildDocx(sections, lang);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.docx"`);
        res.send(buffer);

    } catch (err) {
        next(err);
    }
});

// ---- Parsers ----------------------------------------------------------------

const FIELD_RE = /^\*\*([^*]+)\*\*\s*[:：]\s*(.*)$/;

/**
 * Parse the structured markdown from the generator into labelled sections.
 * Returns [ { label: string, body: string[] } ]
 */
function parseActivity(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const sections = [];
    let current = null;

    for (const raw of lines) {
        const line = raw.trimEnd();
        if (line === '---') continue;

        const match = line.match(FIELD_RE);
        if (match) {
            if (current) sections.push(current);
            current = { label: match[1].trim(), body: match[2] ? [match[2].trim()] : [] };
        } else if (current) {
            if (line.trim()) current.body.push(line.trim());
        }
    }
    if (current) sections.push(current);
    return sections;
}

// ---- HTML renderer ----------------------------------------------------------

function renderHtml(sections, lang) {
    const title = sections.find(s => s.label.toLowerCase().includes('tít') || s.label.toLowerCase().includes('titol'))
        ?.body[0] ?? 'Actividad PHAROS-AI';

    const rows = sections.map(s =>
        `<tr>
            <th scope="row">${escHtml(s.label)}</th>
            <td>${s.body.map(l => escHtml(l)).join('<br>')}</td>
        </tr>`
    ).join('\n');

    return `<!DOCTYPE html>
<html lang="${escHtml(lang)}">
<head>
<meta charset="UTF-8">
<title>${escHtml(title)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 780px; margin: 2rem auto; color: #1a1a1a; }
  h1   { font-size: 1.4rem; color: #0D1520; border-bottom: 2px solid #C8102E; padding-bottom: .4rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
  th   { width: 30%; text-align: left; vertical-align: top; padding: .5rem .75rem; background: #f5f5f5;
          border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: .9rem; }
  td   { padding: .5rem .75rem; border: 1px solid #ddd; line-height: 1.6; }
  .footer { margin-top: 2rem; font-size: .8rem; color: #888; text-align: center; }
  @media print {
    body { margin: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<h1>${escHtml(title)}</h1>
<p class="no-print" style="font-size:.85rem; color:#555">
  <button onclick="window.print()">🖨 Imprimir / Guardar como PDF</button>
</p>
<table>
  <tbody>${rows}</tbody>
</table>
<div class="footer">PHAROS-AI · Erasmus+ · ${new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : 'it-IT')}</div>
</body>
</html>`;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- DOCX renderer ----------------------------------------------------------

async function buildDocx(sections, lang) {
    const locale = lang === 'es' ? 'es-ES' : 'it-IT';

    const children = [];

    for (const section of sections) {
        // Section heading
        children.push(
            new Paragraph({
                text: section.label,
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 80 },
            })
        );

        // Body lines — numbered list items keep their numbers; bullets keep dashes
        for (const line of section.body) {
            const isListItem = /^[\d]+\.\s/.test(line) || /^[-•]\s/.test(line);
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: line,
                            size: 24, // 12pt
                        }),
                    ],
                    indent: isListItem ? { left: 360 } : undefined,
                    spacing: { after: 60 },
                })
            );
        }
    }

    // Header / footer branding
    const titleSection = sections.find(s => /tít|titol/i.test(s.label));
    const docTitle = titleSection?.body[0] ?? 'Actividad PHAROS-AI';

    const doc = new Document({
        creator: 'PHAROS-AI · Erasmus+',
        title: docTitle,
        description: 'Actividad pedagógica generada por PHAROS-AI',
        styles: {
            default: {
                document: {
                    run: { font: 'Calibri', size: 24, color: '1A1A1A' },
                },
            },
        },
        sections: [
            {
                children: [
                    // Document title
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: docTitle,
                                bold: true,
                                size: 32,
                                color: '0D1520',
                            }),
                        ],
                        heading: HeadingLevel.TITLE,
                        spacing: { after: 400 },
                        border: {
                            bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C8102E', space: 4 },
                        },
                    }),
                    ...children,
                    // Footer note
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: `PHAROS-AI · Erasmus+ · ${new Date().toLocaleDateString(locale)}`,
                                size: 18,
                                color: '888888',
                                italics: true,
                            }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 600 },
                    }),
                ],
            },
        ],
    });

    return Packer.toBuffer(doc);
}

module.exports = router;
