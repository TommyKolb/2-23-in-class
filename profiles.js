// src/routes/profiles.js

const { Router } = require("express");
const { z }      = require("zod");
const prisma     = require("../db/client");
const { requireAuth } = require("../middleware/auth");

const router = Router();

// All profile routes require auth
router.use(requireAuth);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// Reshape a DB user into the profile shape the frontend expects:
// { id, name, age, city, title, bio, tags, img, photos, photoIndex }
function toProfile(user) {
  const safe = safeUser(user);
  return {
    ...safe,
    img:        safe.photos[0] || null,
    photoIndex: 0,
  };
}

// ─── GET /profiles ────────────────────────────────────────────────────────────
// Returns a paginated deck of profiles the requesting user has NOT yet swiped.
// Query params: limit (default 12), cursor (last profile id for pagination)
router.get("/", async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit || "12", 10), 50);
    const cursor = req.query.cursor;

    // IDs already swiped by the current user
    const swiped = await prisma.swipe.findMany({
      where:  { fromUserId: req.user.id },
      select: { toUserId: true },
    });
    const swipedIds = swiped.map((s) => s.toUserId);

    // Exclude self and already-swiped
    const excludeIds = [req.user.id, ...swipedIds];

    const profiles = await prisma.user.findMany({
      where: {
        id:    { notIn: excludeIds },
        ...(cursor ? { id: { notIn: excludeIds, gt: cursor } } : {}),
      },
      take:    limit,
      orderBy: { createdAt: "asc" }, // stable ordering; frontend shuffles visually
    });

    const nextCursor = profiles.length === limit ? profiles[profiles.length - 1].id : null;

    res.json({
      profiles: profiles.map(toProfile),
      nextCursor,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /profiles/me ─────────────────────────────────────────────────────────
router.get("/me", (req, res) => {
  res.json(toProfile(req.user));
});

// ─── GET /profiles/:id ───────────────────────────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: "Profile not found." });
    res.json(toProfile(user));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /profiles/me ────────────────────────────────────────────────────────
const updateSchema = z.object({
  name:  z.string().min(1).max(60).optional(),
  age:   z.number().int().min(18).max(99).optional(),
  city:  z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(100).optional(),
  bio:   z.string().max(500).optional(),
  tags:  z.array(z.string()).max(16).optional(),
});

router.put("/me", async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues.map((i) => i.message) });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data:  parsed.data,
    });
    res.json(toProfile(updated));
  } catch (err) {
    next(err);
  }
});

// ─── POST /profiles/me/photos ─────────────────────────────────────────────────
// In a production setup this would accept multipart/form-data and upload to S3.
// For this implementation, clients pass a URL directly in { url: "..." }.
// Swap the body of this handler with a multer + S3 upload when ready.
router.post("/me/photos", async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "A photo URL is required." });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data:  { photos: { push: url } },
    });
    res.json({ photos: user.photos });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /profiles/me/photos/:index ───────────────────────────────────────
router.delete("/me/photos/:index", async (req, res, next) => {
  try {
    const index = parseInt(req.params.index, 10);
    const user  = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (isNaN(index) || index < 0 || index >= user.photos.length) {
      return res.status(400).json({ error: "Invalid photo index." });
    }

    const photos = user.photos.filter((_, i) => i !== index);
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data:  { photos },
    });
    res.json({ photos: updated.photos });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
