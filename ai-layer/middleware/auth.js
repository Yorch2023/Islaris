'use strict';

const MOODLE_SECRET = process.env.MOODLE_SECRET;

/**
 * Validates the shared secret token sent by Moodle in the Authorization header.
 * Uses constant-time comparison to prevent timing attacks.
 */
function validateMoodleToken(req, res, next) {
    if (!MOODLE_SECRET) {
        return res.status(500).json({ error: 'Middleware misconfigured: MOODLE_SECRET not set' });
    }

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token || !timingSafeEqual(token, MOODLE_SECRET)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) {
        // Prevent short-circuit; still iterate to consume constant time
        let diff = 0;
        for (let i = 0; i < b.length; i++) {
            diff |= (a.charCodeAt(i % a.length) ^ b.charCodeAt(i));
        }
        return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
    }
    return diff === 0;
}

module.exports = { validateMoodleToken };
