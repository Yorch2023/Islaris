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
    path.join(__dirname, '../prompts/recommender-system.txt'),
    'utf8'
);

/**
 * POST /api/tutor/recommend
 *
 * Analyses a learner's progress and returns personalised next-step
 * recommendations without exposing raw XP thresholds to the client.
 *
 * Body:
 *   userId       {string}   Moodle user ID (for rate limiting)
 *   userName     {string}   Display name (personalisation only, not logged)
 *   level        {number}   Current itinerary level: 1, 2 or 3
 *   xp           {number}   Accumulated XP at this level
 *   evidenceCount {number}  Evidence items submitted at this level
 *   lang         {string}   'es' or 'it'
 *
 * Returns:
 *   {
 *     recommendation_type: string,
 *     message: string,
 *     suggested_activities: Array<{ title, reason, estimated_minutes }>,
 *     next_level_hint: string | null
 *   }
 */
router.post('/recommend', validateMoodleToken, tutorLimiter, async (req, res, next) => {
    try {
        const { userId, userName, level, xp, evidenceCount, lang } = req.body;

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ error: 'userId is required' });
        }

        if (![1, 2, 3].includes(level)) {
            return res.status(400).json({ error: 'level must be 1, 2 or 3' });
        }

        if (typeof xp !== 'number' || xp < 0) {
            return res.status(400).json({ error: 'xp must be a non-negative number' });
        }

        if (typeof evidenceCount !== 'number' || evidenceCount < 0) {
            return res.status(400).json({ error: 'evidenceCount must be a non-negative number' });
        }

        if (!['es', 'it'].includes(lang)) {
            return res.status(400).json({ error: 'lang must be "es" or "it"' });
        }

        const name = userName && typeof userName === 'string'
            ? userName.slice(0, 100)
            : null;

        const userMessage = [
            name ? `Nombre del participante: ${name}` : null,
            `Nivel actual: N${level}`,
            `XP acumulados en este nivel: ${xp}`,
            `Evidencias enviadas en este nivel: ${evidenceCount}`,
            `Idioma de la respuesta: ${lang === 'es' ? 'español' : 'italiano'}`,
            'Por favor, devuelve exclusivamente el JSON de recomendación.',
        ].filter(Boolean).join('\n');

        const response = await client.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 800,
            system: [
                {
                    type: 'text',
                    text: SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [{ role: 'user', content: userMessage }],
        });

        const raw = response.content[0]?.text ?? '{}';

        // Extract JSON from possible markdown code fence.
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
        let recommendation;
        try {
            recommendation = JSON.parse(jsonMatch[1].trim());
        } catch {
            return res.status(502).json({ error: 'Invalid recommendation response from AI' });
        }

        // Validate top-level shape before forwarding to client.
        const allowed = new Set(['next_activity', 'consolidation', 'level_up_ready', 'resources']);
        if (!allowed.has(recommendation.recommendation_type)) {
            recommendation.recommendation_type = 'next_activity';
        }
        if (typeof recommendation.message !== 'string') {
            recommendation.message = '';
        }
        if (!Array.isArray(recommendation.suggested_activities)) {
            recommendation.suggested_activities = [];
        }

        res.json(recommendation);

    } catch (err) {
        next(err);
    }
});

module.exports = router;
