// ESLint flat config (ESLint v9+)
export default [
    {
        // Node.js middleware and tests
        files: ['ai-layer/**/*.js', 'tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                require: 'readonly',
                module: 'writable',
                exports: 'writable',
                process: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                console: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-undef': 'error',
            'no-var': 'error',
            'prefer-const': 'error',
            eqeqeq: ['error', 'always'],
            'no-eval': 'error',
        },
    },
    {
        // Moodle AMD modules (browser environment, AMD define pattern)
        files: ['moodle-plugins/**/amd/src/*.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'script',
            globals: {
                define: 'readonly',
                require: 'readonly',
                M: 'readonly',
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                fetch: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                IntersectionObserver: 'readonly',
                requestAnimationFrame: 'readonly',
                MutationObserver: 'readonly',
                EventSource: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                $: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-undef': 'error',
            eqeqeq: ['error', 'always'],
            'no-eval': 'error',
        },
    },
    {
        // Vanilla JS files outside AMD (generator-direct.js, etc.)
        files: ['moodle-plugins/**/*.js'],
        ignores: ['moodle-plugins/**/amd/build/*.js', 'moodle-plugins/**/amd/src/*.js'],
        languageOptions: {
            ecmaVersion: 2017,
            sourceType: 'script',
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                fetch: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-undef': 'error',
            eqeqeq: ['error', 'always'],
            'no-eval': 'error',
        },
    },
    {
        // Exclude build artifacts and node_modules globally
        ignores: [
            'node_modules/**',
            'moodle-plugins/**/amd/build/**',
            'coverage/**',
        ],
    },
];
