'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const { validateMoodleToken } = require('../middleware/auth');
const { advisorLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, '../prompts/advisor-system.txt'),
    'utf8'
);

const MAX_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_PROFILE_LENGTH = 3000;

let anthropicClient = null;
function getAnthropic() {
    if (!anthropicClient) {
        const Anthropic = require('@anthropic-ai/sdk');
        anthropicClient = new Anthropic();
    }
    return anthropicClient;
}

async function callAI(systemText, messages) {
    if (process.env.GROQ_API_KEY) {
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

function sanitize(messages) {
    return messages
        .slice(-MAX_MESSAGES)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: String(m.content).slice(0, MAX_MESSAGE_LENGTH) }));
}

/**
 * POST /api/advisor/chat
 *
 * Body:
 *   userId      - teacher Moodle user ID (string)
 *   lang        - 'es' | 'it'
 *   studentProfile - plain-text summary of the student's learning data (injected by PHP)
 *   messages    - conversation array [{ role, content }]
 */
router.post('/chat', validateMoodleToken, advisorLimiter, async (req, res, next) => {
    try {
        const { userId, lang, studentProfile, messages } = req.body;

        if (!userId || typeof userId !== 'string')
            return res.status(400).json({ error: 'userId is required' });
        if (!['es', 'it'].includes(lang))
            return res.status(400).json({ error: 'lang must be "es" or "it"' });
        if (!studentProfile || typeof studentProfile !== 'string')
            return res.status(400).json({ error: 'studentProfile is required' });
        if (!Array.isArray(messages) || messages.length === 0)
            return res.status(400).json({ error: 'messages must be a non-empty array' });

        const sanitized = sanitize(messages);
        if (!sanitized.length || sanitized.at(-1).role !== 'user')
            return res.status(400).json({ error: 'Last message must be from the user' });

        const profileText = String(studentProfile).slice(0, MAX_PROFILE_LENGTH);
        const systemText =
            `Idioma de respuesta: ${lang === 'es' ? 'español' : 'italiano'}\n\n` +
            `## Perfil del alumno\n\n${profileText}`;

        const reply = await callAI(systemText, sanitized);
        res.json({ reply });

    } catch (err) {
        next(err);
    }
});

module.exports = router;
