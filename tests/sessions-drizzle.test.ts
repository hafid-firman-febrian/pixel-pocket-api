// tests/sessions-drizzle.test.ts
import { test, expect, beforeAll } from "bun:test";

const hasDb = !!process.env.DATABASE_URL;

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = "test-secret";
});

test.if(hasDb)("create → rotate → revoke against real DB", async () => {
  const { drizzleSessionStore } = await import("../src/lib/sessions");
  const sub = "test-" + Math.floor(Date.now()).toString();
  const { refreshToken } = await drizzleSessionStore.create({ userSub: sub, email: "o@e.com" });
  const rotated = await drizzleSessionStore.rotate(refreshToken);
  expect(rotated).not.toBeNull();
  expect(await drizzleSessionStore.rotate(refreshToken)).toBeNull(); // token lama mati
  await drizzleSessionStore.revoke(rotated!.refreshToken);
  expect(await drizzleSessionStore.rotate(rotated!.refreshToken)).toBeNull();
});

test("module imports without DATABASE_URL side effects at type level", async () => {
  // Pastikan file ada & dapat di-resolve (tanpa konek DB).
  expect(typeof (await import("../src/lib/sessions")).drizzleSessionStore).toBe("object");
});
