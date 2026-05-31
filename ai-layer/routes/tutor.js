'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const { validateMoodleToken } = require('../middleware/auth');
const { tutorLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const LEVEL_LABELS = { 1: 'N1 — Fundamentos', 2: 'N2 — IA en la práctica', 3: 'N3 — Facilitación crítica' };

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, '../prompts/tutor-system.txt'),
    'utf8'
);

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

// Provider selection: prefer Groq (free) when available, fall back to Anthropic.
const USE_GROQ = !!process.env.GROQ_API_KEY;

// Lazy-load Anthropic SDK only when needed.
let anthropicClient = null;
function getAnthropic() {
    if (!anthropicClient) {
        const Anthropic = require('@anthropic-ai/sdk');
        anthropicClient = new Anthropic();
    }
    return anthropicClient;
}

/**
 * Call the configured AI provider and return a reply string.
 */
async function callAI(systemText, messages) {
    if (USE_GROQ) {
        return callGroq(systemText, messages);
    }
    return callAnthropic(systemText, messages);
}

async function callGroq(systemText, messages) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
            max_tokens: 1024,
            messages: [
                { role: 'system', content: systemText },
                ...messages,
            ],
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw Object.assign(new Error(`Groq error ${res.status}: ${err}`), { status: res.status });
    }

    const data = await res.json();
    return data.choices[0]?.message?.content ?? '';
}

async function callAnthropic(systemText, messages) {
    const client = getAnthropic();
    const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: [
            { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: systemText },
        ],
        messages,
    });
    return response.content[0]?.text ?? '';
}

function buildSystemText(level, lang) {
    return `Nivel actual del usuario: ${LEVEL_LABELS[level]}\n`
         + `Idioma de respuesta: ${lang === 'es' ? 'español' : 'italiano'}`;
}

function sanitize(messages) {
    return messages
        .slice(-MAX_MESSAGES)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: String(m.content).slice(0, MAX_MESSAGE_LENGTH) }));
}

function validateBody(body, res) {
    const { userId, level, lang, messages } = body;
    if (!userId || typeof userId !== 'string')
        return res.status(400).json({ error: 'userId is required' });
    if (![1, 2, 3].includes(level))
        return res.status(400).json({ error: 'level must be 1, 2 or 3' });
    if (!['es', 'it'].includes(lang))
        return res.status(400).json({ error: 'lang must be "es" or "it"' });
    if (!Array.isArray(messages) || messages.length === 0)
        return res.status(400).json({ error: 'messages must be a non-empty array' });
    return null;
}

/**
 * POST /api/tutor/chat
 */
router.post('/chat', validateMoodleToken, tutorLimiter, async (req, res, next) => {
    try {
        const invalid = validateBody(req.body, res);
        if (invalid) return;

        const { level, lang, messages } = req.body;
        const sanitized = sanitize(messages);

        if (!sanitized.length || sanitized.at(-1).role !== 'user')
            return res.status(400).json({ error: 'Last message must be from the user' });

        const reply = await callAI(buildSystemText(level, lang), sanitized);
        res.json({ reply });

    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/tutor/stream  (SSE — kept for future Nginx deployments)
 */
router.post('/stream', validateMoodleToken, tutorLimiter, async (req, res, next) => {
    try {
        const invalid = validateBody(req.body, res);
        if (invalid) return;

        const { level, lang, messages } = req.body;
        const sanitized = sanitize(messages);

        if (!sanitized.length || sanitized.at(-1).role !== 'user')
            return res.status(400).json({ error: 'Last message must be from the user' });

        // For simplicity, SSE path calls the same non-streaming AI and wraps in SSE format.
        const reply = await callAI(buildSystemText(level, lang), sanitized);

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders();
        res.write(`data: ${JSON.stringify({ delta: reply })}\n\n`);
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
