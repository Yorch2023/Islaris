'use strict';

const request = require('supertest');
const app = require('../ai-layer/server');

jest.mock('../ai-layer/middleware/auth', () => ({
    validateMoodleToken: (_req, _res, next) => next(),
}));

// Mock docx so tests don't build real Word documents.
jest.mock('docx', () => {
    const noop = function () {};
    noop.prototype = {};
    return {
        Document: noop,
        Packer: { toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-docx')) },
        Paragraph: noop,
        TextRun: noop,
        HeadingLevel: { TITLE: 0, HEADING_1: 1, HEADING_2: 2 },
        AlignmentType: { CENTER: 'center' },
        BorderStyle: { SINGLE: 'single' },
    };
});

const SAMPLE_ACTIVITY = `---
**Título**: Explorando la IA en tu día a día
**Nivel**: N1 — Fundamentos
**Duración estimada**: 60 minutos
**Modalidad**: Pequeño grupo
**Materiales**: Papel, bolígrafo, smartphone (opcional)
**Objetivos de aprendizaje**:
- Identificar herramientas IA en la vida cotidiana
- Reflexionar sobre el impacto personal
**Desarrollo de la actividad**:
1. Introducción al tema (10 min)
2. Exploración guiada (30 min)
3. Puesta en común (20 min)
**Evidencia para badge**:
Diario reflexivo de una página. Tipo: proceso
**Marco de competencias**:
DigComp 3.0 · Área 1.1
---`;

describe('POST /api/generator/export', () => {

    it('returns 400 when activity is missing', async () => {
        const res = await request(app)
            .post('/api/generator/export')
            .send({ userId: '1', format: 'html', lang: 'es' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/activity/);
    });

    it('returns 400 for unsupported format', async () => {
        const res = await request(app)
            .post('/api/generator/export')
            .send({ userId: '1', activity: SAMPLE_ACTIVITY, format: 'pdf', lang: 'es' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/format/);
    });

    it('returns 400 for unsupported lang', async () => {
        const res = await request(app)
            .post('/api/generator/export')
            .send({ userId: '1', activity: SAMPLE_ACTIVITY, format: 'html', lang: 'fr' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/lang/);
    });

    it('returns HTML file for format=html', async () => {
        const res = await request(app)
            .post('/api/generator/export')
            .send({ userId: '1', activity: SAMPLE_ACTIVITY, format: 'html', lang: 'es' });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.headers['content-disposition']).toMatch(/attachment.*\.html/);
        expect(res.text).toContain('Explorando la IA en tu día a día');
        expect(res.text).toContain('PHAROS-AI');
        expect(res.text).toContain('window.print');
    });

    it('returns HTML with Italian locale for lang=it', async () => {
        const res = await request(app)
            .post('/api/generator/export')
            .send({ userId: '1', activity: SAMPLE_ACTIVITY, format: 'html', lang: 'it' });

        expect(res.status).toBe(200);
        expect(res.text).toContain('lang="it"');
    });

    it('returns DOCX file for format=docx', async () => {
        const res = await request(app)
            .post('/api/generator/export')
            .send({ userId: '1', activity: SAMPLE_ACTIVITY, format: 'docx', lang: 'es' });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/wordprocessingml/);
        expect(res.headers['content-disposition']).toMatch(/attachment.*\.docx/);
    });

    it('HTML output escapes XSS in activity content', async () => {
        const malicious = SAMPLE_ACTIVITY.replace(
            'Explorando la IA en tu día a día',
            '<script>alert(1)</script>'
        );
        const res = await request(app)
            .post('/api/generator/export')
            .send({ userId: '1', activity: malicious, format: 'html', lang: 'es' });

        expect(res.status).toBe(200);
        expect(res.text).not.toContain('<script>');
        expect(res.text).toContain('&lt;script&gt;');
    });

});
