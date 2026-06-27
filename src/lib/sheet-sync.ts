import { asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { transactions, categories } from "../db/schema.js";
import { exportTransactionsToSheet, type SheetRow } from "./google-sheets.js";

/**
 * Ambil semua transaksi beserta nama kategorinya, lalu map ke bentuk SheetRow.
 * Dipakai bersama oleh auto-sync dan endpoint backup manual.
 */
export async function fetchTransactionRows(): Promise<SheetRow[]> {
  const rows = await db
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
    // Terlama di atas, terbaru di bawah (gaya buku kas — data baru menumpuk ke bawah)
    .orderBy(asc(transactions.transactionDate), asc(transactions.createdAt));

  return rows.map((t) => ({
    id: t.id,
    transactionDate: t.transactionDate,
    transactionType: t.transactionType,
    amount: parseFloat(t.amount),
    categoryName: t.categoryName,
    description: t.description,
    createdAt: t.createdAt,
  }));
}

export interface SyncResult {
  ok: boolean;
  rowsExported?: number;
  error?: unknown;
}

/**
 * Jalankan sync best-effort: fetch baris → export ke sheet. TIDAK PERNAH melempar
 * — kegagalan dikembalikan sebagai { ok: false }. Dependency di-inject agar bisa
 * diuji tanpa DB / Google Sheets sungguhan.
 */
export async function runBestEffortSync(
  fetchRows: () => Promise<SheetRow[]>,
  exportRows: (rows: SheetRow[]) => Promise<{ rowsExported: number }>,
): Promise<SyncResult> {
  try {
    const rows = await fetchRows();
    const { rowsExported } = await exportRows(rows);
    return { ok: true, rowsExported };
  } catch (error) {
    console.error("[syncTransactionsToSheet] gagal sync ke Google Sheets", error);
    return { ok: false, error };
  }
}

/**
 * Sync seluruh transaksi DB ke Google Sheets (re-sync penuh, best-effort).
 * Aman dipanggil dari latar setelah create/update/delete transaksi.
 */
export function syncTransactionsToSheet(): Promise<SyncResult> {
  return runBestEffortSync(fetchTransactionRows, exportTransactionsToSheet);
}
