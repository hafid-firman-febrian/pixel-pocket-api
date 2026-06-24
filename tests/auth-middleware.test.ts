import { test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createAuthMiddleware } from "../src/middleware/auth";
import type { AccessClaims } from "../src/lib/tokens";

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = "test-secret";
});

function appWith(verify: (t: string) => Promise<AccessClaims>) {
  const app = new Hono();
  app.use("/api/*", createAuthMiddleware(verify));
  app.get("/api/ping", (c) => c.json({ user: c.get("user") }));
  app.post("/api/auth/google", (c) => c.json({ ok: true }));
  return app;
}

const ok: AccessClaims = { sub: "12345", email: "owner@example.com", name: "Owner" };
const neverCalled = async (): Promise<AccessClaims> => {
  throw new Error("verify should not be called");
};

test("401 when Authorization header is missing", async () => {
  const res = await appWith(neverCalled).request("/api/ping");
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "Token autentikasi tidak ada atau tidak valid" });
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

test("200 and sets user when access token is valid", async () => {
  const res = await appWith(async () => ok).request("/api/ping", {
    headers: { Authorization: "Bearer good" },
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    user: { email: "owner@example.com", sub: "12345", name: "Owner" },
  });
});

test("public auth path bypasses verification (no token needed)", async () => {
  const res = await appWith(neverCalled).request("/api/auth/google", { method: "POST" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("500 when AUTH_JWT_SECRET is missing", async () => {
  const prev = process.env.AUTH_JWT_SECRET;
  delete process.env.AUTH_JWT_SECRET;
  const res = await appWith(async () => ok).request("/api/ping", {
    headers: { Authorization: "Bearer good" },
  });
  expect(res.status).toBe(500);
  process.env.AUTH_JWT_SECRET = prev;
});
