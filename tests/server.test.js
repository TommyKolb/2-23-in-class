/**
 * Exhaustive HTTP + direct-helper tests for server.js (fresh in-memory DB per test).
 */
const request = require("supertest");

function loadServer() {
    jest.resetModules();
    return require("../server");
}

describe("POST /api/likes", () => {
    let app;

    beforeEach(() => {
        app = loadServer();
    });

    it("returns 201 for action like with all optional fields", async () => {
        const res = await request(app)
            .post("/api/likes")
            .send({
                profileId: "p_like_full",
                name: "Alex",
                action: "like",
                img: "https://example.com/a.jpg",
                tags: ["Coffee", "Hiking"],
            })
            .expect(201);
        expect(res.body).toMatchObject({
            ok: true,
            profileId: "p_like_full",
            action: "like",
        });
        expect(typeof res.body.matched).toBe("boolean");
    });

    it("returns 201 for action superlike", async () => {
        const res = await request(app)
            .post("/api/likes")
            .send({
                profileId: "p_super",
                name: "Sam",
                action: "superlike",
                img: "",
                tags: [],
            })
            .expect(201);
        expect(res.body.action).toBe("superlike");
        expect(res.body.ok).toBe(true);
    });

    it("defaults missing name to Unknown", async () => {
        await request(app)
            .post("/api/likes")
            .send({ profileId: "p_noname", action: "like" })
            .expect(201);
        const likes = await request(app).get("/api/likes").expect(200);
        const row = likes.body.likes.find((l) => l.profile_id === "p_noname");
        expect(row.name).toBe("Unknown");
    });

    it("defaults missing img and tags", async () => {
        await request(app)
            .post("/api/likes")
            .send({ profileId: "p_defaults", name: "X", action: "like" })
            .expect(201);
        const likes = await request(app).get("/api/likes").expect(200);
        const row = likes.body.likes.find((l) => l.profile_id === "p_defaults");
        expect(row.img).toBe("");
        expect(row.tags).toEqual([]);
    });

    it("returns 400 when profileId is missing", async () => {
        const res = await request(app)
            .post("/api/likes")
            .send({ name: "A", action: "like" })
            .expect(400);
        expect(res.body.error).toBeDefined();
    });

    it("returns 400 when profileId is empty string", async () => {
        await request(app)
            .post("/api/likes")
            .send({ profileId: "", action: "like" })
            .expect(400);
    });

    it("returns 400 when action is missing", async () => {
        await request(app)
            .post("/api/likes")
            .send({ profileId: "x" })
            .expect(400);
    });

    it("returns 400 when action is invalid string", async () => {
        await request(app)
            .post("/api/likes")
            .send({ profileId: "x", action: "swipe" })
            .expect(400);
    });

    it("returns 400 when action is like with wrong casing", async () => {
        await request(app)
            .post("/api/likes")
            .send({ profileId: "x", action: "Like" })
            .expect(400);
    });

    it("returns 400 when body is null/empty object", async () => {
        await request(app).post("/api/likes").send({}).expect(400);
    });

    it("returns 400 when JSON body is omitted (req.body undefined)", async () => {
        const res = await request(app).post("/api/likes").expect(400);
        expect(res.body.error).toBeDefined();
    });

    it("upserts same profileId (INSERT OR REPLACE) and keeps latest fields", async () => {
        await request(app)
            .post("/api/likes")
            .send({ profileId: "dup", name: "First", action: "like", tags: ["A"] })
            .expect(201);
        await request(app)
            .post("/api/likes")
            .send({ profileId: "dup", name: "Second", action: "superlike", tags: ["B"] })
            .expect(201);
        const likes = await request(app).get("/api/likes").expect(200);
        const row = likes.body.likes.find((l) => l.profile_id === "dup");
        expect(row.name).toBe("Second");
        expect(row.action).toBe("superlike");
        expect(row.tags).toEqual(["B"]);
    });

    it("persists tags as JSON round-trip", async () => {
        const tags = ["Coffee", "Tech", "Books", "Art"];
        await request(app)
            .post("/api/likes")
            .send({ profileId: "tags_rt", name: "T", action: "like", tags })
            .expect(201);
        const likes = await request(app).get("/api/likes").expect(200);
        const row = likes.body.likes.find((l) => l.profile_id === "tags_rt");
        expect(row.tags).toEqual(tags);
    });

    it("when Math.random yields match, returns matched true and creates match row", async () => {
        jest.spyOn(Math, "random").mockReturnValue(0.01);
        app = loadServer();
        const res = await request(app)
            .post("/api/likes")
            .send({ profileId: "match_rand", name: "M", action: "like" })
            .expect(201);
        expect(res.body.matched).toBe(true);
        const all = await request(app).get("/api/matches?all=true").expect(200);
        expect(all.body.newMatches.some((m) => m.profile_id === "match_rand")).toBe(true);
        jest.restoreAllMocks();
    });

    it("when Math.random yields no match, matched is false", async () => {
        jest.spyOn(Math, "random").mockReturnValue(0.99);
        app = loadServer();
        const res = await request(app)
            .post("/api/likes")
            .send({ profileId: "no_match_rand", name: "N", action: "like" })
            .expect(201);
        expect(res.body.matched).toBe(false);
        jest.restoreAllMocks();
    });

    it("does not create duplicate match for same profileId if match already exists", async () => {
        jest.spyOn(Math, "random").mockReturnValue(0.01);
        app = loadServer();
        const { db } = app.__aiTinderTest;
        db.prepare(
            `INSERT OR IGNORE INTO matches (profile_id, name, action, img, tags, delivered)
       VALUES (?, ?, ?, ?, ?, 0)`
        ).run("existing_m", "E", "like", "", "[]");
        const res = await request(app)
            .post("/api/likes")
            .send({ profileId: "existing_m", name: "E", action: "like" })
            .expect(201);
        expect(res.body.matched).toBe(false);
        const cnt = db.prepare(`SELECT COUNT(*) AS c FROM matches WHERE profile_id = ?`).get(
            "existing_m"
        );
        expect(cnt.c).toBe(1);
        jest.restoreAllMocks();
    });
});

