// src/utils/jwt.js

const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const prisma = require("../db/client");

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN  || "15m";
const REFRESH_DAYS   = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || "30", 10);

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in environment variables.");
}

/**
 * Issue a short-lived access token.
 * @param {{ id: string, email: string }} user
 */
function signAccessToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES,
  });
}

/**
 * Create and persist a refresh token for the given user.
 * Returns the raw token string (to be set as an HTTP-only cookie).
 */
async function createRefreshToken(userId) {
  const token     = uuidv4();
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
  return token;
}

/**
 * Rotate a refresh token: delete the old one, issue a new one.
 * Returns { accessToken, refreshToken } or throws if invalid/expired.
 */
async function rotateRefreshToken(rawToken) {
  const record = await prisma.refreshToken.findUnique({ where: { token: rawToken }, include: { user: true } });

  if (!record)                        throw Object.assign(new Error("Invalid refresh token"), { status: 401 });
  if (record.expiresAt < new Date())  throw Object.assign(new Error("Refresh token expired"), { status: 401 });

  // Delete old token (rotation)
  await prisma.refreshToken.delete({ where: { id: record.id } });

  const accessToken  = signAccessToken(record.user);
  const refreshToken = await createRefreshToken(record.userId);

  return { accessToken, refreshToken, user: record.user };
}

/**
 * Delete a specific refresh token (logout).
 */
async function revokeRefreshToken(rawToken) {
  await prisma.refreshToken.deleteMany({ where: { token: rawToken } });
}

/**
 * Verify an access token and return its payload.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

module.exports = { signAccessToken, createRefreshToken, rotateRefreshToken, revokeRefreshToken, verifyAccessToken };
