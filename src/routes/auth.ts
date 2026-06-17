import { Hono } from "hono";

const router = new Hono();

// GET /api/auth/me — identitas dari token saat ini (untuk klien cek validitas)
router.get("/me", (c) => {
  return c.json({ data: c.get("user") });
});

export default router;
