// tests/session-store.test.ts
import { test, expect, beforeAll } from "bun:test";
import { createInMemorySessionStore } from "../src/lib/session-store.js";

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = "test-secret";
  delete process.env.REFRESH_TOKEN_TTL_DAYS;
});

test("create returns a token with a future expiry", async () => {
  const store = createInMemorySessionStore();
  const { refreshToken, expiresAt } = await store.create({ userSub: "1", email: "o@e.com" });
  expect(refreshToken).toBeTruthy();
  expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
});

test("rotate issues a new token and invalidates the old one", async () => {
  const store = createInMemorySessionStore();
  const { refreshToken } = await store.create({ userSub: "1", email: "o@e.com" });
  const rotated = await store.rotate(refreshToken);
  expect(rotated).not.toBeNull();
  expect(rotated!.refreshToken).not.toBe(refreshToken);
  expect(rotated!.userSub).toBe("1");
  expect(rotated!.email).toBe("o@e.com");
  // token lama tidak bisa dirotasi lagi (reuse ditolak)
  expect(await store.rotate(refreshToken)).toBeNull();
});

test("rotate preserves the original expiry (sesi absolut)", async () => {
  const store = createInMemorySessionStore();
  const created = await store.create({ userSub: "1", email: "o@e.com" });
  const rotated = await store.rotate(created.refreshToken);
  expect(rotated!.expiresAt.getTime()).toBe(created.expiresAt.getTime());
});

test("rotate returns null for an unknown token", async () => {
  const store = createInMemorySessionStore();
  expect(await store.rotate("nope")).toBeNull();
});

test("revoke makes a token unusable", async () => {
  const store = createInMemorySessionStore();
  const { refreshToken } = await store.create({ userSub: "1", email: "o@e.com" });
  await store.revoke(refreshToken);
  expect(await store.rotate(refreshToken)).toBeNull();
});
