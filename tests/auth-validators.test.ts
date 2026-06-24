// tests/auth-validators.test.ts
import { test, expect } from "bun:test";
import { googleAuthSchema, refreshSchema, logoutSchema } from "../src/validators/auth";

test("googleAuthSchema accepts a non-empty idToken", () => {
  expect(googleAuthSchema.safeParse({ idToken: "abc" }).success).toBe(true);
});

test("googleAuthSchema rejects an empty idToken", () => {
  expect(googleAuthSchema.safeParse({ idToken: "" }).success).toBe(false);
});

test("refreshSchema and logoutSchema require refreshToken", () => {
  expect(refreshSchema.safeParse({ refreshToken: "abc" }).success).toBe(true);
  expect(refreshSchema.safeParse({}).success).toBe(false);
  expect(logoutSchema.safeParse({ refreshToken: "abc" }).success).toBe(true);
  expect(logoutSchema.safeParse({}).success).toBe(false);
});
