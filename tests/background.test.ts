// tests/background.test.ts
import { test, expect } from "bun:test";
import { scheduleBackgroundSync } from "../src/lib/background.js";

test("memanggil waitUntilFn yang diberikan dengan sebuah promise", () => {
  let received: Promise<unknown> | null = null;
  scheduleBackgroundSync(Promise.resolve("ok"), (p) => {
    received = p;
  });
  expect(received).toBeInstanceOf(Promise);
});

test("menelan rejection tanpa melempar (best-effort)", async () => {
  // Task latar yang gagal secara asinkron (seperti Sheets API error sungguhan)
  const rejecting = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("boom")), 0),
  );
  // Tidak boleh throw walau promise menolak
  expect(() =>
    scheduleBackgroundSync(rejecting, () => {}),
  ).not.toThrow();
  // Tunggu hingga rejection terjadi → .catch() menanganinya, tak ada unhandled rejection
  await new Promise((r) => setTimeout(r, 10));
});

test("waitUntilFn yang melempar (mis. di luar konteks Vercel) tidak menggagalkan caller", () => {
  expect(() =>
    scheduleBackgroundSync(Promise.resolve("ok"), () => {
      throw new Error("no request context");
    }),
  ).not.toThrow();
});
