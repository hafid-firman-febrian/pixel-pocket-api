import { test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createAuthMiddleware } from "../src/middleware/auth";
import type { GoogleTokenPayload } from "../src/lib/google-verifier";

beforeAll(() => {
  process.env.GOOGLE_OAUTH_CLIENT_IDS = "client.apps.googleusercontent.com";
  process.env.ALLOWED_GOOGLE_EMAILS = "owner@example.com";
});

function appWith(verify: (t: string, a: string[]) => Promise<GoogleTokenPayload>) {
  const app = new Hono();
  app.use("/api/*", createAuthMiddleware(verify));
  app.get("/api/ping", (c) => c.json({ user: c.get("user") }));
  return app;
}

const ok: GoogleTokenPayload = {
  email: "owner@example.com",
  email_verified: true,
  sub: "12345",
  name: "Owner",
};

const neverCalled = async (): Promise<GoogleTokenPayload> => {
  throw new Error("verify should not be called");
};

test("401 when Authorization header is missing", async () => {
  const res = await appWith(neverCalled).request("/api/ping");
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({
    error: "Token autentikasi tidak ada atau tidak valid",
  });
});

test("401 when header is not a Bearer token", async () => {
  const res = await appWith(neverCalled).request("/api/ping", {
    headers: { Authorization: "Basic abc" },
  });
  expect(res.status).toBe(401);
});

test("401 when token verification throws", async () => {
  const res = await appWith(async () => {
    throw new Error("invalid token");
  }).request("/api/ping", { headers: { Authorization: "Bearer bad" } });
  expect(res.status).toBe(401);
});

test("403 when email is not on the allowlist", async () => {
  const res = await appWith(async () => ({
    ...ok,
    email: "stranger@example.com",
  })).request("/api/ping", { headers: { Authorization: "Bearer good" } });
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "Akses ditolak untuk akun ini" });
});

test("403 when email is not verified", async () => {
  const res = await appWith(async () => ({ ...ok, email_verified: false }))
    .request("/api/ping", { headers: { Authorization: "Bearer good" } });
  expect(res.status).toBe(403);
});

test("200 and sets user when token is valid and email allowlisted", async () => {
  const res = await appWith(async () => ok).request("/api/ping", {
    headers: { Authorization: "Bearer good" },
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    user: { email: "owner@example.com", sub: "12345", name: "Owner" },
  });
});

test("matches allowlist case-insensitively", async () => {
  const res = await appWith(async () => ({ ...ok, email: "OWNER@example.com" }))
    .request("/api/ping", { headers: { Authorization: "Bearer good" } });
  expect(res.status).toBe(200);
});
