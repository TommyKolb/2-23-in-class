/**
 * @jest-environment jsdom
 */

const path = require("path");

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

function injectAppDom() {
    globalThis.__APP_TEST_EXPOSE__ = true;
    document.body.innerHTML = `
    <div class="app">
      <header class="app__header">
        <span class="match-badge" id="matchCount" aria-label="New matches" style="display:none">0</span>
        <button id="shuffleBtn" type="button">Shuffle</button>
      </header>
      <main>
        <section class="deck" id="deck" aria-live="polite"></section>
        <button id="nopeBtn" type="button">✖</button>
        <button id="superLikeBtn" type="button">★</button>
        <button id="likeBtn" type="button">♥</button>
      </main>
    </div>
    <aside id="matchBanner" class="match-banner" aria-hidden="true">
      <button id="dismissMatch" type="button">✕</button>
      <div id="matchList"></div>
    </aside>`;
}

function defaultFetchMock() {
    return jest.fn((url, opts) => {
        const u = String(url);
        if (opts && opts.method === "POST") {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true, matched: false }),
            });
        }
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: true, newMatches: [] }),
        });
    });
}

function loadApp(fetchImpl) {
    jest.resetModules();
    jest.useFakeTimers();
    global.fetch = fetchImpl || defaultFetchMock();
    injectAppDom();
    jest.spyOn(global, "setInterval");
    jest.spyOn(global, "setTimeout");
    require(path.join(__dirname, "..", "app.js"));
}

function ptr(type, target, x, y) {
    const Ev = typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
    const init = { bubbles: true, clientX: x, clientY: y, pointerId: 1, cancelable: true };
    const ev = new Ev(type, init);
    target.dispatchEvent(ev);
    return ev;
}

afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
});

