import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { transactions, categories, salaryPeriods } from "../db/schema";
import { transactionQuerySchema } from "../validators/query-filters";
import {
  createTransactionSchema,
  updateTransactionSchema,
} from "../validators/transaction";
import {
  getWeekRange,
  getMonthRange,
  getYearRange,
  type DateRange,
} from "../lib/date-filters";

const router = new Hono();

// ─────────────────────────────────────────────
// Helper: Resolve date range dari query params
// ─────────────────────────────────────────────
// salary_period_id memiliki prioritas lebih tinggi dari filter
async function resolveDateRange(query: {
  filter?: string;
  salary_period_id?: number;
  start_date?: string;
  end_date?: string;
}): Promise<{ range: DateRange | null; error?: string }> {
  if (query.salary_period_id) {
    const [period] = await db
      .select()
      .from(salaryPeriods)
      .where(eq(salaryPeriods.id, query.salary_period_id))
      .limit(1);

    if (!period) {
      return { range: null, error: "Salary period tidak ditemukan" };
    }

    return {
      range: { startDate: period.startDate, endDate: period.endDate },
    };
  }

  if (query.filter) {
    switch (query.filter) {
      case "week":
        return { range: getWeekRange() };
      case "month":
        return { range: getMonthRange() };
      case "year":
        return { range: getYearRange() };
      case "custom":
        return {
          range: { startDate: query.start_date!, endDate: query.end_date! },
        };
    }
  }

  // Tidak ada filter → ambil semua transaksi
  return { range: null };
}

// ─────────────────────────────────────────────
// GET / — List transaksi dengan filter & pagination
// ─────────────────────────────────────────────
router.get(
  "/",
  zValidator("query", transactionQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Parameter query tidak valid",
          details: z.flattenError(result.error).fieldErrors,
        },
        400,
      );
    }
  }),
  async (c) => {
    try {
      const query = c.req.valid("query");

      const { range: dateRange, error: dateError } =
        await resolveDateRange(query);
      if (dateError) {
        return c.json({ error: dateError }, 404);
      }

      // Bangun kondisi WHERE secara dinamis
      const conditions = [];

      if (dateRange) {
        // gte = greater than or equal, lte = less than or equal
        conditions.push(gte(transactions.transactionDate, dateRange.startDate));
        conditions.push(lte(transactions.transactionDate, dateRange.endDate));
      }
      if (query.category_id) {
        conditions.push(eq(transactions.categoryId, query.category_id));
      }
      if (query.transaction_type) {
        conditions.push(
          eq(transactions.transactionType, query.transaction_type),
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Hitung total row untuk pagination
      // ::int cast karena PostgreSQL count() mengembalikan bigint
      const [{ total }] = await db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(transactions)
        .where(whereClause);

      const offset = (query.page - 1) * query.limit;
      const totalPages = Math.ceil(total / query.limit);

      // Ambil data dengan LEFT JOIN ke categories
      // LEFT JOIN memastikan transaksi tanpa kategori tetap muncul (categoryName = null)
      const data = await db
        .select({
          id: transactions.id,
          transactionDate: transactions.transactionDate,
          transactionType: transactions.transactionType,
          amount: transactions.amount,
          categoryId: transactions.categoryId,
          description: transactions.description,
          createdAt: transactions.createdAt,
          updatedAt: transactions.updatedAt,
          categoryName: categories.name,
          categoryColor: categories.color,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(whereClause)
        .orderBy(
          desc(transactions.transactionDate),
          desc(transactions.createdAt),
        )
        .limit(query.limit)
        .offset(offset);

      return c.json({
        data: data.map((t) => ({
          ...t,
          // PENTING: amount dari numeric PostgreSQL datang sebagai string!
          amount: parseFloat(t.amount),
        })),
        count: total,
        meta: {
          page: query.page,
          limit: query.limit,
          totalPages,
          hasNextPage: query.page < totalPages,
          hasPrevPage: query.page > 1,
        },
      });
    } catch (error) {
      console.error("[GET /transactions]", error);
      return c.json({ error: "Gagal mengambil data transaksi" }, 500);
    }
  },
);

// ─────────────────────────────────────────────
// GET /:id — Detail satu transaksi
// ─────────────────────────────────────────────
router.get("/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id) || id <= 0) {
      return c.json({ error: "ID transaksi tidak valid" }, 400);
    }

    const [transaction] = await db
      .select({
        id: transactions.id,
        transactionDate: transactions.transactionDate,
        transactionType: transactions.transactionType,
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        description: transactions.description,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt,
        categoryName: categories.name,
        categoryColor: categories.color,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(eq(transactions.id, id))
      .limit(1);

    if (!transaction) {
      return c.json({ error: "Transaksi tidak ditemukan" }, 404);
    }

    return c.json({
      data: { ...transaction, amount: parseFloat(transaction.amount) },
    });
  } catch (error) {
    console.error("[GET /transactions/:id]", error);
    return c.json({ error: "Gagal mengambil data transaksi" }, 500);
  }
});

// ─────────────────────────────────────────────
// POST / — Buat transaksi baru
// ─────────────────────────────────────────────
router.post(
  "/",
  zValidator("json", createTransactionSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Data transaksi tidak valid",
          details: z.flattenError(result.error).fieldErrors,
        },
        400,
      );
    }
  }),
  async (c) => {
    try {
      const body = c.req.valid("json");

      // Validasi category_id ada di database (jika diberikan)
      if (body.category_id) {
        const [cat] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, body.category_id))
          .limit(1);

        if (!cat) {
          return c.json({ error: "Kategori tidak ditemukan" }, 404);
        }
      }

      // PENTING: amount harus dikonversi ke String saat INSERT ke kolom numeric
      const [created] = await db
        .insert(transactions)
        .values({
          transactionDate: body.transaction_date,
          transactionType: body.transaction_type,
          amount: String(body.amount),
          categoryId: body.category_id ?? null,
          description: body.description ?? null,
        })
        .returning();

      return c.json(
        { data: { ...created, amount: parseFloat(created.amount) } },
        201,
      );
    } catch (error) {
      console.error("[POST /transactions]", error);
      return c.json({ error: "Gagal membuat transaksi" }, 500);
    }
  },
);

