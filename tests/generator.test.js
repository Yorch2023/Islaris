'use strict';

process.env.MOODLE_SECRET    = 'test-secret';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
        messages: {
            create: jest.fn().mockResolvedValue({
                content: [{ text: '**Título**: Actividad de prueba\n\n**Nivel**: N1 — Fundamentos' }],
            }),
        },
    }));
});

const request   = require('supertest');
const express   = require('express');
const genRouter = require('../ai-layer/routes/generator');

const app = express();
app.use(express.json());
app.use('/api/generator', genRouter);

const AUTH = 'Bearer test-secret';

const validBody = {
    userId: 'user-7',
    level: 2,
    lang: 'es',
    topic: 'Sesgos algorítmicos',
};

describe('POST /api/generator/activity', () => {
    test('returns 200 with a structured activity', async () => {
        const res = await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send(validBody);
        expect(res.status).toBe(200);
        expect(typeof res.body.activity).toBe('string');
    });

    test('includes optional objective in the request', async () => {
        const res = await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send({ ...validBody, objective: 'Identificar sesgos en datasets públicos' });
        expect(res.status).toBe(200);
    });

    test('returns 401 without token', async () => {
        const res = await request(app)
            .post('/api/generator/activity')
            .send(validBody);
        expect(res.status).toBe(401);
    });

    test('returns 400 when topic is missing', async () => {
        const res = await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send({ ...validBody, topic: '' });
        expect(res.status).toBe(400);
    });

    test('returns 400 when level is invalid', async () => {
        const res = await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send({ ...validBody, level: 0 });
        expect(res.status).toBe(400);
    });

    test('returns 400 when level is 4', async () => {
        const res = await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send({ ...validBody, level: 4 });
        expect(res.status).toBe(400);
    });

    test('returns 400 when userId is missing', async () => {
        const { userId: _omitted, ...noUserId } = validBody;
        const res = await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send(noUserId);
        expect(res.status).toBe(400);
    });

    test('returns 400 when lang is unsupported', async () => {
        const res = await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send({ ...validBody, lang: 'fr' });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/generator/activity — message composition', () => {
    let mockCreate;
    // Use unique userIds to avoid exhausting the 10/h rate limit shared with the first suite.
    let uidSeq = 0;
    const nextBody = (overrides = {}) => ({ ...validBody, userId: `user-compose-${++uidSeq}`, ...overrides });

    beforeAll(() => {
        const Anthropic = require('@anthropic-ai/sdk');
        // mockImplementation returns the object; instances[0] is `this`, not the result.
        mockCreate = Anthropic.mock.results[0].value.messages.create;
    });

    beforeEach(() => {
        mockCreate.mockClear();
    });

    test('truncates topic to 500 characters', async () => {
        const longTopic = 'X'.repeat(600);
        await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send(nextBody({ topic: longTopic }));

        const userContent = mockCreate.mock.calls[0][0].messages[0].content;
        expect(userContent).toContain('Tema: ' + 'X'.repeat(500));
        expect(userContent).not.toContain('X'.repeat(501));
    });

    test('truncates objective to 300 characters', async () => {
        const longObjective = 'Y'.repeat(400);
        await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send(nextBody({ objective: longObjective }));

        const userContent = mockCreate.mock.calls[0][0].messages[0].content;
        expect(userContent).toContain('Objetivo específico: ' + 'Y'.repeat(300));
        expect(userContent).not.toContain('Y'.repeat(301));
    });

    test('uses Italian in the user message when lang is "it"', async () => {
        await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send(nextBody({ lang: 'it' }));

        const userContent = mockCreate.mock.calls[0][0].messages[0].content;
        expect(userContent).toContain('italiano');
    });

    test('omits objective line when objective is not provided', async () => {
        await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send(nextBody());

        const userContent = mockCreate.mock.calls[0][0].messages[0].content;
        expect(userContent).not.toContain('Objetivo específico');
    });

    test('includes objective line when objective is provided', async () => {
        await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send(nextBody({ objective: 'Identificar sesgos' }));

        const userContent = mockCreate.mock.calls[0][0].messages[0].content;
        expect(userContent).toContain('Objetivo específico: Identificar sesgos');
    });

    test('level label N3 appears in user message for level 3', async () => {
        await request(app)
            .post('/api/generator/activity')
            .set('Authorization', AUTH)
            .send(nextBody({ level: 3 }));

        const userContent = mockCreate.mock.calls[0][0].messages[0].content;
        expect(userContent).toContain('N3');
    });
});