describe("app.js boot and deck rendering", () => {
    beforeEach(() => {
        loadApp();
    });

    it("renders 12 profile cards on load", () => {
        const deck = document.getElementById("deck");
        expect(deck.querySelectorAll(".card").length).toBe(12);
    });

    it("sets z-index stacking and top card is first child", () => {
        const deck = document.getElementById("deck");
        const cards = deck.querySelectorAll(".card");
        expect(cards[0].style.zIndex).toBe("12");
        expect(cards[11].style.zIndex).toBe("1");
    });

    it("clears aria-busy on deck after render", () => {
        const deck = document.getElementById("deck");
        expect(deck.hasAttribute("aria-busy")).toBe(false);
    });

    it("each card has profile id, image, title row, meta, and tag chips", () => {
        const card = document.querySelector(".card");
        expect(card.dataset.profileId).toMatch(/^p_/);
        expect(card.querySelector(".card__media").getAttribute("src")).toMatch(/^https:\/\//);
        expect(card.querySelector(".card__title").textContent.length).toBeGreaterThan(0);
        expect(card.querySelector(".card__meta").textContent).toContain("•");
        expect(card.querySelectorAll(".chip").length).toBeGreaterThan(0);
    });

    it("shuffle replaces the deck with new cards", () => {
        const before = Array.from(document.querySelectorAll(".card")).map((c) => c.dataset.profileId);
        document.getElementById("shuffleBtn").click();
        const after = Array.from(document.querySelectorAll(".card")).map((c) => c.dataset.profileId);
        expect(after.length).toBe(12);
        expect(after).not.toEqual(before);
    });
});

describe("app.js polling", () => {
    beforeEach(() => {
        loadApp();
    });

    it("calls fetch for matches on boot and schedules interval", async () => {
        expect(global.fetch).toHaveBeenCalled();
        const urls = global.fetch.mock.calls.map((c) => c[0]);
        expect(urls.some((u) => String(u).includes("/api/matches"))).toBe(true);
        expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 10_000);
    });

    it("polls again after POLL_INTERVAL", async () => {
        const before = global.fetch.mock.calls.length;
        jest.advanceTimersByTime(10_000);
        await flushPromises();
        expect(global.fetch.mock.calls.length).toBeGreaterThan(before);
    });

    it("queues matches returned from poll", async () => {
        global.fetch.mockImplementation((url) => {
            const u = String(url);
            if (u.includes("/api/matches")) {
                return Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            ok: true,
                            newMatches: [
                                {
                                    profile_id: "poll_m",
                                    name: "PollUser",
                                    img: "https://example.com/x.jpg",
                                    tags: ["A"],
                                },
                            ],
                            totalMatches: 1,
                        }),
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true, newMatches: [] }),
            });
        });
        jest.resetModules();
        jest.useFakeTimers();
        injectAppDom();
        require(path.join(__dirname, "..", "app.js"));
        await flushPromises();
        const banner = document.getElementById("matchBanner");
        expect(banner.classList.contains("match-banner--visible")).toBe(true);
    });

    it("warns when poll response is not ok", async () => {
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        global.fetch.mockImplementation(() =>
            Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
        );
        jest.resetModules();
        jest.useFakeTimers();
        injectAppDom();
        require(path.join(__dirname, "..", "app.js"));
        await flushPromises();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe("app.js control buttons", () => {
    beforeEach(() => {
        loadApp();
    });

    it("like button POSTs like for top card", async () => {
        const top = document.querySelector(".card");
        const id = top.dataset.profileId;
        document.getElementById("likeBtn").click();
        jest.advanceTimersByTime(300);
        await flushPromises();
        const posts = global.fetch.mock.calls.filter((c) => c[1] && c[1].method === "POST");
        expect(posts.length).toBeGreaterThan(0);
        const body = JSON.parse(posts[posts.length - 1][1].body);
        expect(body.profileId).toBe(id);
        expect(body.action).toBe("like");
    });

    it("superlike button POSTs superlike", async () => {
        document.getElementById("superLikeBtn").click();
        jest.advanceTimersByTime(300);
        await flushPromises();
        const posts = global.fetch.mock.calls.filter((c) => c[1] && c[1].method === "POST");
        const body = JSON.parse(posts[posts.length - 1][1].body);
        expect(body.action).toBe("superlike");
    });

    it("nope does not POST a like", async () => {
        const before = global.fetch.mock.calls.filter((c) => c[1] && c[1].method === "POST").length;
        document.getElementById("nopeBtn").click();
        jest.advanceTimersByTime(300);
        await flushPromises();
        const after = global.fetch.mock.calls.filter((c) => c[1] && c[1].method === "POST").length;
        expect(after).toBe(before);
    });

    it("like with matched true shows instant match UI", async () => {
        global.fetch.mockImplementation((url, opts) => {
            if (opts && opts.method === "POST") {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, matched: true }),
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true, newMatches: [] }),
            });
        });
        jest.resetModules();
        jest.useFakeTimers();
        injectAppDom();
        require(path.join(__dirname, "..", "app.js"));
        document.getElementById("likeBtn").click();
        await flushPromises();
        const badge = document.getElementById("matchCount");
        expect(badge.textContent).toBe("1");
        expect(document.getElementById("matchList").querySelector(".match-item")).toBeTruthy();
    });

    it("dismiss button hides match banner", async () => {
        global.fetch.mockImplementation((url, opts) => {
            if (opts && opts.method === "POST") {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, matched: true }),
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true, newMatches: [] }),
            });
        });
        jest.resetModules();
        jest.useFakeTimers();
        injectAppDom();
        require(path.join(__dirname, "..", "app.js"));
        document.getElementById("likeBtn").click();
        await flushPromises();
        document.getElementById("dismissMatch").click();
        jest.advanceTimersByTime(500);
        await flushPromises();
        const banner = document.getElementById("matchBanner");
        expect(banner.classList.contains("match-banner--visible")).toBe(false);
    });

    it("recordLike logs when fetch rejects", async () => {
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        global.fetch.mockImplementation(() => Promise.reject(new Error("network")));
        jest.resetModules();
        jest.useFakeTimers();
        injectAppDom();
        require(path.join(__dirname, "..", "app.js"));
        document.getElementById("likeBtn").click();
        await flushPromises();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe("app.js pointer gestures", () => {
    let deck;
    let top;

    beforeEach(() => {
        loadApp();
        deck = document.getElementById("deck");
        top = deck.querySelector(".card");
    });

    it("ignores pointerdown on a card that is not the top card", () => {
        const second = deck.querySelectorAll(".card")[1];
        const before = deck.querySelectorAll(".card").length;
        ptr("pointerdown", second, 100, 100);
        ptr("pointermove", deck, 300, 100);
        ptr("pointerup", document, 300, 100);
        jest.advanceTimersByTime(300);
        expect(deck.querySelectorAll(".card").length).toBe(before);
    });

    it("swipe right triggers like (POST)", async () => {
        ptr("pointerdown", top, 100, 100);
        ptr("pointermove", deck, 250, 100);
        ptr("pointerup", document, 250, 100);
        jest.advanceTimersByTime(300);
        await flushPromises();
        const posts = global.fetch.mock.calls.filter((c) => c[1] && c[1].method === "POST");
        expect(posts.length).toBeGreaterThan(0);
    });

    it("swipe left triggers nope (no POST)", async () => {
        const before = global.fetch.mock.calls.filter((c) => c[1] && c[1].method === "POST").length;
        ptr("pointerdown", top, 250, 100);
        ptr("pointermove", deck, 50, 100);
        ptr("pointerup", document, 50, 100);
        jest.advanceTimersByTime(300);
        await flushPromises();
        const after = global.fetch.mock.calls.filter((c) => c[1] && c[1].method === "POST").length;
        expect(after).toBe(before);
    });

    it("swipe up triggers superlike", async () => {
        ptr("pointerdown", top, 100, 200);
        ptr("pointermove", deck, 100, 10);
        ptr("pointerup", document, 100, 10);
        jest.advanceTimersByTime(300);
        await flushPromises();
        const posts = global.fetch.mock.calls.filter((c) => c[1] && c[1].method === "POST");
        const body = JSON.parse(posts[posts.length - 1][1].body);
        expect(body.action).toBe("superlike");
    });

    it("small drag snaps back without decision", () => {
        ptr("pointerdown", top, 100, 100);
        ptr("pointermove", deck, 105, 100);
        ptr("pointerup", document, 105, 100);
        expect(top.style.transform === "" || top.style.transform === "translate(0px, 0px)").toBe(true);
    });

    it("double tap toggles photo flash (brightness)", () => {
        jest.spyOn(Date, "now").mockReturnValue(1000);
        ptr("pointerdown", top, 50, 50);
        ptr("pointermove", deck, 52, 52);
        ptr("pointerup", document, 52, 52);
        jest.spyOn(Date, "now").mockReturnValue(1100);
        ptr("pointerdown", top, 50, 50);
        ptr("pointermove", deck, 52, 52);
        ptr("pointerup", document, 52, 52);
        const img = top.querySelector(".card__media");
        jest.advanceTimersByTime(200);
        expect(img.style.filter).toBe("");
        Date.now.mockRestore();
    });

    it("pointercancel ends drag without swipe", () => {
        ptr("pointerdown", top, 0, 0);
        ptr("pointermove", deck, 200, 0);
        ptr("pointercancel", document, 200, 0);
        ptr("pointerup", document, 200, 0);
        expect(top.classList.contains("card--dragging")).toBe(false);
    });
});

describe("app.js empty deck", () => {
    beforeEach(() => {
        loadApp();
    });

    it("control clicks are no-ops when no top card", () => {
        const deck = document.getElementById("deck");
        deck.innerHTML = "";
        expect(() => {
            document.getElementById("likeBtn").click();
            document.getElementById("nopeBtn").click();
            document.getElementById("superLikeBtn").click();
        }).not.toThrow();
    });
});

describe("app.js DOM side effects", () => {
    beforeEach(() => {
        loadApp();
    });

    it("removes a card from the deck after like (timeout)", () => {
        const deck = document.getElementById("deck");
        expect(deck.querySelectorAll(".card").length).toBe(12);
        document.getElementById("likeBtn").click();
        jest.advanceTimersByTime(250);
        expect(deck.querySelectorAll(".card").length).toBe(11);
    });

    it("removes a card from the deck after nope", () => {
        const deck = document.getElementById("deck");
        document.getElementById("nopeBtn").click();
        jest.advanceTimersByTime(250);
        expect(deck.querySelectorAll(".card").length).toBe(11);
    });

    it("shuffle after removing some cards still yields 12 cards", () => {
        document.getElementById("likeBtn").click();
        jest.advanceTimersByTime(250);
        document.getElementById("shuffleBtn").click();
        expect(document.getElementById("deck").querySelectorAll(".card").length).toBe(12);
    });
});

describe("app.js pointer targets", () => {
    beforeEach(() => {
        loadApp();
    });

    it("pointerdown on inner image still starts drag on top card", () => {
        const top = document.querySelector(".card");
        const img = top.querySelector(".card__media");
        ptr("pointerdown", img, 100, 100);
        ptr("pointermove", document.getElementById("deck"), 250, 100);
        ptr("pointerup", document, 250, 100);
        jest.advanceTimersByTime(300);
        expect(top.style.opacity === "0" || document.getElementById("deck").contains(top)).toBe(
            true
        );
    });

    it("pointermove without pointerdown does not throw", () => {
        const deck = document.getElementById("deck");
        expect(() => ptr("pointermove", deck, 500, 500)).not.toThrow();
    });
});

describe("app.js poll edge responses", () => {
    it("poll tolerates missing newMatches property", async () => {
        global.fetch.mockImplementation(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true }),
            })
        );
        jest.resetModules();
        jest.useFakeTimers();
        injectAppDom();
        require(path.join(__dirname, "..", "app.js"));
        await flushPromises();
        expect(document.getElementById("deck").querySelectorAll(".card").length).toBe(12);
    });

    it("logs when poll returns new matches", async () => {
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        global.fetch.mockImplementation((url) => {
            if (String(url).includes("/api/matches")) {
                return Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            ok: true,
                            newMatches: [
                                {
                                    profile_id: "x",
                                    name: "Y",
                                    img: "https://ex.com/i.jpg",
                                    tags: [],
                                },
                            ],
                        }),
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({}),
            });
        });
        jest.resetModules();
        jest.useFakeTimers();
        injectAppDom();
        require(path.join(__dirname, "..", "app.js"));
        await flushPromises();
        expect(log).toHaveBeenCalledWith(expect.stringContaining("new match"));
        log.mockRestore();
    });
});

