// src/index.js
// Main Express application entry point.

require("dotenv").config();

const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit    = require("express-rate-limit");

const authRoutes     = require("./routes/auth");
const profileRoutes  = require("./routes/profiles");
const swipeRoutes    = require("./routes/swipes");
const matchRoutes    = require("./routes/matches");
const { errorHandler } = require("./middleware/errorHandler");

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Security headers ────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5500")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. curl, Postman) in development
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS policy: origin '${origin}' not allowed.`));
    },
    credentials: true, // required for cookies
  })
);

// ─── Body / cookie parsing ───────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ─── General rate limit (all routes) ────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX       || "200",    10),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many requests. Please try again later." },
});
app.use(generalLimiter);

// ─── Swipe-specific rate limit (tighter) ─────────────────────────────────────
const swipeLimiter = rateLimit({
  windowMs: parseInt(process.env.SWIPE_RATE_LIMIT_WINDOW_MS || "3600000", 10), // 1 hr
  max:      parseInt(process.env.SWIPE_RATE_LIMIT_MAX       || "200",     10),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Swipe limit reached. Try again later." },
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/auth",     authRoutes);
app.use("/profiles", profileRoutes);
app.use("/swipes",   swipeLimiter, swipeRoutes);
app.use("/matches",  matchRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ─── 404 catch-all ───────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found." }));

// ─── Central error handler ────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🔥  AI-Tinder backend running on http://localhost:${PORT}`);
  console.log(`    Environment: ${process.env.NODE_ENV || "development"}`);
});

module.exports = app; // for testing
