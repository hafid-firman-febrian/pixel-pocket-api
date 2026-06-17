import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { salaryPeriods } from "../db/schema";
import {
  createSalaryPeriodSchema,
  updateSalaryPeriodSchema,
} from "../validators/salary-period";

const router = new Hono();

// Helper konversi salaryAmount dari string ke number
function formatPeriod(p: typeof salaryPeriods.$inferSelect) {
  return {
    ...p,
    salaryAmount: p.salaryAmount ? parseFloat(p.salaryAmount) : null,
  };
}

// Nama bulan Indonesia (index 0 = Januari)
const BULAN_INDONESIA = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Generate periode gajian (gajian tiap tanggal 27).
// Sebuah periode berakhir tgl 26 bulan M dan mulai tgl 27 bulan sebelumnya.
// Nama mengikuti BULAN AKHIR (M), contoh: "Juni 2026" = 27 Mei 2026 → 26 Juni 2026.
// Rentang: Januari tahun lalu hingga Desember tahun depan (~36 periode).
function generateSalaryPeriods(): Array<{
  name: string;
  startDate: string;
  endDate: string;
}> {
  const currentYear = new Date().getUTCFullYear();
  const periods: Array<{ name: string; startDate: string; endDate: string }> =
    [];

  for (let year = currentYear - 1; year <= currentYear + 1; year++) {
    for (let month = 1; month <= 12; month++) {
      // month = bulan AKHIR (M) → end tgl 26 bulan M
      const startMonth = month === 1 ? 12 : month - 1;
      const startYear = month === 1 ? year - 1 : year;

      periods.push({
        name: `${BULAN_INDONESIA[month - 1]} ${year}`,
        startDate: `${startYear}-${pad2(startMonth)}-27`,
        endDate: `${year}-${pad2(month)}-26`,
      });
    }
  }

  return periods;
}

// ─────────────────────────────────────────────
// GET / — Semua salary period, urut terbaru
// ─────────────────────────────────────────────
router.get("/", async (c) => {
  try {
    const data = await db
      .select()
      .from(salaryPeriods)
      .orderBy(desc(salaryPeriods.startDate));

    return c.json({ data: data.map(formatPeriod) });
  } catch (error) {
    console.error("[GET /salary-periods]", error);
    return c.json({ error: "Gagal mengambil data salary period" }, 500);
  }
});

// ─────────────────────────────────────────────
// POST /seed — Generate periode gajian (IDEMPOTENT)
// Harus sebelum /:id agar tidak salah route!
// ─────────────────────────────────────────────
router.post("/seed", async (c) => {
  try {
    const candidates = generateSalaryPeriods();

    // Tidak ada unique constraint pada startDate, jadi idempotency
    // dijaga manual: ambil startDate yang sudah ada, lalu skip duplikat
    const existing = await db
      .select({ startDate: salaryPeriods.startDate })
      .from(salaryPeriods);
    const existingStartDates = new Set(existing.map((p) => p.startDate));

    const toInsert = candidates.filter(
      (p) => !existingStartDates.has(p.startDate),
    );

    const inserted =
      toInsert.length > 0
        ? await db.insert(salaryPeriods).values(toInsert).returning()
        : [];

    return c.json(
      {
        data: {
          message: `Seeding selesai. ${inserted.length} salary period baru ditambahkan.`,
          inserted: inserted.length,
          skipped: candidates.length - inserted.length,
          total_generated: candidates.length,
        },
      },
      201,
    );
  } catch (error) {
    console.error("[POST /salary-periods/seed]", error);
    return c.json({ error: "Gagal melakukan seed salary period" }, 500);
  }
});

// ─────────────────────────────────────────────
// GET /:id — Satu salary period
// ─────────────────────────────────────────────
router.get("/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id) || id <= 0) {
      return c.json({ error: "ID salary period tidak valid" }, 400);
    }

    const [period] = await db
      .select()
      .from(salaryPeriods)
      .where(eq(salaryPeriods.id, id))
      .limit(1);

    if (!period) {
      return c.json({ error: "Salary period tidak ditemukan" }, 404);
    }

    return c.json({ data: formatPeriod(period) });
  } catch (error) {
    console.error("[GET /salary-periods/:id]", error);
    return c.json({ error: "Gagal mengambil data salary period" }, 500);
  }
});

// ─────────────────────────────────────────────
// POST / — Buat salary period baru
// ─────────────────────────────────────────────
router.post(
  "/",
  zValidator("json", createSalaryPeriodSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Data salary period tidak valid",
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
        .insert(salaryPeriods)
        .values({
          name: body.name,
          startDate: body.start_date,
          endDate: body.end_date,
          salaryAmount:
            body.salary_amount != null ? String(body.salary_amount) : null,
        })
        .returning();

      return c.json({ data: formatPeriod(created) }, 201);
    } catch (error) {
      console.error("[POST /salary-periods]", error);
      return c.json({ error: "Gagal membuat salary period" }, 500);
    }
  },
);

// ─────────────────────────────────────────────
// PUT /:id — Update salary period
// ─────────────────────────────────────────────
router.put(
  "/:id",
  zValidator("json", updateSalaryPeriodSchema, (result, c) => {
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
        return c.json({ error: "ID salary period tidak valid" }, 400);
      }

      const body = c.req.valid("json");

      const [existing] = await db
        .select()
        .from(salaryPeriods)
        .where(eq(salaryPeriods.id, id))
        .limit(1);

      if (!existing) {
        return c.json({ error: "Salary period tidak ditemukan" }, 404);
      }

      // Validasi cross-field dengan data yang sudah ada di database
      // Contoh: user kirim hanya end_date → bandingkan dengan start_date yang ada
      const finalStartDate = body.start_date ?? existing.startDate;
      const finalEndDate = body.end_date ?? existing.endDate;

      if (finalEndDate <= finalStartDate) {
        return c.json(
          { error: "Tanggal akhir harus setelah tanggal mulai" },
          400,
        );
      }

      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.start_date !== undefined) updateData.startDate = body.start_date;
      if (body.end_date !== undefined) updateData.endDate = body.end_date;
      if (body.salary_amount !== undefined) {
        updateData.salaryAmount =
          body.salary_amount != null ? String(body.salary_amount) : null;
      }

      const [updated] = await db
        .update(salaryPeriods)
        .set(updateData)
        .where(eq(salaryPeriods.id, id))
        .returning();

      return c.json({ data: formatPeriod(updated) });
    } catch (error) {
      console.error("[PUT /salary-periods/:id]", error);
      return c.json({ error: "Gagal memperbarui salary period" }, 500);
    }
  },
);

// ─────────────────────────────────────────────
// DELETE /:id — Hapus salary period
// ─────────────────────────────────────────────
router.delete("/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id) || id <= 0) {
      return c.json({ error: "ID salary period tidak valid" }, 400);
    }

    const [deleted] = await db
      .delete(salaryPeriods)
      .where(eq(salaryPeriods.id, id))
      .returning();

    if (!deleted) {
      return c.json({ error: "Salary period tidak ditemukan" }, 404);
    }

    return c.json({
      data: { message: "Salary period berhasil dihapus", id: deleted.id },
    });
  } catch (error) {
    console.error("[DELETE /salary-periods/:id]", error);
    return c.json({ error: "Gagal menghapus salary period" }, 500);
  }
});

export default router;
