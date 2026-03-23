/** @type {import("jest").Config} */
module.exports = {
    roots: ["<rootDir>/tests"],
    testMatch: ["**/*.test.js"],
    testEnvironment: "node",
    testTimeout: 60_000,
    silent: true,
    setupFilesAfterEnv: ["<rootDir>/tests/jest.setup.js"],

    collectCoverageFrom: [
        "server.js",
        "app.js",
        "data.mjs",
    ],
    coverageDirectory: "coverage",
    coverageReporters: ["text", "text-summary", "lcov", "html"],
};
