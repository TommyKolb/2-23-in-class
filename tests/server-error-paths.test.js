/**
 * Covers catch branches in server.js that need a broken DB (in-process).
 */
const request = require("supertest");

function loadServer() {
    jest.resetModules();
    return require("../server");
}

describe("POST /api/likes catch (DB failure)", () => {
    it("returns 500 when likes table is missing", async () => {
        const app = loadServer();
        const { db } = app.__aiTinderTest;
        db.exec("DROP TABLE likes");
        const res = await request(app)
            .post("/api/likes")
            .send({ profileId: "broken", name: "B", action: "like" })
            .expect(500);
        expect(res.body).toMatchObject({ error: "Database error" });
        expect(res.body.detail).toBeDefined();
    });
});

describe("DELETE /api/likes/:id catch (DB failure)", () => {
    it("returns 500 when database is closed", async () => {
        const app = loadServer();
        const { db } = app.__aiTinderTest;
        db.close();
        const res = await request(app).delete("/api/likes/whatever").expect(500);
        expect(res.body.error).toBeDefined();
    });
});
