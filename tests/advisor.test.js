'use strict';

process.env.MOODLE_SECRET    = 'test-secret';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
        messages: {
            create: jest.fn().mockResolvedValue({
                content: [{ text: 'El alumno muestra un patrón de abandono gradual. Te recomiendo enviarle un mensaje personalizado.' }],
            }),
        },
    }));
});

const request      = require('supertest');
const express      = require('express');
const advisorRouter = require('../ai-layer/routes/advisor');

const app = express();
app.use(express.json());
app.use('/api/advisor', advisorRouter);

const AUTH = 'Bearer test-secret';

const STUDENT_PROFILE = `Nombre: Ana García | Nivel: N2 | XP: 180/250 (72%)
Última actividad en itinerario: hace 12 días
Sesiones IA: 3 total, 0 esta semana
Evidencias: 2 entregadas (umbral N2: 4)
Riesgo calculado: 48/100 (medio)`;

const validBody = {
    userId:         'teacher-99',
    lang:           'es',
    studentProfile: STUDENT_PROFILE,
    messages: [
        { role: 'user', content: '¿Qué estrategia me recomiendas para motivar a esta alumna?' },
    ],
};

describe('POST /api/advisor/chat — validation', () => {
    test('returns 401 without Authorization header', async () => {
        const res = await request(app).post('/api/advisor/chat').send(validBody);
        expect(res.status).toBe(401);
    });

    test('returns 400 when userId is missing', async () => {
        const { userId: _, ...body } = validBody;
        const res = await request(app)
            .post('/api/advisor/chat')
            .set('Authorization', AUTH)
            .send(body);
        expect(res.status).toBe(400);
    });

    test('returns 400 when lang is unsupported', async () => {
        const res = await request(app)
            .post('/api/advisor/chat')
            .set('Authorization', AUTH)
            .send({ ...validBody, lang: 'de' });
        expect(res.status).toBe(400);
    });

    test('returns 400 when studentProfile is missing', async () => {
        const { studentProfile: _, ...body } = validBody;
        const res = await request(app)
            .post('/api/advisor/chat')
            .set('Authorization', AUTH)
            .send(body);
        expect(res.status).toBe(400);
    });

    test('returns 400 when messages array is empty', async () => {
        const res = await request(app)
            .post('/api/advisor/chat')
            .set('Authorization', AUTH)
            .send({ ...validBody, messages: [] });
        expect(res.status).toBe(400);
    });

    test('returns 400 when last message is from assistant', async () => {
        const res = await request(app)
            .post('/api/advisor/chat')
            .set('Authorization', AUTH)
            .send({ ...validBody, messages: [{ role: 'assistant', content: 'Hola.' }] });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/advisor/chat — happy path', () => {
    test('returns 200 with reply string for valid request', async () => {
        const res = await request(app)
            .post('/api/advisor/chat')
            .set('Authorization', AUTH)
            .send(validBody);

        expect(res.status).toBe(200);
        expect(typeof res.body.reply).toBe('string');
        expect(res.body.reply.length).toBeGreaterThan(0);
    });

    test('works with lang=it', async () => {
        const res = await request(app)
            .post('/api/advisor/chat')
            .set('Authorization', AUTH)
            .send({ ...validBody, userId: 'teacher-it-99', lang: 'it' });

        expect(res.status).toBe(200);
        expect(typeof res.body.reply).toBe('string');
    });

    test('handles multi-turn conversations', async () => {
        const res = await request(app)
            .post('/api/advisor/chat')
            .set('Authorization', AUTH)
            .send({
                ...validBody,
                userId: 'teacher-multiturn',
                messages: [
                    { role: 'user',      content: '¿Cómo está progresando esta alumna?' },
                    { role: 'assistant', content: 'Muestra signos de desconexión gradual.' },
                    { role: 'user',      content: '¿Cuál sería el mejor momento para contactarla?' },
                ],
            });

        expect(res.status).toBe(200);
        expect(typeof res.body.reply).toBe('string');
    });

    test('truncates studentProfile longer than 3000 chars without error', async () => {
        const longProfile = 'A'.repeat(4000);
        const res = await request(app)
            .post('/api/advisor/chat')
            .set('Authorization', AUTH)
            .send({ ...validBody, userId: 'teacher-longprofile', studentProfile: longProfile });

        expect(res.status).toBe(200);
    });
});

describe('POST /api/advisor/chat — system prompt includes profile', () => {
    let mockCreate;
    let capturedArgs;

    beforeAll(() => {
        const Anthropic = require('@anthropic-ai/sdk');
        mockCreate = Anthropic.mock.results[0].value.messages.create;
    });

    beforeEach(() => {
        mockCreate.mockClear();
        mockCreate.mockImplementation(async (args) => {
            capturedArgs = args;
            return { content: [{ text: 'Respuesta del asesor.' }] };
        });
    });

    test('system prompt contains student profile text', async () => {
        await request(app)
            .post('/api/advisor/chat')
            .set('Authorization', AUTH)
            .send({ ...validBody, userId: 'teacher-spy' });

        const systemBlocks = capturedArgs.system;
        const combinedSystem = systemBlocks.map(b => b.text).join('\n');
        expect(combinedSystem).toContain('Ana García');
        expect(combinedSystem).toContain('Perfil del alumno');
    });

    test('system prompt specifies Spanish for lang=es', async () => {
        await request(app)
            .post('/api/advisor/chat')
            .set('Authorization', AUTH)
            .send({ ...validBody, userId: 'teacher-spy-es' });

        const systemBlocks = capturedArgs.system;
        const combinedSystem = systemBlocks.map(b => b.text).join('\n');
        expect(combinedSystem).toContain('español');
    });

    test('system prompt specifies Italian for lang=it', async () => {
        await request(app)
            .post('/api/advisor/chat')
            .set('Authorization', AUTH)
            .send({ ...validBody, userId: 'teacher-spy-it', lang: 'it' });

        const systemBlocks = capturedArgs.system;
        const combinedSystem = systemBlocks.map(b => b.text).join('\n');
        expect(combinedSystem).toContain('italiano');
    });
});
