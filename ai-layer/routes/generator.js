'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const { validateMoodleToken } = require('../middleware/auth');
const { generatorLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const LEVEL_LABELS = { 1: 'N1 — Fundamentos', 2: 'N2 — IA en la práctica', 3: 'N3 — Facilitación crítica' };

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, '../prompts/generator-system.txt'),
    'utf8'
);

const USE_GROQ = !!process.env.GROQ_API_KEY;

let anthropicClient = null;
function getAnthropic() {
    if (!anthropicClient) {
        const Anthropic = require('@anthropic-ai/sdk');
        anthropicClient = new Anthropic();
    }
    return anthropicClient;
}

async function callAI(userMessage) {
    if (USE_GROQ) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
                max_tokens: 2048,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user',   content: userMessage },
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
        max_tokens: 2048,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMessage }],
    });
    return response.content[0]?.text ?? '';
}

/**
 * POST /api/generator/activity
 */
router.post('/activity', validateMoodleToken, generatorLimiter, async (req, res, next) => {
    try {
        const { userId, level, topic, objective, lang } = req.body;

        if (!userId || typeof userId !== 'string')
            return res.status(400).json({ error: 'userId is required' });
        if (![1, 2, 3].includes(level))
            return res.status(400).json({ error: 'level must be 1, 2 or 3' });
        if (!topic || typeof topic !== 'string' || topic.trim().length === 0)
            return res.status(400).json({ error: 'topic is required' });
        if (!['es', 'it'].includes(lang))
            return res.status(400).json({ error: 'lang must be "es" or "it"' });

        const userMessage = [
            `Genera una actividad pedagógica para el nivel ${LEVEL_LABELS[level]}.`,
            `Tema: ${topic.slice(0, 500)}`,
            objective ? `Objetivo específico: ${String(objective).slice(0, 300)}` : null,
            `Idioma de la actividad: ${lang === 'es' ? 'español' : 'italiano'}`,
        ].filter(Boolean).join('\n');

        const activity = await callAI(userMessage);
        res.json({ activity });

    } catch (err) {
        next(err);
    }
});

module.exports = router;
