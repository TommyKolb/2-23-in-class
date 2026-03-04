// src/db/client.js
// Singleton Prisma client — import this everywhere instead of `new PrismaClient()`.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
});

module.exports = prisma;
