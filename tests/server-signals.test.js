/**
 * Covers registerSignalHandlers / startListeningServer bodies (server.js).
 */
function loadServer() {
    jest.resetModules();
    return require("../server");
}

describe("server.js registerSignalHandlers", () => {
    it("SIGINT callback closes db and exits", () => {
        const app = loadServer();
        const { db, registerSignalHandlers } = app.__aiTinderTest;
        const handlers = [];
        jest.spyOn(process, "on").mockImplementation((ev, fn) => {
            handlers.push({ ev, fn });
        });
        const exit = jest.spyOn(process, "exit").mockImplementation(() => {});
        const close = jest.spyOn(db, "close").mockImplementation(() => {});

        registerSignalHandlers();

        const sigint = handlers.find((h) => h.ev === "SIGINT");
        expect(sigint).toBeDefined();
        sigint.fn();
        expect(close).toHaveBeenCalled();
        expect(exit).toHaveBeenCalledWith(0);

        process.on.mockRestore();
        process.exit.mockRestore();
        close.mockRestore();
    });

    it("SIGTERM callback closes db and exits", () => {
        const app = loadServer();
        const { db, registerSignalHandlers } = app.__aiTinderTest;
        const handlers = [];
        jest.spyOn(process, "on").mockImplementation((ev, fn) => {
            handlers.push({ ev, fn });
        });
        const exit = jest.spyOn(process, "exit").mockImplementation(() => {});
        const close = jest.spyOn(db, "close").mockImplementation(() => {});

        registerSignalHandlers();

        const sigterm = handlers.find((h) => h.ev === "SIGTERM");
        expect(sigterm).toBeDefined();
        sigterm.fn();
        expect(close).toHaveBeenCalled();
        expect(exit).toHaveBeenCalledWith(0);

        process.on.mockRestore();
        process.exit.mockRestore();
        close.mockRestore();
    });
});

describe("server.js startListeningServer", () => {
    it("calls app.listen and runs the boot console callback", () => {
        const app = loadServer();
        const { startListeningServer } = app.__aiTinderTest;
        const listen = jest.spyOn(app, "listen").mockImplementation((port, cb) => {
            if (typeof cb === "function") {
                cb();
            }
            return { close: () => {} };
        });
        startListeningServer();
        expect(listen).toHaveBeenCalled();
        listen.mockRestore();
    });
});
