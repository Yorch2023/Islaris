'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const { validateMoodleToken } = require('../middleware/auth');
const { generatorLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const client = new Anthropic();

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, '../prompts/generator-system.txt'),
    'utf8'
);

/**
 * POST /api/generator/activity
 *
 * Body:
 *   userId      {string}  Moodle user ID
 *   level       {number}  1, 2 or 3
 *   topic       {string}  Topic for the activity
 *   objective   {string}  Optional specific learning objective
 *   lang        {string}  'es' or 'it'
 *
 * Returns:
 *   { activity: string }
 */
router.post('/activity', validateMoodleToken, generatorLimiter, async (req, res, next) => {
    try {
        const { userId, level, topic, objective, lang } = req.body;

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ error: 'userId is required' });
        }

        if (![1, 2, 3].includes(level)) {
            return res.status(400).json({ error: 'level must be 1, 2 or 3' });
        }

        if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
            return res.status(400).json({ error: 'topic is required' });
        }

        if (!['es', 'it'].includes(lang)) {
            return res.status(400).json({ error: 'lang must be "es" or "it"' });
        }

        const levelLabels = { 1: 'N1 — Fundamentos', 2: 'N2 — IA en la práctica', 3: 'N3 — Facilitación crítica' };

        const userMessage = [
            `Genera una actividad pedagógica para el nivel ${levelLabels[level]}.`,
            `Tema: ${topic.slice(0, 500)}`,
            objective ? `Objetivo específico: ${String(objective).slice(0, 300)}` : null,
            `Idioma de la actividad: ${lang === 'es' ? 'español' : 'italiano'}`,
        ].filter(Boolean).join('\n');

        const response = await client.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage }],
        });

        const activity = response.content[0]?.text ?? '';
        res.json({ activity });

    } catch (err) {
        next(err);
    }
});

module.exports = router;
