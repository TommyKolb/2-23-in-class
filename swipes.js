// src/routes/swipes.js

const { Router } = require("express");
const { z }      = require("zod");
const prisma     = require("../db/client");
const { requireAuth } = require("../middleware/auth");

const router = Router();

router.use(requireAuth);

const swipeSchema = z.object({
  toUserId: z.string().uuid("toUserId must be a valid UUID."),
  action:   z.enum(["like", "nope", "superlike"], {
    errorMap: () => ({ message: "action must be 'like', 'nope', or 'superlike'." }),
  }),
});

// Normalise client action string → DB enum
const ACTION_MAP = { like: "LIKE", nope: "NOPE", superlike: "SUPERLIKE" };

// ─── POST /swipes ─────────────────────────────────────────────────────────────
router.post("/", async (req, res, next) => {
  try {
    const parsed = swipeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues.map((i) => i.message) });
    }

    const { toUserId, action } = parsed.data;
    const fromUserId = req.user.id;

    if (toUserId === fromUserId) {
      return res.status(400).json({ error: "You cannot swipe on yourself." });
    }

    // Verify the target user exists
    const targetUser = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!targetUser) {
      return res.status(404).json({ error: "Target user not found." });
    }

    // Persist the swipe (unique constraint prevents duplicate)
    let swipe;
    try {
      swipe = await prisma.swipe.create({
        data: {
          fromUserId,
          toUserId,
          action: ACTION_MAP[action],
        },
      });
    } catch (err) {
      // P2002 = unique constraint violation
      if (err.code === "P2002") {
        return res.status(409).json({ error: "You have already swiped on this user." });
      }
      throw err;
    }

    // ── Match detection ──────────────────────────────────────────────────────
    // Only LIKE and SUPERLIKE can create a match
    if (action === "nope") {
      return res.json({ matched: false });
    }

    // Check if the other user has already liked/superliked back
    const reverseSwipe = await prisma.swipe.findUnique({
      where: {
        fromUserId_toUserId: { fromUserId: toUserId, toUserId: fromUserId },
      },
    });

    const theyLikedUs = reverseSwipe && reverseSwipe.action !== "NOPE";

    if (!theyLikedUs) {
      return res.json({ matched: false });
    }

    // Create match — canonical order: smaller UUID first (dedup)
    const [userAId, userBId] = [fromUserId, toUserId].sort();
    const superLiked = action === "superlike" || reverseSwipe.action === "SUPERLIKE";

    let match;
    try {
      match = await prisma.match.create({
        data: { userAId, userBId, superLiked },
      });
    } catch (err) {
      if (err.code === "P2002") {
        // Match already exists (race condition) — still return matched: true
        match = await prisma.match.findUnique({
          where: { userAId_userBId: { userAId, userBId } },
        });
      } else {
        throw err;
      }
    }

    res.json({ matched: true, matchId: match.id, superLiked: match.superLiked });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
