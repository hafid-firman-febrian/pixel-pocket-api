import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import transactions from "./routes/transactions";
import categories from "./routes/categories";
import salaryPeriods from "./routes/salary-periods";
import summary from "./routes/summary";
import backup from "./routes/backup";
import auth from "./routes/auth";
import { requireGoogleAuth } from "./middleware/auth";

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

// Semua /api/* wajib Google ID token valid + email ter-allowlist.
// Health check "/" tetap publik (di luar /api).
app.use("/api/*", requireGoogleAuth);

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
