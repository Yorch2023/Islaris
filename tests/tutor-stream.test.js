'use strict';

process.env.MOODLE_SECRET    = 'test-secret';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

// Mock the Anthropic SDK stream method.
jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
        messages: {
            // Non-streaming (used by /chat)
            create: jest.fn().mockResolvedValue({
                content: [{ text: 'Respuesta de prueba.' }],
            }),
            // Streaming: async generator that yields text deltas then stops
            stream: jest.fn().mockImplementation(() => {
                const events = [
                    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hola, ' } },
                    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'soy el ' } },
                    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'tutor.' } },
                    { type: 'message_stop' },
                ];
                let i = 0;
                return {
                    [Symbol.asyncIterator]() {
                        return {
                            next: async () => {
                                if (i < events.length) return { value: events[i++], done: false };
                                return { value: undefined, done: true };
                            },
                        };
                    },
                };
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

// Helper: collect a full SSE response into an array of parsed data payloads.
async function collectSse(res) {
    const text   = res.text;
    const lines  = text.split('\n').filter(l => l.startsWith('data: '));
    return lines.map(l => l.slice(6).trim());
}

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
