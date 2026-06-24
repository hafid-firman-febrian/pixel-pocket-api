import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import transactions from "./routes/transactions.js";
import categories from "./routes/categories.js";
import salaryPeriods from "./routes/salary-periods.js";
import summary from "./routes/summary.js";
import backup from "./routes/backup.js";
import auth from "./routes/auth.js";
import { requireAuth } from "./middleware/auth.js";

const app = new Hono();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  "*",
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use("*", logger());

// Semua /api/* wajib access token JWT valid (diterbitkan oleh /api/auth/google).
// Endpoint publik (/api/auth/google, /api/auth/refresh, /api/auth/logout) di-bypass requireAuth.
// Health check "/" tetap publik (di luar /api).
app.use("/api/*", requireAuth);

// ─────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────
app.get("/", (c) =>
  c.json({
    message: "Pixel Pocket API",
    version: "1.0.0",
    status: "ok",
    timestamp: new Date().toISOString(),
  }),
);

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
app.route("/api/transactions", transactions);
app.route("/api/categories", categories);
app.route("/api/salary-periods", salaryPeriods);
app.route("/api/summary", summary);
app.route("/api/backup", backup);
app.route("/api/auth", auth);

app.notFound((c) => c.json({ error: "Endpoint not found" }, 404));
app.onError((err, c) => {
  console.error("[Global Error Handler]", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
