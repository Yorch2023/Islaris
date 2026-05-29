// eslint.config.js — flat config for ESLint 9
'use strict';

/** Shared rules for all JS in this repo. */
const baseRules = {
    'no-console':      'warn',
    'no-unused-vars':  ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    'eqeqeq':          ['error', 'always'],
    'no-var':          'error',
    'prefer-const':    'error',
    'no-eval':         'error',
    'no-implied-eval': 'error',
};

/** Node.js / Jest globals used in the ai-layer and tests directories. */
const nodeGlobals = {
    process:       'readonly',
    require:       'readonly',
    module:        'writable',
    exports:       'writable',
    __dirname:     'readonly',
    __filename:    'readonly',
    Buffer:        'readonly',
    setTimeout:    'readonly',
    clearTimeout:  'readonly',
    setInterval:   'readonly',
    clearInterval: 'readonly',
    URL:           'readonly',
    Date:          'readonly',
};

/** Jest test globals. */
const jestGlobals = {
    describe:   'readonly',
    it:         'readonly',
    test:       'readonly',
    expect:     'readonly',
    beforeEach: 'readonly',
    afterEach:  'readonly',
    beforeAll:  'readonly',
    afterAll:   'readonly',
    jest:       'readonly',
};

/** Browser globals used in Moodle AMD modules. */
const browserGlobals = {
    window:               'readonly',
    document:             'readonly',
    fetch:                'readonly',
    ReadableStream:       'readonly',
    TextDecoder:          'readonly',
    IntersectionObserver: 'readonly',
    requestAnimationFrame:'readonly',
    Event:                'readonly',
    FormData:             'readonly',
    URL:                  'readonly',
    location:             'readonly',
};

module.exports = [
    // Ignore generated / installed directories.
    {
        ignores: ['node_modules/**', 'coverage/**'],
    },

    // ── AI middleware (Node.js CommonJS) ─────────────────────────────────────
    {
        files: ['ai-layer/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType:  'commonjs',
            globals:     { ...nodeGlobals },
        },
        rules: baseRules,
    },

    // ── Jest test suite ───────────────────────────────────────────────────────
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType:  'commonjs',
            globals:     { ...nodeGlobals, ...jestGlobals },
        },
        rules: baseRules,
    },

    // ── Moodle AMD modules (browser + AMD loader) ─────────────────────────────
    {
        files: ['moodle-plugins/**/amd/src/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType:  'script',  // AMD uses script mode (no import/export)
            globals: {
                define:  'readonly', // AMD define()
                require: 'readonly', // AMD require()
                ...browserGlobals,
            },
        },
        rules: {
            ...baseRules,
            // AMD files intentionally don't use arrow functions in define() callbacks.
            'prefer-arrow-callback': 'off',
        },
    },
];
