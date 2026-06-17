import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { transactions, categories } from "../db/schema.js";
import { exportTransactionsToSheet, type SheetRow } from "../lib/google-sheets.js";

const router = new Hono();

// POST /api/backup/spreadsheet
router.post("/spreadsheet", async (c) => {
  try {
    // Ambil semua transaksi beserta nama kategorinya
    const allTransactions = await db
      .select({
        id: transactions.id,
        transactionDate: transactions.transactionDate,
        transactionType: transactions.transactionType,
        amount: transactions.amount,
        categoryName: categories.name,
        description: transactions.description,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt));

    const rows: SheetRow[] = allTransactions.map((t) => ({
      id: t.id,
      transactionDate: t.transactionDate,
      transactionType: t.transactionType,
      amount: parseFloat(t.amount),
      categoryName: t.categoryName,
      description: t.description,
      createdAt: t.createdAt,
    }));

    const result = await exportTransactionsToSheet(rows);

    return c.json({
      data: {
        message: `Backup berhasil. ${result.rowsExported} transaksi diekspor ke Google Sheets.`,
        rows_exported: result.rowsExported,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[POST /backup/spreadsheet]", error);

    // Berikan pesan error yang informatif untuk kesalahan konfigurasi
    if (error instanceof Error && error.message.includes("Konfigurasi")) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ error: "Gagal melakukan backup ke Google Sheets" }, 500);
  }
});

export default router;
