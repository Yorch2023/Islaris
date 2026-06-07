'use strict';

const rateLimit = require('express-rate-limit');

function makeLimiter(maxPerHour) {
    return rateLimit({
        windowMs: 60 * 60 * 1000,
        max: maxPerHour,
        keyGenerator: (req) => req.body?.userId || req.ip,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Rate limit exceeded. Try again later.' },
    });
}

const tutorLimiter     = makeLimiter(parseInt(process.env.RATE_LIMIT_TUTOR     || '20', 10));
const generatorLimiter = makeLimiter(parseInt(process.env.RATE_LIMIT_GENERATOR || '10', 10));
const advisorLimiter   = makeLimiter(parseInt(process.env.RATE_LIMIT_ADVISOR   || '15', 10));
const memoryLimiter    = makeLimiter(parseInt(process.env.RATE_LIMIT_MEMORY    || '20', 10));

module.exports = { tutorLimiter, generatorLimiter, advisorLimiter, memoryLimiter };
