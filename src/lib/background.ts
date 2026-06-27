import { waitUntil } from "@vercel/functions";

/**
 * Jadwalkan sebuah promise untuk berjalan di latar (fire-and-forget).
 *
 * Di Vercel (Node runtime) kita pakai `waitUntil` agar function serverless tetap
 * hidup sampai task selesai — tanpa ini, kerja latar bisa terpotong saat function
 * "tidur" setelah response terkirim. Di dev lokal (Bun) `waitUntil` tidak punya
 * konteks request dan akan melempar; kita tangkap saja karena promise-nya sudah
 * berjalan terdetach.
 *
 * Rejection ditelan di sini sebagai jaring pengaman — caller (mis. sheet-sync)
 * sudah best-effort dan tidak melempar, tapi ini menjaga dari unhandled rejection.
 *
 * @param waitUntilFn injectable untuk testing; default `waitUntil` dari Vercel.
 */
export function scheduleBackgroundSync(
  promise: Promise<unknown>,
  waitUntilFn: (p: Promise<unknown>) => void = waitUntil,
): void {
  const safe = promise.catch((err) => {
    console.error("[scheduleBackgroundSync] task latar gagal", err);
  });

  try {
    waitUntilFn(safe);
  } catch {
    // waitUntil tidak tersedia (mis. dev Bun, di luar konteks request Vercel).
    // Task tetap berjalan terdetach lewat `safe` di atas.
  }
}