describe("GET /api/matches", () => {
    let app;

    beforeEach(() => {
        app = loadServer();
    });

    it("returns ok, newMatches array, totalMatches number", async () => {
        const res = await request(app).get("/api/matches").expect(200);
        expect(res.body.ok).toBe(true);
        expect(Array.isArray(res.body.newMatches)).toBe(true);
        expect(typeof res.body.totalMatches).toBe("number");
    });

    it("returns undelivered matches only on default poll and marks them delivered", async () => {
        const { db } = app.__aiTinderTest;
        db.prepare(
            `INSERT OR IGNORE INTO matches (profile_id, name, action, img, tags, delivered)
       VALUES (?, ?, ?, ?, ?, 0)`
        ).run("nd1", "A", "like", "", "[]");

        const first = await request(app).get("/api/matches").expect(200);
        expect(first.body.newMatches.length).toBe(1);
        expect(first.body.newMatches[0].profile_id).toBe("nd1");
        expect(first.body.newMatches[0].tags).toEqual([]);

        const second = await request(app).get("/api/matches").expect(200);
        expect(second.body.newMatches.length).toBe(0);
    });

    it("?all=true returns all matches and does not mark delivered", async () => {
        const { db } = app.__aiTinderTest;
        db.prepare(
            `INSERT OR IGNORE INTO matches (profile_id, name, action, img, tags, delivered)
       VALUES (?, ?, ?, ?, ?, 0)`
        ).run("all1", "X", "like", "", "[]");

        const poll = await request(app).get("/api/matches").expect(200);
        expect(poll.body.newMatches.length).toBe(1);

        const all = await request(app).get("/api/matches?all=true").expect(200);
        expect(all.body.newMatches.some((m) => m.profile_id === "all1")).toBe(true);
        const row = db.prepare(`SELECT delivered FROM matches WHERE profile_id = ?`).get("all1");
        expect(row.delivered).toBe(1);
    });

    it("orders new matches by matched_at ASC", async () => {
        const { db } = app.__aiTinderTest;
        db.exec(`INSERT INTO matches (profile_id, name, action, img, tags, delivered, matched_at)
      VALUES ('o1', 'a', 'like', '', '[]', 0, '2020-01-01'),
             ('o2', 'b', 'like', '', '[]', 0, '2019-01-01');`);
        const res = await request(app).get("/api/matches").expect(200);
        expect(res.body.newMatches.map((m) => m.profile_id)).toEqual(["o2", "o1"]);
    });

    it("hydrates tags from JSON in match rows", async () => {
        const { db } = app.__aiTinderTest;
        db.prepare(
            `INSERT OR IGNORE INTO matches (profile_id, name, action, img, tags, delivered)
       VALUES (?, ?, ?, ?, ?, 0)`
        ).run("ht", "H", "like", "", JSON.stringify(["Z"]));

        const res = await request(app).get("/api/matches").expect(200);
        expect(res.body.newMatches[0].tags).toEqual(["Z"]);
    });
});

