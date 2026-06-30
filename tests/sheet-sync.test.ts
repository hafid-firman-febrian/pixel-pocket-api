// tests/sheet-sync.test.ts
import { test, expect } from "bun:test";
import { runBestEffortSync } from "../src/lib/sheet-sync.js";
import type { SheetRow } from "../src/lib/google-sheets.js";

const sampleRows: SheetRow[] = [
  {
    id: 1,
    transactionDate: "2026-06-27",
    transactionType: "expense",
    amount: 1000,
    categoryName: "Makan",
    description: null,
    createdAt: null,
  },
];

test("sukses: kembalikan ok:true dengan rowsExported", async () => {
  const result = await runBestEffortSync(
    async () => sampleRows,
    async (rows) => ({ rowsExported: rows.length }),
  );
  expect(result.ok).toBe(true);
  expect(result.rowsExported).toBe(1);
});

test("best-effort: exportRows melempar → ok:false dan TIDAK ikut throw", async () => {
  const result = await runBestEffortSync(
    async () => sampleRows,
    async () => {
      throw new Error("Google Sheets API down");
    },
  );
  expect(result.ok).toBe(false);
  expect(result.error).toBeInstanceOf(Error);
});

test("best-effort: fetchRows melempar → ok:false dan TIDAK ikut throw", async () => {
  const result = await runBestEffortSync(
    async () => {
      throw new Error("DB error");
    },
    async (rows) => ({ rowsExported: rows.length }),
  );
  expect(result.ok).toBe(false);
});
