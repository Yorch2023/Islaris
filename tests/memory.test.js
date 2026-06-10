'use strict';

process.env.MOODLE_SECRET    = 'test-secret';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

const MOCK_PROFILE = {
    concepts_explored: ['algoritmos', 'sesgos', 'IA en educación'],
    mastery:           { 'sesgos algorítmicos': 2, 'privacidad': 1 },
    strengths:         'Conecta bien la IA con su contexto educativo.',
    growth_areas:      'Necesita profundizar en los marcos regulatorios.',
    learning_style:    'concrete_examples',
    recurring_questions: ['¿Cómo afectan los sesgos al alumnado?'],
    context:           'Docente de secundaria',
};

jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
        messages: {
            create: jest.fn().mockResolvedValue({
                content: [{ text: JSON.stringify(MOCK_PROFILE) }],
            }),
        },
    }));
});

const request      = require('supertest');
const express      = require('express');
const memoryRouter = require('../ai-layer/routes/memory');

const app = express();
app.use(express.json());
app.use('/api/memory', memoryRouter);

const AUTH = 'Bearer test-secret';

const twoMessages = [
    { role: 'user',      content: '¿Cómo afectan los sesgos en la IA a mis alumnos?' },
    { role: 'assistant', content: 'Los sesgos algorítmicos pueden reproducir desigualdades existentes...' },
];

describe('POST /api/memory/extract — validation', () => {
    test('returns 401 without Authorization header', async () => {
        const res = await request(app)
            .post('/api/memory/extract')
            .send({ userId: 'u1', messages: twoMessages });
        expect(res.status).toBe(401);
    });

    test('returns 400 when userId is missing', async () => {
        const res = await request(app)
            .post('/api/memory/extract')
            .set('Authorization', AUTH)
            .send({ messages: twoMessages });
        expect(res.status).toBe(400);
    });

    test('returns 400 when messages has fewer than 2 entries', async () => {
        const res = await request(app)
            .post('/api/memory/extract')
            .set('Authorization', AUTH)
            .send({ userId: 'u1', messages: [twoMessages[0]] });
        expect(res.status).toBe(400);
    });

    test('returns 400 when messages is not an array', async () => {
        const res = await request(app)
            .post('/api/memory/extract')
            .set('Authorization', AUTH)
            .send({ userId: 'u1', messages: 'not-an-array' });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/memory/extract — happy path', () => {
    test('returns 200 with ok:true and a profile object', async () => {
        const res = await request(app)
            .post('/api/memory/extract')
            .set('Authorization', AUTH)
            .send({ userId: 'u-memory-1', messages: twoMessages });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(typeof res.body.profile).toBe('object');
        expect(res.body.profile).not.toBeNull();
    });

    test('profile contains expected fields from mock', async () => {
        const res = await request(app)
            .post('/api/memory/extract')
            .set('Authorization', AUTH)
            .send({ userId: 'u-memory-2', messages: twoMessages });

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.profile.concepts_explored)).toBe(true);
        expect(typeof res.body.profile.strengths).toBe('string');
    });

    test('works with existingProfile passed in body', async () => {
        const res = await request(app)
            .post('/api/memory/extract')
            .set('Authorization', AUTH)
            .send({
                userId:          'u-memory-3',
                messages:        twoMessages,
                existingProfile: { concepts_explored: ['IA básica'] },
            });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    test('ignores null existingProfile gracefully', async () => {
        const res = await request(app)
            .post('/api/memory/extract')
            .set('Authorization', AUTH)
            .send({ userId: 'u-memory-4', messages: twoMessages, existingProfile: null });

        expect(res.status).toBe(200);
    });

    test('handles a long conversation (> 20 messages) by truncating', async () => {
        const manyMessages = Array.from({ length: 30 }, (_, i) => ({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i}`,
        }));

        const res = await request(app)
            .post('/api/memory/extract')
            .set('Authorization', AUTH)
            .send({ userId: 'u-memory-5', messages: manyMessages });

        expect(res.status).toBe(200);
    });
});

describe('POST /api/memory/extract — AI returns invalid JSON', () => {
    let mockCreate;

    beforeAll(() => {
        const Anthropic = require('@anthropic-ai/sdk');
        mockCreate = Anthropic.mock.results[0].value.messages.create;
    });

    test('returns 500 when AI response is not parseable as object', async () => {
        mockCreate.mockResolvedValueOnce({ content: [{ text: 'Lo siento, no puedo ayudarte.' }] });

        const res = await request(app)
            .post('/api/memory/extract')
            .set('Authorization', AUTH)
            .send({ userId: 'u-memory-bad', messages: twoMessages });

        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/Invalid profile/);
    });

    test('returns 500 when AI returns a JSON array (not an object)', async () => {
        mockCreate.mockResolvedValueOnce({ content: [{ text: '["item1","item2"]' }] });

        const res = await request(app)
            .post('/api/memory/extract')
            .set('Authorization', AUTH)
            .send({ userId: 'u-memory-arr', messages: twoMessages });

        expect(res.status).toBe(500);
    });
});
