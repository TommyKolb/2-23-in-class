// src/routes/matches.js

const { Router } = require("express");
const prisma     = require("../db/client");
const { requireAuth } = require("../middleware/auth");

const router = Router();

router.use(requireAuth);

function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return { ...rest, img: rest.photos[0] || null, photoIndex: 0 };
}

function formatMatch(match, myId) {
  const other = match.userAId === myId ? match.userB : match.userA;
  return {
    id:         match.id,
    superLiked: match.superLiked,
    createdAt:  match.createdAt,
    profile:    safeUser(other),
  };
}

// ─── GET /matches ─────────────────────────────────────────────────────────────
// Returns all matches for the authenticated user, newest first.
router.get("/", async (req, res, next) => {
  try {
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ userAId: req.user.id }, { userBId: req.user.id }],
      },
      include: {
        userA: true,
        userB: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ matches: matches.map((m) => formatMatch(m, req.user.id)) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /matches/:id ─────────────────────────────────────────────────────────
// Returns a single match with full profiles for both parties.
router.get("/:id", async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where:   { id: req.params.id },
      include: { userA: true, userB: true },
    });

    if (!match) {
      return res.status(404).json({ error: "Match not found." });
    }

    // Ensure the requesting user is part of this match
    if (match.userAId !== req.user.id && match.userBId !== req.user.id) {
      return res.status(403).json({ error: "Access denied." });
    }

    res.json({
      id:         match.id,
      superLiked: match.superLiked,
      createdAt:  match.createdAt,
      users:      [safeUser(match.userA), safeUser(match.userB)],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
