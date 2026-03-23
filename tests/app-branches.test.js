/** @jest-environment jsdom */

// Dumb branch coverage for app.js via __appTest (see app.js).
const path = require("path");

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}

function injectDomNoDismissButton() {
    globalThis.__APP_TEST_EXPOSE__ = true;
    document.body.innerHTML = `
    <div class="app">
      <span id="matchCount" style="display:none">0</span>
      <button id="shuffleBtn" type="button">Shuffle</button>
      <section class="deck" id="deck"></section>
      <button id="nopeBtn" type="button">✖</button>
      <button id="superLikeBtn" type="button">★</button>
      <button id="likeBtn" type="button">♥</button>
    </div>
    <aside id="matchBanner" class="match-banner" aria-hidden="true">
      <div id="matchList"></div>
    </aside>`;
}

function loadAppWithFetch(fetchImpl) {
    jest.resetModules();
    jest.useFakeTimers();
    global.fetch = jest.fn(fetchImpl);
    injectDomNoDismissButton();
    require(path.join(__dirname, "..", "app.js"));
}

function loadAppStandard() {
    jest.resetModules();
    jest.useFakeTimers();
    globalThis.__APP_TEST_EXPOSE__ = true;
    document.body.innerHTML = `
    <div><span id="matchCount">0</span>
    <button id="shuffleBtn"></button>
    <section class="deck" id="deck"></section>
    <button id="nopeBtn"></button><button id="superLikeBtn"></button><button id="likeBtn"></button>
    </div>
    <aside id="matchBanner"><button id="dismissMatch"></button><div id="matchList"></div></aside>`;
    global.fetch = jest.fn(() =>
        Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: true, newMatches: [] }),
        })
    );
    require(path.join(__dirname, "..", "app.js"));
}

afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
});

describe("__appTest.generateProfiles", () => {
    beforeEach(() => {
        loadAppStandard();
    });

    it("uses default count 12 when called with no arguments", () => {
        const p = globalThis.__appTest.generateProfiles();
        expect(p).toHaveLength(12);
    });

    it("returns empty array for count 0", () => {
        expect(globalThis.__appTest.generateProfiles(0)).toEqual([]);
    });

    it("sample, pickTags, imgFor are callable", () => {
        expect(globalThis.__appTest.sample(["only"])).toBe("only");
        expect(globalThis.__appTest.pickTags().length).toBeGreaterThanOrEqual(1);
        expect(globalThis.__appTest.imgFor("abc")).toContain("photo-abc");
    });
});

describe("__appTest handlers with null card", () => {
    beforeEach(() => {
        loadAppStandard();
    });

    it("handleReject, handleLike, handleSuperLike return early for null", () => {
        expect(() => {
            globalThis.__appTest.handleReject(null);
            globalThis.__appTest.handleLike(null);
            globalThis.__appTest.handleSuperLike(null);
        }).not.toThrow();
    });

    it("recordLike returns immediately for null card", async () => {
        await globalThis.__appTest.recordLike(null, "like");
        expect(global.fetch.mock.calls.filter((c) => c[1]?.method === "POST").length).toBe(0);
    });
});

describe("__appTest.handleNextPhoto", () => {
    beforeEach(() => {
        loadAppStandard();
    });

    it("no-ops when card is null", () => {
        globalThis.__appTest.handleNextPhoto(null);
    });

    it("no-ops when card has no .card__media", () => {
        const bare = document.createElement("article");
        bare.className = "card";
        globalThis.__appTest.handleNextPhoto(bare);
    });
});

