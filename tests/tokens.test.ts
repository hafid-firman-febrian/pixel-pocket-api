// tests/tokens.test.ts
import { test, expect, beforeAll, afterEach } from "bun:test";
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
  accessTtlSeconds,
  getTokenConfig,
} from "../src/lib/tokens";

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = "test-secret-please-change";
  delete process.env.ACCESS_TOKEN_TTL_MIN;
  delete process.env.REFRESH_TOKEN_TTL_DAYS;
});

afterEach(() => {
  delete process.env.ACCESS_TOKEN_TTL_MIN;
});

test("sign then verify returns the same claims", async () => {
  const token = await signAccessToken({ sub: "123", email: "owner@example.com", name: "Owner" });
  const claims = await verifyAccessToken(token);
  expect(claims).toEqual({ sub: "123", email: "owner@example.com", name: "Owner" });
});

test("verify rejects a tampered token", async () => {
  const token = await signAccessToken({ sub: "123", email: "owner@example.com" });
  await expect(verifyAccessToken(token + "x")).rejects.toThrow();
});

test("verify rejects an expired token", async () => {
  process.env.ACCESS_TOKEN_TTL_MIN = "-60";
  const token = await signAccessToken({ sub: "123", email: "owner@example.com" });
  await expect(verifyAccessToken(token)).rejects.toThrow(/expir/i);
});

test("accessTtlSeconds defaults to 30 minutes", () => {
  expect(accessTtlSeconds()).toBe(1800);
});

test("hashToken is deterministic and differs per input", () => {
  expect(hashToken("abc")).toBe(hashToken("abc"));
  expect(hashToken("abc")).not.toBe(hashToken("abd"));
});

test("generateRefreshToken returns unique base64url strings", () => {
  const a = generateRefreshToken();
  const b = generateRefreshToken();
  expect(a).not.toBe(b);
  expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
});

test("getTokenConfig throws when AUTH_JWT_SECRET is missing", () => {
  const saved = process.env.AUTH_JWT_SECRET;
  try {
    delete process.env.AUTH_JWT_SECRET;
    expect(() => getTokenConfig()).toThrow(/AUTH_JWT_SECRET/);
  } finally {
    if (saved !== undefined) {
      process.env.AUTH_JWT_SECRET = saved;
    }
  }
});
