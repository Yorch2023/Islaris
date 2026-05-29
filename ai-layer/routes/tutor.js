'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const { validateMoodleToken } = require('../middleware/auth');
const { tutorLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const client = new Anthropic();

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, '../prompts/tutor-system.txt'),
    'utf8'
);

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

/**
 * POST /api/tutor/chat
 *
 * Body:
 *   userId      {string}  Moodle user ID (opaque, used for rate limiting only)
 *   level       {number}  Itinerary level: 1, 2 or 3
 *   lang        {string}  'es' or 'it'
 *   messages    {Array}   Conversation history: [{role, content}]
 *
 * Returns:
 *   { reply: string }
 */
router.post('/chat', validateMoodleToken, tutorLimiter, async (req, res, next) => {
    try {
        const { userId, level, lang, messages } = req.body;

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ error: 'userId is required' });
        }

        if (![1, 2, 3].includes(level)) {
            return res.status(400).json({ error: 'level must be 1, 2 or 3' });
        }

        if (!['es', 'it'].includes(lang)) {
            return res.status(400).json({ error: 'lang must be "es" or "it"' });
        }

        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'messages must be a non-empty array' });
        }

        const sanitizedMessages = messages
            .slice(-MAX_MESSAGES)
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({
                role: m.role,
                content: String(m.content).slice(0, MAX_MESSAGE_LENGTH),
            }));

        if (sanitizedMessages.length === 0 || sanitizedMessages[sanitizedMessages.length - 1].role !== 'user') {
            return res.status(400).json({ error: 'Last message must be from the user' });
        }

        const levelLabels = { 1: 'N1 — Fundamentos', 2: 'N2 — IA en la práctica', 3: 'N3 — Facilitación crítica' };
        const systemWithContext = `${SYSTEM_PROMPT}\n\nNivel actual del usuario: ${levelLabels[level]}\nIdioma de respuesta: ${lang === 'es' ? 'español' : 'italiano'}`;

        const response = await client.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 1024,
            system: systemWithContext,
            messages: sanitizedMessages,
        });

        const reply = response.content[0]?.text ?? '';
        res.json({ reply });

    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/tutor/stream
 *
 * Same parameters as /chat. Returns a Server-Sent Events stream of text deltas.
 * Each SSE event: data: {"delta":"<text>"}\n\n
 * Final event:    data: [DONE]\n\n
 */
router.post('/stream', validateMoodleToken, tutorLimiter, async (req, res, next) => {
    try {
        const { userId, level, lang, messages } = req.body;

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ error: 'userId is required' });
        }
        if (![1, 2, 3].includes(level)) {
            return res.status(400).json({ error: 'level must be 1, 2 or 3' });
        }
        if (!['es', 'it'].includes(lang)) {
            return res.status(400).json({ error: 'lang must be "es" or "it"' });
        }
        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'messages must be a non-empty array' });
        }

        const sanitizedMessages = messages
            .slice(-MAX_MESSAGES)
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: String(m.content).slice(0, MAX_MESSAGE_LENGTH) }));

        if (!sanitizedMessages.length || sanitizedMessages.at(-1).role !== 'user') {
            return res.status(400).json({ error: 'Last message must be from the user' });
        }

        const levelLabels = { 1: 'N1 — Fundamentos', 2: 'N2 — IA en la práctica', 3: 'N3 — Facilitación crítica' };
        const systemWithContext = `${SYSTEM_PROMPT}\n\nNivel actual del usuario: ${levelLabels[level]}\nIdioma de respuesta: ${lang === 'es' ? 'español' : 'italiano'}`;

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const stream = client.messages.stream({
            model: 'claude-sonnet-4-5',
            max_tokens: 1024,
            system: systemWithContext,
            messages: sanitizedMessages,
        });

        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                res.write(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`);
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (err) {
        if (!res.headersSent) {
            next(err);
        } else {
            res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
            res.end();
        }
    }
});

module.exports = router;
