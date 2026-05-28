'use strict';

process.env.MOODLE_SECRET   = 'test-secret';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

// Mock the Anthropic SDK before requiring routes.
jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
        messages: {
            create: jest.fn().mockResolvedValue({
                content: [{ text: 'Respuesta del tutor de prueba.' }],
            }),
        },
    }));
});

const request  = require('supertest');
const express  = require('express');
const tutorRouter = require('../ai-layer/routes/tutor');

const app = express();
app.use(express.json());
app.use('/api/tutor', tutorRouter);

const AUTH = 'Bearer test-secret';

const validBody = {
    userId: 'user-42',
    level: 1,
    lang: 'es',
    messages: [{ role: 'user', content: '¿Qué es la inteligencia artificial?' }],
};

describe('POST /api/tutor/chat', () => {
    test('returns 200 with a reply for a valid request', async () => {
        const res = await request(app)
            .post('/api/tutor/chat')
            .set('Authorization', AUTH)
            .send(validBody);

        expect(res.status).toBe(200);
        expect(typeof res.body.reply).toBe('string');
        expect(res.body.reply.length).toBeGreaterThan(0);
    });

    test('returns 401 without Authorization header', async () => {
        const res = await request(app)
            .post('/api/tutor/chat')
            .send(validBody);
        expect(res.status).toBe(401);
    });

    test('returns 400 when level is invalid', async () => {
        const res = await request(app)
            .post('/api/tutor/chat')
            .set('Authorization', AUTH)
            .send({ ...validBody, level: 5 });
        expect(res.status).toBe(400);
    });

    test('returns 400 when lang is unsupported', async () => {
        const res = await request(app)
            .post('/api/tutor/chat')
            .set('Authorization', AUTH)
            .send({ ...validBody, lang: 'fr' });
        expect(res.status).toBe(400);
    });

    test('returns 400 when messages array is empty', async () => {
        const res = await request(app)
            .post('/api/tutor/chat')
            .set('Authorization', AUTH)
            .send({ ...validBody, messages: [] });
        expect(res.status).toBe(400);
    });

    test('returns 400 when last message is not from user', async () => {
        const res = await request(app)
            .post('/api/tutor/chat')
            .set('Authorization', AUTH)
            .send({ ...validBody, messages: [{ role: 'assistant', content: 'Hola.' }] });
        expect(res.status).toBe(400);
    });
});
