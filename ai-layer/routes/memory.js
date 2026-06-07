'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const { validateMoodleToken } = require('../middleware/auth');
const { memoryLimiter }       = require('../middleware/rateLimit');

const router = express.Router();

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, '../prompts/memory-system.txt'),
    'utf8'
);

const MAX_MESSAGES         = 20;
const MAX_MESSAGE_LENGTH   = 3000;
const MAX_PROFILE_LENGTH   = 4000;

let anthropicClient = null;
function getAnthropic() {
    if (!anthropicClient) {
        const Anthropic = require('@anthropic-ai/sdk');
        anthropicClient = new Anthropic();
    }
    return anthropicClient;
}

async function extractMemory(messages, existingProfile) {
    const conversationText = messages
        .map(m => `${m.role === 'user' ? 'Alumno' : 'Tutor'}: ${m.content}`)
        .join('\n');

    const userPrompt = existingProfile
        ? `Conversación:\n${conversationText}\n\nPerfil existente:\n${JSON.stringify(existingProfile)}`
        : `Conversación:\n${conversationText}`;

    if (process.env.GROQ_API_KEY) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
                max_tokens: 600,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user',   content: userPrompt },
                ],
            }),
        });
        if (!res.ok) throw new Error(`Groq error ${res.status}`);
        const data = await res.json();
        return JSON.parse(data.choices[0]?.message?.content ?? '{}');
    }

    const client = getAnthropic();
    const response = await client.messages.create({
        model:      process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
        max_tokens: 600,
        system:     [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages:   [{ role: 'user', content: userPrompt }],
    });
    return JSON.parse(response.content[0]?.text ?? '{}');
}

/**
 * POST /api/memory/extract
 *
 * Body:
 *   userId          - string
 *   messages        - array of {role, content} — the session conversation
 *   existingProfile - object|null — current stored profile for this user
 */
router.post('/extract', validateMoodleToken, memoryLimiter, async (req, res, next) => {
    try {
        const { userId, messages, existingProfile } = req.body;

        if (!userId || typeof userId !== 'string')
            return res.status(400).json({ error: 'userId required' });

        if (!Array.isArray(messages) || messages.length < 2)
            return res.status(400).json({ error: 'messages must have at least 2 entries' });

        const sanitized = messages
            .slice(-MAX_MESSAGES)
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: String(m.content).slice(0, MAX_MESSAGE_LENGTH) }));

        const existing = existingProfile && typeof existingProfile === 'object'
            ? existingProfile
            : null;

        const profile = await extractMemory(sanitized, existing);

        // Validate the returned object is safe before sending back.
        if (typeof profile !== 'object' || Array.isArray(profile)) {
            return res.status(500).json({ error: 'Invalid profile structure from AI' });
        }

        res.json({ ok: true, profile });

    } catch (err) {
        next(err);
    }
});

module.exports = router;