describe("GET /api/likes", () => {
    let app;

    beforeEach(() => {
        app = loadServer();
    });

    it("returns empty likes initially", async () => {
        const res = await request(app).get("/api/likes").expect(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.count).toBe(0);
        expect(res.body.likes).toEqual([]);
    });

    it("returns likes ordered by created_at DESC", async () => {
        const { db } = app.__aiTinderTest;
        db.prepare(
            `INSERT OR REPLACE INTO likes (profile_id, name, action, img, tags, created_at)
       VALUES ('l1', 'First', 'like', '', '[]', '2020-01-01 00:00:00')`
        ).run();
        db.prepare(
            `INSERT OR REPLACE INTO likes (profile_id, name, action, img, tags, created_at)
       VALUES ('l2', 'Second', 'like', '', '[]', '2021-06-01 00:00:00')`
        ).run();
        const res = await request(app).get("/api/likes").expect(200);
        expect(res.body.likes[0].profile_id).toBe("l2");
        expect(res.body.likes[1].profile_id).toBe("l1");
    });
});

describe("DELETE /api/likes/:id", () => {
    let app;

    beforeEach(() => {
        app = loadServer();
    });

    it("returns removed false when id did not exist", async () => {
        const res = await request(app).delete("/api/likes/ghost").expect(200);
        expect(res.body).toEqual({ ok: true, removed: false });
    });

    it("deletes like and associated match", async () => {
        await request(app)
            .post("/api/likes")
            .send({ profileId: "del1", name: "D", action: "like" })
            .expect(201);
        const { db } = app.__aiTinderTest;
        db.prepare(
            `INSERT OR IGNORE INTO matches (profile_id, name, action, img, tags, delivered)
       VALUES (?, ?, ?, ?, ?, 0)`
        ).run("del1", "D", "like", "", "[]");

        const res = await request(app).delete("/api/likes/del1").expect(200);
        expect(res.body.removed).toBe(true);
        const like = db.prepare(`SELECT 1 FROM likes WHERE profile_id = ?`).get("del1");
        const match = db.prepare(`SELECT 1 FROM matches WHERE profile_id = ?`).get("del1");
        expect(like).toBeUndefined();
        expect(match).toBeUndefined();
    });
});

describe("Static files", () => {
    let app;

    beforeEach(() => {
        app = loadServer();
    });

    it("serves index.html at /", async () => {
        const res = await request(app).get("/").expect(200);
        expect(res.text).toContain("AI Tinder");
    });

    it("serves app.js", async () => {
        const res = await request(app).get("/app.js").expect(200);
        expect(res.text).toContain("generateProfiles");
    });

    it("serves styles.css", async () => {
        await request(app).get("/styles.css").expect(200);
    });

    it("returns 404 for unknown paths", async () => {
        await request(app).get("/this-route-does-not-exist-12345").expect(404);
    });
});

describe("CORS / OPTIONS", () => {
    let app;

    beforeEach(() => {
        app = loadServer();
    });

    it("responds to OPTIONS preflight for /api/likes", async () => {
        const res = await request(app)
            .options("/api/likes")
            .set("Origin", "http://example.com")
            .set("Access-Control-Request-Method", "POST");
        expect(res.status).toBe(204);
    });
});

describe("Malformed JSON body", () => {
    let app;

    beforeEach(() => {
        app = loadServer();
    });

    it("rejects invalid JSON for POST /api/likes", async () => {
        await request(app)
            .post("/api/likes")
            .set("Content-Type", "application/json")
            .send("{ not json")
            .expect((res) => {
                expect(res.status).toBeGreaterThanOrEqual(400);
            });
    });
});

