// src/middleware/errorHandler.js

/**
 * Central Express error handler.
 * Any route/middleware that calls next(err) ends up here.
 */
function errorHandler(err, req, res, _next) {
  const status  = err.status  || err.statusCode || 500;
  const message = err.message || "Internal server error.";

  // Log server errors; avoid leaking internals to client
  if (status >= 500) {
    console.error(`[ERROR] ${req.method} ${req.path}`, err);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }

  res.status(status).json({ error: message, ...(err.errors ? { errors: err.errors } : {}) });
}

module.exports = { errorHandler };
