import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import transactions from "./routes/transactions";
import categories from "./routes/categories";
import salaryPeriods from "./routes/salary-periods";
import summary from "./routes/summary";
import backup from "./routes/backup";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use("*", logger());

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

app.notFound((c) => c.json({ error: "Endpoint not found" }, 404));
app.onError((err, c) => {
  console.error("[Global Error Handler]", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