describe("__aiTinderTest.hydrateRow", () => {
    let hydrateRow;

    beforeEach(() => {
        const srv = loadServer();
        hydrateRow = srv.__aiTinderTest.hydrateRow;
    });

    it("returns null for null/undefined row", () => {
        expect(hydrateRow(null)).toBeNull();
        expect(hydrateRow(undefined)).toBeNull();
    });

    it("parses tags JSON string to array", () => {
        const row = { profile_id: "a", tags: '["x","y"]', name: "n" };
        expect(hydrateRow(row).tags).toEqual(["x", "y"]);
    });

    it("defaults missing tags to empty array", () => {
        const row = { profile_id: "a", name: "n" };
        expect(hydrateRow(row).tags).toEqual([]);
    });

    it("throws on invalid JSON in tags (current implementation)", () => {
        const row = { profile_id: "a", tags: "not-json", name: "n" };
        expect(() => hydrateRow(row)).toThrow();
    });
});

describe("__aiTinderTest.saveLikeAndTryMatch", () => {
    let saveLikeAndTryMatch;
    let db;

    beforeEach(() => {
        jest.spyOn(Math, "random").mockReturnValue(0.5);
        const srv = loadServer();
        saveLikeAndTryMatch = srv.__aiTinderTest.saveLikeAndTryMatch;
        db = srv.__aiTinderTest.db;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("inserts like and returns matched per random", () => {
        jest.spyOn(Math, "random").mockReturnValue(0.1);
        const r = saveLikeAndTryMatch("s1", "N", "like", "", []);
        expect(r.inserted).toBe(true);
        expect(r.matched).toBe(true);
        const m = db.prepare(`SELECT * FROM matches WHERE profile_id = ?`).get("s1");
        expect(m).toBeTruthy();
    });

    it("returns matched false when random is high", () => {
        jest.spyOn(Math, "random").mockReturnValue(0.99);
        const r = saveLikeAndTryMatch("s2", "N", "superlike", "u", ["T"]);
        expect(r.matched).toBe(false);
    });

    it("skips new match if one already exists", () => {
        db.prepare(
            `INSERT OR IGNORE INTO matches (profile_id, name, action, img, tags, delivered)
     VALUES ('s3', 'x', 'like', '', '[]', 0)`
        ).run();
        jest.spyOn(Math, "random").mockReturnValue(0.01);
        const r = saveLikeAndTryMatch("s3", "N", "like", "", []);
        expect(r.matched).toBe(false);
    });

    it("stores complex tags array", () => {
        saveLikeAndTryMatch("s4", "N", "like", "i", ["a", "b", "c"]);
        const row = db.prepare(`SELECT tags FROM likes WHERE profile_id = ?`).get("s4");
        expect(JSON.parse(row.tags)).toEqual(["a", "b", "c"]);
    });

    it("always reports inserted true on success path", () => {
        jest.spyOn(Math, "random").mockReturnValue(0.99);
        const r = saveLikeAndTryMatch("s5", "N", "superlike", "", []);
        expect(r.inserted).toBe(true);
    });
});

describe("GET /api/likes error path (invalid tags in DB)", () => {
    it("returns 500 when tags JSON is corrupt", async () => {
        const app = loadServer();
        const { db } = app.__aiTinderTest;
        db.prepare(
            `INSERT OR REPLACE INTO likes (profile_id, name, action, img, tags)
     VALUES ('bad', 'B', 'like', '', 'NOT_JSON')`
        ).run();
        const res = await request(app).get("/api/likes").expect(500);
        expect(res.body.error).toBeDefined();
    });
});

describe("GET /api/matches error path (invalid tags in DB)", () => {
    it("returns 500 when match tags JSON is corrupt on poll", async () => {
        const app = loadServer();
        const { db } = app.__aiTinderTest;
        db.prepare(
            `INSERT OR IGNORE INTO matches (profile_id, name, action, img, tags, delivered)
     VALUES ('badm', 'B', 'like', '', 'NOT_JSON', 0)`
        ).run();
        const res = await request(app).get("/api/matches").expect(500);
        expect(res.body.error).toBeDefined();
    });
});

describe("POST /api/likes edge bodies", () => {
    let app;

    beforeEach(() => {
        app = loadServer();
    });

    it("accepts superlike with only required fields", async () => {
        const res = await request(app)
            .post("/api/likes")
            .send({ profileId: "min_super", action: "superlike" })
            .expect(201);
        expect(res.body.action).toBe("superlike");
    });

    it("passes through extra unknown JSON fields without error", async () => {
        await request(app)
            .post("/api/likes")
            .send({
                profileId: "extra",
                name: "E",
                action: "like",
                futureField: 123,
            })
            .expect(201);
    });

    it("stringifies null tags as JSON null (stored) and GET hydrates to null", async () => {
        await request(app)
            .post("/api/likes")
            .send({ profileId: "null_tags", name: "N", action: "like", tags: null })
            .expect(201);
        const res = await request(app).get("/api/likes").expect(200);
        const row = res.body.likes.find((l) => l.profile_id === "null_tags");
        expect(row.tags).toBeNull();
    });

    it("treats null img as empty string in storage", async () => {
        await request(app)
            .post("/api/likes")
            .send({ profileId: "null_img", name: "N", action: "like", img: null })
            .expect(201);
        const res = await request(app).get("/api/likes").expect(200);
        const row = res.body.likes.find((l) => l.profile_id === "null_img");
        expect(row.img).toBe("");
    });
});

describe("GET /api/matches query variants", () => {
    let app;

    beforeEach(() => {
        app = loadServer();
    });

    it("treats ?all=anything-other-than-true as poll (marks delivered)", async () => {
        const { db } = app.__aiTinderTest;
        db.prepare(
            `INSERT OR IGNORE INTO matches (profile_id, name, action, img, tags, delivered)
       VALUES ('q1', 'Q', 'like', '', '[]', 0)`
        ).run();
        const res = await request(app).get("/api/matches?all=false").expect(200);
        expect(res.body.newMatches.length).toBe(1);
        const row = db.prepare(`SELECT delivered FROM matches WHERE profile_id = ?`).get("q1");
        expect(row.delivered).toBe(1);
    });

    it("totalMatches counts all rows after multiple inserts", async () => {
        jest.spyOn(Math, "random").mockReturnValue(0.01);
        app = loadServer();
        await request(app)
            .post("/api/likes")
            .send({ profileId: "tm1", name: "A", action: "like" })
            .expect(201);
        await request(app)
            .post("/api/likes")
            .send({ profileId: "tm2", name: "B", action: "like" })
            .expect(201);
        const res = await request(app).get("/api/matches?all=true").expect(200);
        expect(res.body.totalMatches).toBe(2);
        jest.restoreAllMocks();
    });
});

describe("GET /api/matches multiple new rows", () => {
    it("returns multiple undelivered matches in matched_at order", async () => {
        const app = loadServer();
        const { db } = app.__aiTinderTest;
        db.exec(`
      INSERT INTO matches (profile_id, name, action, img, tags, delivered, matched_at)
      VALUES ('m1', 'a', 'like', '', '[]', 0, '2021-01-01'),
             ('m2', 'b', 'like', '', '[]', 0, '2020-01-01');
    `);
        const res = await request(app).get("/api/matches").expect(200);
        expect(res.body.newMatches.map((m) => m.profile_id)).toEqual(["m2", "m1"]);
    });
});

describe("DELETE /api/likes/:id variants", () => {
    let app;

    beforeEach(() => {
        app = loadServer();
    });

    it("deletes like when match row does not exist", async () => {
        await request(app)
            .post("/api/likes")
            .send({ profileId: "solo", name: "S", action: "like" })
            .expect(201);
        const res = await request(app).delete("/api/likes/solo").expect(200);
        expect(res.body.removed).toBe(true);
    });

    it("handles encoded profile ids in path", async () => {
        const id = "id%2Fwith%2Fslashes";
        await request(app)
            .post("/api/likes")
            .send({ profileId: id, name: "X", action: "like" })
            .expect(201);
        const res = await request(app).delete("/api/likes/" + encodeURIComponent(id)).expect(200);
        expect(res.body.removed).toBe(true);
    });
});

describe("__aiTinderTest.hydrateRow extended", () => {
    it("parses empty JSON array tags", () => {
        const { hydrateRow } = loadServer().__aiTinderTest;
        expect(hydrateRow({ profile_id: "x", tags: "[]", name: "n" }).tags).toEqual([]);
    });
});

