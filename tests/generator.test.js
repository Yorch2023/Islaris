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
});
