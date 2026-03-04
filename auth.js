// src/routes/auth.js

const { Router } = require("express");
const bcrypt     = require("bcrypt");
const { z }      = require("zod");
const prisma     = require("../db/client");
const {
  signAccessToken,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} = require("../utils/jwt");

const router = Router();

// ─── Cookie config ──────────────────────────────────────────────────────────
const REFRESH_DAYS = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || "30", 10);
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure:   process.env.NODE_ENV === "production",
  maxAge:   REFRESH_DAYS * 24 * 60 * 60 * 1000,
  path:     "/",
};

// ─── Schemas ────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  email:  z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  name:   z.string().min(1).max(60),
  age:    z.number().int().min(18).max(99),
  city:   z.string().min(1).max(100),
  title:  z.string().min(1).max(100),
  bio:    z.string().max(500).optional().default(""),
  tags:   z.array(z.string()).max(16).optional().default([]),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ─── Helper ─────────────────────────────────────────────────────────────────
function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// ─── POST /auth/register ────────────────────────────────────────────────────
router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues.map((i) => i.message) });
    }

    const { email, password, ...profile } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, photos: [], ...profile },
    });

    const accessToken  = signAccessToken(user);
    const refreshToken = await createRefreshToken(user.id);

    res.cookie("refreshToken", refreshToken, cookieOptions);
    res.status(201).json({ user: safeUser(user), accessToken });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/login ────────────────────────────────────────────────────────
router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues.map((i) => i.message) });
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const accessToken  = signAccessToken(user);
    const refreshToken = await createRefreshToken(user.id);

    res.cookie("refreshToken", refreshToken, cookieOptions);
    res.json({ user: safeUser(user), accessToken });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/refresh ──────────────────────────────────────────────────────
router.post("/refresh", async (req, res, next) => {
  try {
    const raw = req.cookies?.refreshToken;
    if (!raw) {
      return res.status(401).json({ error: "No refresh token provided." });
    }

    const { accessToken, refreshToken, user } = await rotateRefreshToken(raw);

    res.cookie("refreshToken", refreshToken, cookieOptions);
    res.json({ user: safeUser(user), accessToken });
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ error: err.message });
    next(err);
  }
});

// ─── POST /auth/logout ───────────────────────────────────────────────────────
router.post("/logout", async (req, res, next) => {
  try {
    const raw = req.cookies?.refreshToken;
    if (raw) await revokeRefreshToken(raw);

    res.clearCookie("refreshToken", { path: "/" });
    res.json({ message: "Logged out." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
