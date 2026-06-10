'use strict';

// Set a known secret before requiring the module.
process.env.MOODLE_SECRET = 'test-secret-abc123';

const { validateMoodleToken } = require('../ai-layer/middleware/auth');

function makeReqRes(authHeader) {
    const req = { headers: { authorization: authHeader } };
    const res = {
        _status: null,
        _json: null,
        status(code) { this._status = code; return this; },
        json(data)   { this._json = data; return this; },
    };
    return { req, res };
}

describe('validateMoodleToken', () => {
    test('accepts a correct Bearer token', () => {
        const { req, res } = makeReqRes('Bearer test-secret-abc123');
        const next = jest.fn();
        validateMoodleToken(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res._status).toBeNull();
    });

    test('rejects a wrong token', () => {
        const { req, res } = makeReqRes('Bearer wrong-token');
        const next = jest.fn();
        validateMoodleToken(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res._status).toBe(401);
    });

    test('rejects a missing Authorization header', () => {
        const { req, res } = makeReqRes(undefined);
        const next = jest.fn();
        validateMoodleToken(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res._status).toBe(401);
    });

    test('rejects a token without Bearer prefix', () => {
        const { req, res } = makeReqRes('test-secret-abc123');
        const next = jest.fn();
        validateMoodleToken(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res._status).toBe(401);
    });
});
