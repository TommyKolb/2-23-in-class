// server.js
// Express backend for AI-Tinder  –  SQLite persistence via better-sqlite3
//
// Database file: ./tinder.db  (created automatically on first run)
//
// Tables
//   likes   – every like / superlike the local user sends
//   matches – confirmed mutual matches
//
// Endpoints
//   POST   /api/likes          record a like/superlike action
//   GET    /api/matches        poll for NEW matches (marks them delivered)
//   GET    /api/matches?all=1  return every match ever (debug)
//   GET    /api/likes          dump the full likes table (debug)
//   DELETE /api/likes/:id      remove a like + any associated match (debug)

const express = require("express");
const cors = require("cors");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Database setup ───────────────────────────────────────────────────────────

const DB_PATH =
    process.env.NODE_ENV === "test" ? ":memory:" : path.join(__dirname, "tinder.db");
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// Create tables if they don't exist yet
db.exec(`
  CREATE TABLE IF NOT EXISTS likes (
    profile_id  TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    action      TEXT    NOT NULL CHECK(action IN ('like','superlike')),
    img         TEXT    DEFAULT '',
    tags        TEXT    DEFAULT '[]',   -- JSON array stored as text
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS matches (
    profile_id  TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    action      TEXT    NOT NULL,
    img         TEXT    DEFAULT '',
    tags        TEXT    DEFAULT '[]',
    matched_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    delivered   INTEGER NOT NULL DEFAULT 0   -- 0 = pending, 1 = already sent to client
  );
`);

console.log(`[db] SQLite database ready at ${DB_PATH}`);

// ─── Prepared statements ──────────────────────────────────────────────────────

const stmts = {
    // likes
    insertLike: db.prepare(`
    INSERT OR REPLACE INTO likes (profile_id, name, action, img, tags)
    VALUES (@profileId, @name, @action, @img, @tags)
  `),
    getLike: db.prepare(`SELECT * FROM likes WHERE profile_id = ?`),
    allLikes: db.prepare(`SELECT * FROM likes ORDER BY created_at DESC`),
    deleteLike: db.prepare(`DELETE FROM likes WHERE profile_id = ?`),

    // matches
    insertMatch: db.prepare(`
    INSERT OR IGNORE INTO matches (profile_id, name, action, img, tags)
    VALUES (@profileId, @name, @action, @img, @tags)
  `),
    matchExists: db.prepare(`SELECT 1 FROM matches WHERE profile_id = ?`),
    newMatches: db.prepare(`SELECT * FROM matches WHERE delivered = 0 ORDER BY matched_at ASC`),
    allMatches: db.prepare(`SELECT * FROM matches ORDER BY matched_at DESC`),
    markDelivered: db.prepare(`UPDATE matches SET delivered = 1 WHERE profile_id = ?`),
    deleteMatch: db.prepare(`DELETE FROM matches WHERE profile_id = ?`),
    matchCount: db.prepare(`SELECT COUNT(*) AS cnt FROM matches`),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deserialise a row coming out of SQLite (tags JSON → array). */
function hydrateRow(row) {
    if (!row) return null;
    return {
        ...row,
        tags: JSON.parse(row.tags || "[]"),
    };
}

/**
 * Persist a like and attempt to create a mutual match.
 * Returns { inserted, matched }
 */
function saveLikeAndTryMatch(profileId, name, action, img, tags) {
    const tagsJson = JSON.stringify(tags);

    // Upsert the like record
    stmts.insertLike.run({ profileId, name, action, img: img || "", tags: tagsJson });

    // Don't create a duplicate match
    if (stmts.matchExists.get(profileId)) {
        return { inserted: true, matched: false };
    }

    // Simulate ~40 % probability the other person already liked you back.
    // Replace this with a real Bedrock / recommendation-engine query in production.
    const alreadyLikedBack = Math.random() < 0.4;

    if (alreadyLikedBack) {
        stmts.insertMatch.run({ profileId, name, action, img: img || "", tags: tagsJson });
        return { inserted: true, matched: true };
    }

    return { inserted: true, matched: false };
}

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, ".")));

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/likes
 * Body: { profileId, name, action, img?, tags? }
 */
app.post("/api/likes", (req, res) => {
    const { profileId, name, action, img = "", tags = [] } = req.body || {};

    if (!profileId || !["like", "superlike"].includes(action)) {
        return res.status(400).json({
            error: "profileId and action ('like'|'superlike') are required",
        });
    }

    try {
        const { inserted, matched } = saveLikeAndTryMatch(
            profileId,
            name || "Unknown",
            action,
            img,
            tags
        );

        console.log(
            `[likes] ${action.toUpperCase()} → ${name} (${profileId}) | matched=${matched}`
        );

        return res.status(201).json({ ok: true, profileId, action, matched });
    } catch (err) {
        console.error("[likes] DB error:", err.message);
        return res.status(500).json({ error: "Database error", detail: err.message });
    }
});

/**
 * GET /api/matches
 * Returns only undelivered matches (default), or all matches (?all=true).
 * Marks returned matches as delivered so next poll won't repeat them.
 */
app.get("/api/matches", (req, res) => {
    const returnAll = req.query.all === "true";

    try {
        const rows = returnAll
            ? stmts.allMatches.all()
            : stmts.newMatches.all();

        const matches = rows.map(hydrateRow);

        // Mark as delivered (only for the normal poll, not debug ?all)
        if (!returnAll) {
            const markMany = db.transaction((items) => {
                for (const m of items) stmts.markDelivered.run(m.profile_id);
            });
            markMany(rows);
        }

        const { cnt: totalMatches } = stmts.matchCount.get();

        console.log(`[matches] poll → ${matches.length} new, ${totalMatches} total`);

        return res.json({ ok: true, newMatches: matches, totalMatches });
    } catch (err) {
        console.error("[matches] DB error:", err.message);
        return res.status(500).json({ error: "Database error", detail: err.message });
    }
});

/**
 * GET /api/likes
 * Debug: return full likes table.
 */
app.get("/api/likes", (req, res) => {
    try {
        const likes = stmts.allLikes.all().map(hydrateRow);
        return res.json({ ok: true, count: likes.length, likes });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/likes/:id
 * Debug: remove a like and its associated match.
 */
app.delete("/api/likes/:id", (req, res) => {
    const { id } = req.params;
    try {
        const existed = stmts.deleteLike.run(id).changes > 0;
        stmts.deleteMatch.run(id);
        return res.json({ ok: true, removed: existed });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function registerSignalHandlers() {
    process.on("SIGINT", () => { db.close(); process.exit(0); });
    process.on("SIGTERM", () => { db.close(); process.exit(0); });
}

// Avoid stacking listeners when the module is re-loaded in tests (jest.resetModules).
if (process.env.NODE_ENV !== "test") {
    registerSignalHandlers();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

function startListeningServer() {
    app.listen(PORT, () => {
        console.log(`\n🔥 AI-Tinder backend  →  http://localhost:${PORT}`);
        console.log(`   POST   /api/likes          record a like`);
        console.log(`   GET    /api/matches        poll for new matches`);
        console.log(`   GET    /api/likes          inspect the likes DB`);
        console.log(`   DELETE /api/likes/:id      remove a like\n`);
    });
}

if (require.main === module) {
    startListeningServer();
}

if (process.env.NODE_ENV === "test") {
    app.__aiTinderTest = {
        hydrateRow,
        saveLikeAndTryMatch,
        db,
        registerSignalHandlers,
        startListeningServer,
    };
}

module.exports = app;
