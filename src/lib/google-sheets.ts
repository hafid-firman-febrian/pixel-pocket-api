import { google } from "googleapis";

/**
 * Normalisasi private key dari env agar selalu jadi PEM valid.
 *
 * Penyebab umum ERR_OSSL_UNSUPPORTED (DECODER routines::unsupported) di Vercel:
 * - value dibungkus tanda kutip yang ikut tersimpan
 * - newline tersimpan sebagai literal `\n` (perlu diubah ke newline asli)
 * - ada carriage return `\r` dari copy-paste (OpenSSL 3 strict)
 */
function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1); // buang kutip pembungkus
  }
  return key.replace(/\\n/g, "\n").replace(/\r/g, "");
}

function createAuthClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const privateKey = rawKey ? normalizePrivateKey(rawKey) : undefined;

  if (!email || !privateKey || !spreadsheetId) {
    throw new Error(
      "Konfigurasi Google Sheets tidak lengkap. Periksa GOOGLE_SERVICE_ACCOUNT_EMAIL, " +
        "GOOGLE_PRIVATE_KEY, dan GOOGLE_SPREADSHEET_ID di environment variables.",
    );
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export interface SheetRow {
  id: number;
  transactionDate: string;
  transactionType: string;
  amount: number;
  categoryName: string | null;
  description: string | null;
  createdAt: Date | null;
}

export async function exportTransactionsToSheet(rows: SheetRow[]): Promise<{
  rowsExported: number;
}> {
  const auth = createAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID!;
  const sheetName = "Transactions";

  // Header baris pertama
  const headers = [
    ["ID", "Tanggal", "Tipe", "Nominal", "Kategori", "Deskripsi", "Dibuat Pada"],
  ];

  // Ubah setiap row menjadi array nilai sesuai urutan kolom
  const dataRows = rows.map((row) => [
    row.id,
    row.transactionDate,
    row.transactionType === "income" ? "Pemasukan" : "Pengeluaran",
    row.amount,
    row.categoryName ?? "-",
    row.description ?? "-",
    row.createdAt ? row.createdAt.toISOString() : "-",
  ]);

  const values = [...headers, ...dataRows];

  // Hapus semua data lama di kolom A-G
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A:G`,
  });

  // Tulis data baru mulai dari A1
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW", // RAW = nilai disimpan as-is, bukan diinterpretasi formula
    requestBody: { values },
  });

  return { rowsExported: dataRows.length };
}
