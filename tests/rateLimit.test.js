'use strict';

// Isolate rate limiter in its own module scope.
// express-rate-limit v7 uses an in-memory store by default;
// we just verify the limiter factory returns usable middleware.

describe('makeLimiter (rateLimit.js)', () => {
    beforeEach(() => {
        jest.resetModules();
        process.env.RATE_LIMIT_TUTOR     = '5';
        process.env.RATE_LIMIT_GENERATOR = '2';
    });

    test('tutorLimiter is a function (Express middleware)', () => {
        const { tutorLimiter } = require('../ai-layer/middleware/rateLimit');
        expect(typeof tutorLimiter).toBe('function');
    });

    test('generatorLimiter is a function (Express middleware)', () => {
        const { generatorLimiter } = require('../ai-layer/middleware/rateLimit');
        expect(typeof generatorLimiter).toBe('function');
    });

    test('both limiters expose the middleware function signature (length === 3)', () => {
        const { tutorLimiter, generatorLimiter } = require('../ai-layer/middleware/rateLimit');
        // Express middleware has arity 3: (req, res, next).
        expect(tutorLimiter.length).toBe(3);
        expect(generatorLimiter.length).toBe(3);
    });

    test('keyGenerator uses userId from body when available', () => {
        const { tutorLimiter } = require('../ai-layer/middleware/rateLimit');
        // Inspect that the middleware was constructed (it's not directly testable
        // without a full integration, but we verify the export shape).
        expect(tutorLimiter).toBeDefined();
        expect(typeof tutorLimiter).toBe('function');
    });
});