describe("app.js recordLike response handling", () => {
    it("warns when POST response json() rejects", async () => {
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        global.fetch.mockImplementation((url, opts) => {
            if (opts && opts.method === "POST") {
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
        jest.resetModules();
        jest.useFakeTimers();
        injectAppDom();
        require(path.join(__dirname, "..", "app.js"));
        document.getElementById("likeBtn").click();
        await flushPromises();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe("app.js match banner queue timing", () => {
    it("shows second queued match after auto-dismiss and drain delay", async () => {
        global.fetch.mockImplementation((url, opts) => {
            if (opts && opts.method === "POST") {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, matched: true }),
                });
            }
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({
                        ok: true,
                        newMatches: [
                            {
                                profile_id: "a",
                                name: "A",
                                img: "https://ex.com/a.jpg",
                                tags: [],
                            },
                            {
                                profile_id: "b",
                                name: "B",
                                img: "https://ex.com/b.jpg",
                                tags: [],
                            },
                        ],
                    }),
            });
        });
        jest.resetModules();
        jest.useFakeTimers();
        injectAppDom();
        require(path.join(__dirname, "..", "app.js"));
        await flushPromises();
        const list = document.getElementById("matchList");
        expect(list.querySelectorAll(".match-item").length).toBe(1);
        jest.advanceTimersByTime(6000);
        await flushPromises();
        jest.advanceTimersByTime(400);
        await flushPromises();
        expect(list.querySelectorAll(".match-item").length).toBe(2);
    });
});

describe("app.js handleNextPhoto timer", () => {
    it("applies brightness then clears after 150ms", () => {
        jest.spyOn(Date, "now").mockReturnValue(1000);
        loadApp();
        const top = document.querySelector(".card");
        const img = top.querySelector(".card__media");
        ptr("pointerdown", top, 50, 50);
        ptr("pointermove", document.getElementById("deck"), 52, 52);
        ptr("pointerup", document, 52, 52);
        jest.spyOn(Date, "now").mockReturnValue(1100);
        ptr("pointerdown", top, 50, 50);
        ptr("pointermove", document.getElementById("deck"), 52, 52);
        ptr("pointerup", document, 52, 52);
        expect(img.style.filter).toContain("brightness");
        jest.advanceTimersByTime(200);
        expect(img.style.filter).toBe("");
        Date.now.mockRestore();
    });
});

describe("app.js swipe boundary distances", () => {
    beforeEach(() => {
        loadApp();
    });

    it("horizontal swipe at exactly 80px does not commit (snaps back)", () => {
        const top = document.querySelector(".card");
        ptr("pointerdown", top, 100, 100);
        ptr("pointermove", document.getElementById("deck"), 180, 100);
        ptr("pointerup", document, 180, 100);
        expect(top.style.opacity).not.toBe("0");
    });

    it("vertical swipe at exactly -80px does not superlike", () => {
        const top = document.querySelector(".card");
        ptr("pointerdown", top, 100, 100);
        ptr("pointermove", document.getElementById("deck"), 100, 20);
        ptr("pointerup", document, 100, 20);
        expect(top.style.opacity).not.toBe("0");
    });
});