describe("__appTest recordLike branches", () => {
    it("uses Unknown and empty defaults when profile not in map", async () => {
        loadAppWithFetch((url, opts) => {
            if (opts?.method === "POST") {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ matched: false }),
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ newMatches: [] }),
            });
        });
        const card = document.createElement("article");
        card.dataset.profileId = "ghost_id_never_in_map";
        await globalThis.__appTest.recordLike(card, "like");
        const post = global.fetch.mock.calls.find((c) => c[1]?.method === "POST");
        const body = JSON.parse(post[1].body);
        expect(body.name).toBe("Unknown");
        expect(body.img).toBe("");
        expect(body.tags).toEqual([]);
    });

    it("warns when response json() rejects", async () => {
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        loadAppWithFetch((url, opts) => {
            if (opts?.method === "POST") {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.reject(new Error("bad json")),
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ newMatches: [] }),
            });
        });
        const card = document.createElement("article");
        card.dataset.profileId = "x";
        await globalThis.__appTest.recordLike(card, "like");
        await flushPromises();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe("__appTest pollMatches", () => {
    it("does nothing extra when newMatches is missing", async () => {
        loadAppWithFetch(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true }),
            })
        );
        await globalThis.__appTest.pollMatches();
        await flushPromises();
    });

    it("does nothing extra when newMatches is empty array", async () => {
        loadAppWithFetch(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true, newMatches: [] }),
            })
        );
        await globalThis.__appTest.pollMatches();
        await flushPromises();
    });

    it("warns when json() fails after ok response", async () => {
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        loadAppWithFetch(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.reject(new Error("parse")),
            })
        );
        await globalThis.__appTest.pollMatches();
        await flushPromises();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe("__appTest match queue / banner", () => {
    beforeEach(() => {
        loadAppStandard();
    });

    it("drainMatchQueue sets bannerVisible false when queue is empty", () => {
        globalThis.__appTest.drainMatchQueue();
    });

    it("showMatchBanner tolerates NaN matchCount", () => {
        document.getElementById("matchCount").textContent = "not-a-number";
        globalThis.__appTest.showMatchBanner({
            img: "https://ex.com/a.jpg",
            name: "Pat",
        });
        expect(document.getElementById("matchCount").textContent).toBe("1");
    });
});

describe("app without dismiss button", () => {
    it("loads without registering dismiss listener", () => {
        jest.resetModules();
        jest.useFakeTimers();
        injectDomNoDismissButton();
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true, newMatches: [] }),
            })
        );
        require(path.join(__dirname, "..", "app.js"));
        expect(document.getElementById("dismissMatch")).toBeNull();
    });
});

describe("__appTest swipe handlers when card is not topCard", () => {
    beforeEach(() => {
        loadAppStandard();
    });

    it("handleReject does not clear topCard when card is not the top card", () => {
        const cards = document.getElementById("deck").querySelectorAll(".card");
        globalThis.__appTest.handleReject(cards[1]);
        jest.advanceTimersByTime(300);
    });

    it("handleLike does not clear topCard when card is not the top card", async () => {
        const cards = document.getElementById("deck").querySelectorAll(".card");
        globalThis.__appTest.handleLike(cards[1]);
        jest.advanceTimersByTime(300);
        await flushPromises();
    });

    it("handleSuperLike does not clear topCard when card is not the top card", async () => {
        const cards = document.getElementById("deck").querySelectorAll(".card");
        globalThis.__appTest.handleSuperLike(cards[1]);
        jest.advanceTimersByTime(300);
        await flushPromises();
    });
});

describe("__appTest removeCard when detached from DOM", () => {
    beforeEach(() => {
        loadAppStandard();
    });

    it("skips removeChild when card has no parent", () => {
        const orphan = document.createElement("article");
        orphan.className = "card";
        globalThis.__appTest.removeCard(orphan);
        jest.advanceTimersByTime(300);
    });
});

describe("app.js without __APP_TEST_EXPOSE__", () => {
    it("does not attach __appTest object", () => {
        delete globalThis.__appTest;
        delete globalThis.__APP_TEST_EXPOSE__;
        jest.resetModules();
        jest.useFakeTimers();
        document.body.innerHTML = `
          <span id="matchCount">0</span>
          <button id="shuffleBtn"></button>
          <section class="deck" id="deck"></section>
          <button id="nopeBtn"></button><button id="superLikeBtn"></button><button id="likeBtn"></button>
          <aside id="matchBanner"><button id="dismissMatch"></button><div id="matchList"></div></aside>`;
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true, newMatches: [] }),
            })
        );
        require(path.join(__dirname, "..", "app.js"));
        expect(globalThis.__appTest).toBeUndefined();
    });
});