// ─────────────────────────────────────────────
// PUT /:id — Update transaksi
// ─────────────────────────────────────────────
router.put(
  "/:id",
  zValidator("json", updateTransactionSchema, (result, c) => {
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
        return c.json({ error: "ID transaksi tidak valid" }, 400);
      }

      const body = c.req.valid("json");

      // Cek transaksi ada
      const [existing] = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1);

      if (!existing) {
        return c.json({ error: "Transaksi tidak ditemukan" }, 404);
      }

      // Cek kategori baru ada (jika disertakan)
      if (body.category_id) {
        const [cat] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, body.category_id))
          .limit(1);

        if (!cat) {
          return c.json({ error: "Kategori tidak ditemukan" }, 404);
        }
      }

      // Bangun objek update hanya dari field yang dikirim
      // Menggunakan Record<string, unknown> karena field bersifat dinamis
      const updateData: Record<string, unknown> = {};
      if (body.transaction_date !== undefined)
        updateData.transactionDate = body.transaction_date;
      if (body.transaction_type !== undefined)
        updateData.transactionType = body.transaction_type;
      if (body.amount !== undefined) updateData.amount = String(body.amount);
      if (body.category_id !== undefined)
        updateData.categoryId = body.category_id;
      if (body.description !== undefined)
        updateData.description = body.description;

      const [updated] = await db
        .update(transactions)
        .set(updateData)
        .where(eq(transactions.id, id))
        .returning();

      return c.json({
        data: { ...updated, amount: parseFloat(updated.amount) },
      });
    } catch (error) {
      console.error("[PUT /transactions/:id]", error);
      return c.json({ error: "Gagal memperbarui transaksi" }, 500);
    }
  },
);

// ─────────────────────────────────────────────
// DELETE /:id — Hapus transaksi
// ─────────────────────────────────────────────
router.delete("/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id) || id <= 0) {
      return c.json({ error: "ID transaksi tidak valid" }, 400);
    }

    // .returning() mengembalikan data yang dihapus — jika kosong berarti tidak ada
    const [deleted] = await db
      .delete(transactions)
      .where(eq(transactions.id, id))
      .returning();

    if (!deleted) {
      return c.json({ error: "Transaksi tidak ditemukan" }, 404);
    }

    return c.json({
      data: { message: "Transaksi berhasil dihapus", id: deleted.id },
    });
  } catch (error) {
    console.error("[DELETE /transactions/:id]", error);
    return c.json({ error: "Gagal menghapus transaksi" }, 500);
  }
});

export default router;
