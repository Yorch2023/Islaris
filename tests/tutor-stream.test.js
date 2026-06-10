'use strict';

process.env.MOODLE_SECRET    = 'test-secret';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

// Mock the Anthropic SDK stream method.
// The /stream endpoint calls messages.create (non-streaming) and wraps the
// reply in a single SSE data event.  The mock therefore only needs 'create'.
jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
        messages: {
            create: jest.fn().mockResolvedValue({
                content: [{ text: 'Hola, soy el tutor.' }],
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
    messages: [{ role: 'user', content: '¿Qué es la IA?' }],
};

describe('POST /api/tutor/stream', () => {
    test('streams text deltas and ends with [DONE]', async () => {
        const res = await request(app)
            .post('/api/tutor/stream')
            .set('Authorization', AUTH)
            .send(validBody)
            .buffer(true)
            .parse((res, callback) => {
                let data = '';
                res.on('data', chunk => { data += chunk.toString(); });
                res.on('end', () => callback(null, data));
            });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/event-stream/);

        const events = res.body.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6));
        const doneEvent = events.find(e => e.trim() === '[DONE]');
        const deltaEvents = events.filter(e => e.trim() !== '[DONE]');

        expect(doneEvent).toBeDefined();
        expect(deltaEvents.length).toBeGreaterThan(0);

        const fullText = deltaEvents.map(e => JSON.parse(e).delta).join('');
        expect(fullText).toBe('Hola, soy el tutor.');
    });

    test('returns 401 without Authorization header', async () => {
        const res = await request(app)
            .post('/api/tutor/stream')
            .send(validBody);
        expect(res.status).toBe(401);
    });

    test('returns 400 for invalid level', async () => {
        const res = await request(app)
            .post('/api/tutor/stream')
            .set('Authorization', AUTH)
            .send({ ...validBody, level: 99 });
        expect(res.status).toBe(400);
    });

    test('returns 400 for unsupported lang', async () => {
        const res = await request(app)
            .post('/api/tutor/stream')
            .set('Authorization', AUTH)
            .send({ ...validBody, lang: 'de' });
        expect(res.status).toBe(400);
    });

    test('returns 400 when last message is not from user', async () => {
        const res = await request(app)
            .post('/api/tutor/stream')
            .set('Authorization', AUTH)
            .send({ ...validBody, messages: [{ role: 'assistant', content: 'Hola.' }] });
        expect(res.status).toBe(400);
    });
});
