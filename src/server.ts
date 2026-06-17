import app from "./index.js";

// Bun membaca export default sebagai konfigurasi HTTP server bawaan
const port = parseInt(process.env.PORT ?? "3000", 10);

console.log(`🚀 Pixel Pocket API berjalan di http://localhost:${port}`);
console.log(
  `   Database: ${process.env.DATABASE_URL ? "✅ Terhubung" : "❌ DATABASE_URL tidak ditemukan"}`,
);

export default {
  port,
  fetch: app.fetch,
};
