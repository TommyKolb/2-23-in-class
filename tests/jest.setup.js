/**
 * Keep test runs quiet: server/app log to console during tests.
 * afterEach restores silence after tests that jest.spyOn(console, ...) + mockRestore().
 */
const noop = () => {};

function silenceConsole() {
    jest.spyOn(console, "log").mockImplementation(noop);
    jest.spyOn(console, "error").mockImplementation(noop);
    jest.spyOn(console, "warn").mockImplementation(noop);
    jest.spyOn(console, "info").mockImplementation(noop);
    jest.spyOn(console, "debug").mockImplementation(noop);
}

beforeAll(() => {
    silenceConsole();
});

afterEach(() => {
    silenceConsole();
});
