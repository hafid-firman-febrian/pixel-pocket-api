// tests/auth-routes.test.ts
import { test, expect, beforeAll } from "bun:test";
import { createAuthRoutes } from "../src/routes/auth";
import { createInMemorySessionStore } from "../src/lib/session-store";
import type { GoogleTokenPayload } from "../src/lib/google-verifier";

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = "test-secret";
  process.env.GOOGLE_OAUTH_CLIENT_IDS = "client.apps.googleusercontent.com";
  process.env.ALLOWED_GOOGLE_EMAILS = "owner@example.com";
});

const okPayload: GoogleTokenPayload = {
  email: "owner@example.com",
  email_verified: true,
  sub: "12345",
  name: "Owner",
};

function app(verifyGoogle: (t: string, a: string[]) => Promise<GoogleTokenPayload>) {
  return createAuthRoutes({ verifyGoogle, sessionStore: createInMemorySessionStore() });
}

async function post(a: ReturnType<typeof app>, path: string, body: unknown) {
  return a.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST /google returns access + refresh tokens for an allowlisted email", async () => {
  const res = await post(app(async () => okPayload), "/google", { idToken: "x" });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.data.accessToken).toBeTruthy();
  expect(body.data.refreshToken).toBeTruthy();
  expect(body.data.expiresIn).toBe(1800);
  expect(body.data.user).toEqual({ email: "owner@example.com", sub: "12345", name: "Owner" });
});

test("POST /google returns 401 when Google verification fails", async () => {
  const res = await post(app(async () => { throw new Error("bad"); }), "/google", { idToken: "x" });
  expect(res.status).toBe(401);
});

test("POST /google returns 403 for a non-allowlisted email", async () => {
  const res = await post(app(async () => ({ ...okPayload, email: "stranger@example.com" })), "/google", { idToken: "x" });
  expect(res.status).toBe(403);
});

test("POST /google returns 400 for an empty body", async () => {
  const res = await post(app(async () => okPayload), "/google", {});
  expect(res.status).toBe(400);
});

test("POST /refresh rotates a valid refresh token", async () => {
  const a = app(async () => okPayload);
  const login = await (await post(a, "/google", { idToken: "x" })).json();
  const res = await post(a, "/refresh", { refreshToken: login.data.refreshToken });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.data.accessToken).toBeTruthy();
  expect(body.data.refreshToken).not.toBe(login.data.refreshToken);
  expect(body.data.expiresIn).toBe(1800);
});

test("POST /refresh returns 403 when the email was removed from the allowlist", async () => {
  const a = app(async () => okPayload);
  const login = await (await post(a, "/google", { idToken: "x" })).json();
  const { refreshToken } = login.data;
  const prev = process.env.ALLOWED_GOOGLE_EMAILS;
  try {
    process.env.ALLOWED_GOOGLE_EMAILS = "someone-else@example.com";
    const res = await post(a, "/refresh", { refreshToken });
    expect(res.status).toBe(403);
  } finally {
    process.env.ALLOWED_GOOGLE_EMAILS = prev;
  }
});

test("POST /refresh returns 401 for an invalid refresh token", async () => {
  const res = await post(app(async () => okPayload), "/refresh", { refreshToken: "nope" });
  expect(res.status).toBe(401);
});

test("POST /logout is idempotent and returns success", async () => {
  const res = await post(app(async () => okPayload), "/logout", { refreshToken: "whatever" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ data: { success: true } });
});
