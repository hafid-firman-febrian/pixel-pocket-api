import { test, expect, beforeAll } from "bun:test";

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = "test-secret";
  process.env.GOOGLE_OAUTH_CLIENT_IDS = "client.apps.googleusercontent.com";
  process.env.ALLOWED_GOOGLE_EMAILS = "owner@example.com";
});

test("health check is public", async () => {
  const app = (await import("../src/index")).default;
  const res = await app.request("/");
  expect(res.status).toBe(200);
});

test("protected /api route rejects requests without a token", async () => {
  const app = (await import("../src/index")).default;
  const res = await app.request("/api/categories");
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({
    error: "Token autentikasi tidak ada atau tidak valid",
  });
});

test("protected /api/auth/me rejects requests without a token", async () => {
  const app = (await import("../src/index")).default;
  const res = await app.request("/api/auth/me");
  expect(res.status).toBe(401);
});

test("public /api/auth/google bypasses auth (400 for empty body, not 401)", async () => {
  const app = (await import("../src/index")).default;
  const res = await app.request("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(400);
});
