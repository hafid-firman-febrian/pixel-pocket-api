import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { categories } from "../db/schema";
import {
  createCategorySchema,
  updateCategorySchema,
} from "../validators/category";

const router = new Hono();

// ─────────────────────────────────────────────
// Data seed default
// ─────────────────────────────────────────────
const DEFAULT_CATEGORIES: Array<{
  name: string;
  color: string;
  type: "income" | "expense" | "both";
}> = [
  // Expense (13)
  { name: "Groceries", color: "#7D9B76", type: "expense" },
  { name: "Beverage", color: "#5F8A8B", type: "expense" },
  { name: "Coffee", color: "#8B6355", type: "expense" },
  { name: "Cigarettes", color: "#8C7B6B", type: "expense" },
  { name: "Daily Needs", color: "#C4A882", type: "expense" },
  { name: "E-commerce", color: "#6B7C8D", type: "expense" },
  { name: "Entertainment", color: "#9B6B8C", type: "expense" },
  { name: "Housing", color: "#B5847A", type: "expense" },
  { name: "Meal", color: "#CC7358", type: "expense" },
  { name: "Selfcare", color: "#A0856C", type: "expense" },
  { name: "Subscription", color: "#7B6D8D", type: "expense" },
  { name: "Transport", color: "#4A7C8C", type: "expense" },
  { name: "Other", color: "#8C8C7B", type: "expense" },
  // Income (5)
  { name: "Salary", color: "#6B8C5F", type: "income" },
  { name: "Freelance", color: "#5B7A8C", type: "income" },
  { name: "Investment", color: "#8C7A3D", type: "income" },
  { name: "Bonus", color: "#8C5B3D", type: "income" },
  { name: "Other Income", color: "#7A8C6B", type: "income" },
];

// ─────────────────────────────────────────────
// GET / — Semua kategori
// ─────────────────────────────────────────────
router.get("/", async (c) => {
  try {
    const data = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.type), asc(categories.name));

    return c.json({ data });
  } catch (error) {
    console.error("[GET /categories]", error);
    return c.json({ error: "Gagal mengambil data kategori" }, 500);
  }
});

// ─────────────────────────────────────────────
// POST /seed — Seed kategori default (IDEMPOTENT)
// Harus sebelum /:id agar tidak salah route!
// ─────────────────────────────────────────────
router.post("/seed", async (c) => {
  try {
    // onConflictDoNothing() skip INSERT jika name sudah ada (unique constraint)
    // Ini yang membuat endpoint ini idempotent
    const inserted = await db
      .insert(categories)
      .values(DEFAULT_CATEGORIES)
      .onConflictDoNothing()
      .returning();

    return c.json(
      {
        data: {
          message: `Seeding selesai. ${inserted.length} kategori baru ditambahkan.`,
          inserted: inserted.length,
          skipped: DEFAULT_CATEGORIES.length - inserted.length,
          total_defaults: DEFAULT_CATEGORIES.length,
        },
      },
      201,
    );
  } catch (error) {
    console.error("[POST /categories/seed]", error);
    return c.json({ error: "Gagal melakukan seed kategori" }, 500);
  }
});

// ─────────────────────────────────────────────
// GET /:id — Satu kategori
// ─────────────────────────────────────────────
router.get("/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id) || id <= 0) {
      return c.json({ error: "ID kategori tidak valid" }, 400);
    }

    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    if (!category) {
      return c.json({ error: "Kategori tidak ditemukan" }, 404);
    }

    return c.json({ data: category });
  } catch (error) {
    console.error("[GET /categories/:id]", error);
    return c.json({ error: "Gagal mengambil data kategori" }, 500);
  }
});

// ─────────────────────────────────────────────
// POST / — Buat kategori baru
// ─────────────────────────────────────────────
router.post(
  "/",
  zValidator("json", createCategorySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Data kategori tidak valid",
          details: z.flattenError(result.error).fieldErrors,
        },
        400,
      );
    }
  }),
  async (c) => {
    try {
      const body = c.req.valid("json");

      const [created] = await db
        .insert(categories)
        .values({
          name: body.name,
          color: body.color ?? null,
          type: body.type,
        })
        .returning();

      return c.json({ data: created }, 201);
    } catch (error: unknown) {
      // PostgreSQL error code 23505 = unique_violation
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "23505"
      ) {
        return c.json(
          { error: "Kategori dengan nama tersebut sudah ada" },
          409,
        );
      }
      console.error("[POST /categories]", error);
      return c.json({ error: "Gagal membuat kategori" }, 500);
    }
  },
);

// ─────────────────────────────────────────────
// PUT /:id — Update kategori
// ─────────────────────────────────────────────
router.put(
  "/:id",
  zValidator("json", updateCategorySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Data pembaruan tidak valid",
          details: z.flattenError(result.error).fieldErrors,
        },
        400,
      );
    }
  }),
  async (c) => {
    try {
      const id = parseInt(c.req.param("id"), 10);
      if (isNaN(id) || id <= 0) {
        return c.json({ error: "ID kategori tidak valid" }, 400);
      }

      const body = c.req.valid("json");

      const [existing] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);

      if (!existing) {
        return c.json({ error: "Kategori tidak ditemukan" }, 404);
      }

      const [updated] = await db
        .update(categories)
        .set(body)
        .where(eq(categories.id, id))
        .returning();

      return c.json({ data: updated });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "23505"
      ) {
        return c.json(
          { error: "Kategori dengan nama tersebut sudah ada" },
          409,
        );
      }
      console.error("[PUT /categories/:id]", error);
      return c.json({ error: "Gagal memperbarui kategori" }, 500);
    }
  },
);

// ─────────────────────────────────────────────
// DELETE /:id — Hapus kategori
// ─────────────────────────────────────────────
router.delete("/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id) || id <= 0) {
      return c.json({ error: "ID kategori tidak valid" }, 400);
    }

    const [deleted] = await db
      .delete(categories)
      .where(eq(categories.id, id))
      .returning();

    if (!deleted) {
      return c.json({ error: "Kategori tidak ditemukan" }, 404);
    }

    return c.json({
      data: { message: "Kategori berhasil dihapus", id: deleted.id },
    });
  } catch (error) {
    console.error("[DELETE /categories/:id]", error);
    return c.json({ error: "Gagal menghapus kategori" }, 500);
  }
});

export default router;
