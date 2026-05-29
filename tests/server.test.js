'use strict';

process.env.MOODLE_SECRET    = 'test-secret';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({
    messages: {
        create: jest.fn().mockResolvedValue({ content: [{ text: 'ok' }] }),
        stream: jest.fn().mockReturnValue((async function* () {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } };
        })()),
    },
})));

const request = require('supertest');
const app     = require('../ai-layer/server');

describe('GET /health', () => {
    test('returns 200 with status ok', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(typeof res.body.version).toBe('string');
    });
});

describe('Unknown routes', () => {
    test('returns 404', async () => {
        const res = await request(app).get('/nonexistent');
        expect(res.status).toBe(404);
    });
});
