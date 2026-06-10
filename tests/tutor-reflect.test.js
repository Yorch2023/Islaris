'use strict';

process.env.MOODLE_SECRET    = 'test-secret';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

// Prefixed with 'mock' so Jest's hoisting allows the reference inside jest.mock().
const mockValidJson = JSON.stringify({ valid: true,  quality: 3, feedback: 'Excelente reflexión, muy detallada.' });

jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
        messages: {
            create: jest.fn().mockResolvedValue({ content: [{ text: mockValidJson }] }),
        },
    }));
});

const request     = require('supertest');
const express     = require('express');
const tutorRouter = require('../ai-layer/routes/tutor');

const app = express();
app.use(express.json());
app.use('/api/tutor', tutorRouter);

const AUTH = 'Bearer test-secret';

const validBody = {
    userId:        'user-reflect-1',
    lang:          'es',
    level:         1,
    activity_name: 'Identificar IA en mi entorno',
    reflection:    'Durante esta actividad me di cuenta de que uso la IA cada día sin notarlo: el corrector de texto, las recomendaciones de Spotify y el asistente del banco. Lo más llamativo fue comprender que estos sistemas toman decisiones por mí basándose en mis datos históricos.',
};

describe('POST /api/tutor/reflect — validation', () => {
    test('returns 401 without Authorization header', async () => {
        const res = await request(app).post('/api/tutor/reflect').send(validBody);
        expect(res.status).toBe(401);
    });

    test('returns 400 when userId is missing', async () => {
        const { userId: _, ...body } = validBody;
        const res = await request(app)
            .post('/api/tutor/reflect')
            .set('Authorization', AUTH)
            .send(body);
        expect(res.status).toBe(400);
    });

    test('returns 400 when lang is unsupported', async () => {
        const res = await request(app)
            .post('/api/tutor/reflect')
            .set('Authorization', AUTH)
            .send({ ...validBody, lang: 'fr' });
        expect(res.status).toBe(400);
    });

    test('returns 400 when level is invalid', async () => {
        const res = await request(app)
            .post('/api/tutor/reflect')
            .set('Authorization', AUTH)
            .send({ ...validBody, level: 0 });
        expect(res.status).toBe(400);
    });

    test('returns 400 when reflection is too short (< 30 chars)', async () => {
        const res = await request(app)
            .post('/api/tutor/reflect')
            .set('Authorization', AUTH)
            .send({ ...validBody, reflection: 'Muy bien.' });
        expect(res.status).toBe(400);
    });

    test('returns 400 when reflection is not a string', async () => {
        const res = await request(app)
            .post('/api/tutor/reflect')
            .set('Authorization', AUTH)
            .send({ ...validBody, reflection: 42 });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/tutor/reflect — happy path', () => {
    test('returns 200 with valid, quality and feedback when AI approves', async () => {
        const res = await request(app)
            .post('/api/tutor/reflect')
            .set('Authorization', AUTH)
            .send(validBody);

        expect(res.status).toBe(200);
        expect(typeof res.body.valid).toBe('boolean');
        expect([1, 2, 3]).toContain(res.body.quality);
        expect(typeof res.body.feedback).toBe('string');
    });

    test('valid is true when AI returns quality >= 2 and valid:true', async () => {
        const res = await request(app)
            .post('/api/tutor/reflect')
            .set('Authorization', AUTH)
            .send({ ...validBody, userId: 'user-reflect-happy-2' });

        expect(res.status).toBe(200);
        expect(res.body.valid).toBe(true);
        expect(res.body.quality).toBe(3);
    });

    test('works without optional activity_name field', async () => {
        const { activity_name: _, ...body } = validBody;
        const res = await request(app)
            .post('/api/tutor/reflect')
            .set('Authorization', AUTH)
            .send({ ...body, userId: 'user-reflect-noname' });

        expect(res.status).toBe(200);
    });

    test('works with lang=it', async () => {
        const res = await request(app)
            .post('/api/tutor/reflect')
            .set('Authorization', AUTH)
            .send({ ...validBody, userId: 'user-reflect-it', lang: 'it' });

        expect(res.status).toBe(200);
    });
});

describe('POST /api/tutor/reflect — AI returns invalid JSON', () => {
    let mockCreate;

    beforeAll(() => {
        const Anthropic = require('@anthropic-ai/sdk');
        mockCreate = Anthropic.mock.results[0].value.messages.create;
    });

    test('returns 502 when AI response is not parseable JSON', async () => {
        mockCreate.mockResolvedValueOnce({ content: [{ text: 'Lo siento, no puedo ayudarte.' }] });

        const res = await request(app)
            .post('/api/tutor/reflect')
            .set('Authorization', AUTH)
            .send({ ...validBody, userId: 'user-reflect-badjson' });

        expect(res.status).toBe(502);
    });

    test('clamps quality to 1-3 even if AI returns out-of-range value', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{ text: JSON.stringify({ valid: true, quality: 99, feedback: 'Bien' }) }],
        });

        const res = await request(app)
            .post('/api/tutor/reflect')
            .set('Authorization', AUTH)
            .send({ ...validBody, userId: 'user-reflect-clamp' });

        expect(res.status).toBe(200);
        expect(res.body.quality).toBeLessThanOrEqual(3);
    });

    test('valid is false when quality < 2 even if valid:true from AI', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{ text: JSON.stringify({ valid: true, quality: 1, feedback: 'Insuficiente' }) }],
        });

        const res = await request(app)
            .post('/api/tutor/reflect')
            .set('Authorization', AUTH)
            .send({ ...validBody, userId: 'user-reflect-q1' });

        expect(res.status).toBe(200);
        expect(res.body.valid).toBe(false);
    });
});
