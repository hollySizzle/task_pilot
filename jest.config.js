/**
 * Jest configuration for Webview JavaScript tests
 */
module.exports = {
    testEnvironment: 'jsdom',
    testMatch: ['**/media/__tests__/**/*.test.js'],
    modulePathIgnorePatterns: [
        '<rootDir>/.vscode-test/',
        '<rootDir>/node_modules/',
        '<rootDir>/out/',
        '<rootDir>/dist/'
    ],
    collectCoverageFrom: [
        'media/**/*.js',
        '!media/__tests__/**'
    ],
    coverageDirectory: 'coverage/webview',
    coverageReporters: ['text', 'html', 'lcov'],
    verbose: true
};
