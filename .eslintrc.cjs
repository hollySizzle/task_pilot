module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    env: {
        es2022: true,
        node: true,
        mocha: true
    },
    ignorePatterns: [
        'out/**',
        'dist/**',
        'node_modules/**',
        '.vscode-test/**',
        'coverage/**',
        '.jest_output/**'
    ],
    rules: {
    }
};
