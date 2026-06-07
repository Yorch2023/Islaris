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

function buildSystemText(level, lang, learnerMemory, diagnosticProfile) {
    let text = `Nivel actual del usuario: ${LEVEL_LABELS[level]}\n`
             + `Idioma de respuesta: ${lang === 'es' ? 'español' : 'italiano'}`;

    if (learnerMemory && typeof learnerMemory === 'object') {
        const m = learnerMemory;
        const lines = [];

        if (Array.isArray(m.concepts_explored) && m.concepts_explored.length) {
            lines.push(`Temas ya trabajados con este alumno: ${m.concepts_explored.slice(0, 8).join(', ')}`);
        }
        if (m.mastery && Object.keys(m.mastery).length) {
            const masteryLines = Object.entries(m.mastery)
                .slice(0, 6)
                .map(([k, v]) => `${k} (nivel ${v}/3)`)
                .join(', ');
            lines.push(`Nivel de comprensión por concepto: ${masteryLines}`);
        }
        if (m.strengths) {
            lines.push(`Puntos fuertes del alumno: ${String(m.strengths).slice(0, 200)}`);
        }
        if (m.growth_areas) {
            lines.push(`Áreas donde necesita más apoyo: ${String(m.growth_areas).slice(0, 200)}`);
        }
        if (m.context) {
            lines.push(`Contexto profesional relevante: ${String(m.context).slice(0, 200)}`);
        }
        if (m.learning_style && m.learning_style !== 'mixed') {
            const styleLabels = {
                concrete_examples: 'prefiere ejemplos concretos',
                questions:         'aprende mejor haciendo preguntas',
                definitions:       'prefiere definiciones precisas',
                analogies:         'conecta mejor con analogías',
            };
            lines.push(`Estilo de aprendizaje: ${styleLabels[m.learning_style] || m.learning_style}`);
        }
        if (Array.isArray(m.recurring_questions) && m.recurring_questions.length) {
            lines.push(`Dudas recurrentes: ${m.recurring_questions.slice(0, 3).join('; ')}`);
        }
        if (m.sessions_total > 1) {
            lines.push(`Sesiones previas: ${m.sessions_total}`);
        }

        if (lines.length) {
            text += '\n\n## Perfil de aprendizaje del alumno (datos de sesiones anteriores)\n'
                  + lines.map(l => `- ${l}`).join('\n')
                  + '\n\nUsa este perfil para personalizar tus respuestas: conecta nuevos conceptos con los que ya conoce, '
                  + 'evita repasar lo que ya domina, refuerza las áreas de crecimiento. '
                  + 'No menciones explícitamente que tienes este perfil a menos que el alumno lo pregunte.';
        }
    }

    // Sector adaptation from onboarding diagnostic profile.
    if (diagnosticProfile && typeof diagnosticProfile === 'object') {
        const dp = diagnosticProfile;
        const sectorLines = [];

        const employmentMap = {
            education:    lang === 'it' ? 'lavora nel settore dell\'istruzione'      : 'trabaja en el sector educativo',
            professional: lang === 'it' ? 'lavora in un altro settore professionale' : 'trabaja en otro sector profesional',
            job_seeker:   lang === 'it' ? 'è in cerca di lavoro o si sta riqualificando' : 'busca empleo o está en proceso de reorientación profesional',
            retired:      lang === 'it' ? 'è in pensione o in aspettativa'           : 'está jubilado/a o en excedencia',
        };

        const goalMap = {
            understand:  lang === 'it' ? 'comprendere l\'IA'              : 'comprender la IA',
            protect:     lang === 'it' ? 'proteggersi dai rischi dell\'IA' : 'protegerse de los riesgos de la IA',
            work_tools:  lang === 'it' ? 'usare l\'IA nel lavoro'          : 'usar la IA en su trabajo',
            teach_others:lang === 'it' ? 'insegnare l\'IA ad altri'        : 'enseñar IA a otras personas',
        };

        const sectorExamples = {
            education:    lang === 'it'
                ? 'Usa esempi del settore educativo: strumenti IA per docenti, valutazione automatica, personalizzazione dell\'apprendimento, chatbot per studenti, bias nei sistemi di valutazione.'
                : 'Usa ejemplos del sector educativo: herramientas IA para docentes, evaluación automatizada, personalización del aprendizaje, chatbots para estudiantes, sesgos en sistemas de calificación.',
            professional: lang === 'it'
                ? 'Usa esempi pratici del mondo del lavoro: automazione di processi, IA nelle decisioni HR, assistenti virtuali, analisi predittiva, compliance AI Act per le imprese.'
                : 'Usa ejemplos prácticos del mundo laboral: automatización de procesos, IA en decisiones de RRHH, asistentes virtuales, analítica predictiva, cumplimiento del AI Act en empresas.',
            job_seeker:   lang === 'it'
                ? 'Connetti l\'IA alle opportunità di lavoro: competenze digitali richieste, come l\'IA trasforma le professioni, come usare l\'IA per cercare lavoro, competenze che gli algoritmi non possono sostituire.'
                : 'Conecta la IA con las oportunidades laborales: qué competencias digitales demanda el mercado, cómo la IA transforma las profesiones, cómo usar IA para buscar empleo, competencias que los algoritmos no reemplazan.',
            retired:      lang === 'it'
                ? 'Usa esempi della vita quotidiana: assistenti vocali, sistemi di raccomandazione, riconoscimento facciale, privacy e diritti digitali, come rimanere informati senza essere sopraffatti.'
                : 'Usa ejemplos de la vida cotidiana: asistentes de voz, sistemas de recomendación, reconocimiento facial, privacidad y derechos digitales, cómo mantenerse informado sin abrumarse.',
        };

        if (dp.employment && employmentMap[dp.employment]) {
            sectorLines.push((lang === 'it' ? 'Situazione lavorativa: ' : 'Situación laboral: ') + employmentMap[dp.employment]);
        }
        if (Array.isArray(dp.goals) && dp.goals.length) {
            const goalStr = dp.goals.map(g => goalMap[g]).filter(Boolean).join(', ');
            if (goalStr) sectorLines.push((lang === 'it' ? 'Obiettivi: ' : 'Objetivos: ') + goalStr);
        }
        if (dp.employment && sectorExamples[dp.employment]) {
            sectorLines.push(sectorExamples[dp.employment]);
        }

        if (sectorLines.length) {
            const header = lang === 'it'
                ? '\n\n## Contesto professionale del discente\n'
                : '\n\n## Contexto profesional del aprendiz\n';
            text += header + sectorLines.map(l => `- ${l}`).join('\n');
        }
    }

    return text;
}

function sanitize(messages) {
    return messages
        .slice(-MAX_MESSAGES)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: String(m.content).slice(0, MAX_MESSAGE_LENGTH) }));
}

function validateBody(body, res) {
    const { userId, level, lang, messages, learnerMemory } = body;
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

        const { level, lang, messages, learnerMemory, diagnosticProfile } = req.body;
        const sanitized = sanitize(messages);

        if (!sanitized.length || sanitized.at(-1).role !== 'user')
            return res.status(400).json({ error: 'Last message must be from the user' });

        const reply = await callAI(buildSystemText(level, lang, learnerMemory, diagnosticProfile), sanitized);
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

        const { level, lang, messages, learnerMemory, diagnosticProfile } = req.body;
        const sanitized = sanitize(messages);

        if (!sanitized.length || sanitized.at(-1).role !== 'user')
            return res.status(400).json({ error: 'Last message must be from the user' });

        // For simplicity, SSE path calls the same non-streaming AI and wraps in SSE format.
        const reply = await callAI(buildSystemText(level, lang, learnerMemory, diagnosticProfile), sanitized);

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
