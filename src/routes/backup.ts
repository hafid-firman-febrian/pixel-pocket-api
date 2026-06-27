import { Hono } from "hono";
import { exportTransactionsToSheet } from "../lib/google-sheets.js";
import { fetchTransactionRows } from "../lib/sheet-sync.js";

const router = new Hono();

// POST /api/backup/spreadsheet
router.post("/spreadsheet", async (c) => {
  try {
    const rows = await fetchTransactionRows();
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
