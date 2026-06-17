import { google } from "googleapis";

function createAuthClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  // Konversi \n literal ke newline sesungguhnya
  // Ini diperlukan karena .env menyimpan newline sebagai literal \n
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

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
