# Google Auth (Single-User) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect all `/api/*` routes by verifying a Google ID token and matching the caller's email against an allowlist (single-user), leaving health check public.

**Architecture:** A thin verifier (`google-verifier.ts`) wraps `google-auth-library`'s `OAuth2Client.verifyIdToken`. A config reader (`auth-config.ts`) parses env. A Hono middleware (`auth.ts`) ties them together: extract Bearer token → verify → check `email_verified` + allowlist → set `c.user`. The middleware is built via a factory that accepts an injectable verify function, so policy logic is unit-tested with a mock (no network). `index.ts` mounts it on `/api/*` and makes CORS env-driven.

**Tech Stack:** Bun, Hono, `google-auth-library` (already installed via `googleapis`), TypeScript (strict), `bun test`.

## Global Constraints

- Runtime: Bun (dev) / Vercel Node (deploy). Do NOT switch to Edge.
- No database schema changes in this feature. No `users` table, no `user_id` columns.
- Code style: double quotes, Indonesian user-facing error messages, `{ error: string }` shape, matching existing routes.
- Commits: plain messages, NO `Co-Authored-By`/Claude trailer (enforced by `.claude/settings.json` `includeCoAuthoredBy:false`).
- Auth library: `google-auth-library` `OAuth2Client.verifyIdToken({ idToken, audience })`.
- Env var names (exact): `GOOGLE_OAUTH_CLIENT_IDS`, `ALLOWED_GOOGLE_EMAILS`, `ALLOWED_ORIGINS`.
- Protected: every `/api/*` (including `/api/backup/*` and `/api/auth/me`). Public: `GET /`.
- Error contract: missing/invalid token → 401 `{ "error": "Token autentikasi tidak ada atau tidak valid" }`; verified token but disallowed/unverified email → 403 `{ "error": "Akses ditolak untuk akun ini" }`; incomplete auth env → 500 `{ "error": "Konfigurasi autentikasi tidak lengkap" }`.

---

## File Structure

- Create `src/lib/auth-config.ts` — parse & validate auth env (`getAuthConfig`).
- Create `src/lib/google-verifier.ts` — thin adapter over `OAuth2Client.verifyIdToken` (`verifyGoogleToken`, `GoogleTokenPayload`).
- Create `src/middleware/auth.ts` — `createAuthMiddleware(verify)` factory + `requireGoogleAuth`; declares `AuthUser` and augments Hono `ContextVariableMap`.
- Create `src/routes/auth.ts` — `GET /me` returning current identity.
- Modify `src/index.ts` — env-driven CORS, mount `requireGoogleAuth` on `/api/*`, register `/api/auth`.
- Create `tests/auth-config.test.ts`, `tests/auth-middleware.test.ts`, `tests/index-auth.test.ts`.
- Modify `.env.example`, `pixel-pocket-api.http`, `CLAUDE.md` (docs/finalization).

---

## Task 1: Auth config reader

**Files:**
- Create: `src/lib/auth-config.ts`
- Test: `tests/auth-config.test.ts`

**Interfaces:**
- Produces: `getAuthConfig(): { clientIds: string[]; allowedEmails: string[] }` — parses `GOOGLE_OAUTH_CLIENT_IDS` and `ALLOWED_GOOGLE_EMAILS` (comma-separated, trimmed; emails lowercased), throws `Error` if either resolves empty. Reads env on every call (no caching, so serverless env and tests see fresh values).

- [ ] **Step 1: Write the failing test**

Create `tests/auth-config.test.ts`:
```ts
import { test, expect, beforeEach, afterEach } from "bun:test";
import { getAuthConfig } from "../src/lib/auth-config";

const SAVED = {
  ids: process.env.GOOGLE_OAUTH_CLIENT_IDS,
  emails: process.env.ALLOWED_GOOGLE_EMAILS,
};

beforeEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_IDS = " a.apps.googleusercontent.com , b.apps.googleusercontent.com ";
  process.env.ALLOWED_GOOGLE_EMAILS = "Owner@Example.com";
});

afterEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_IDS = SAVED.ids;
  process.env.ALLOWED_GOOGLE_EMAILS = SAVED.emails;
});

test("parses comma-separated client ids, trimming whitespace", () => {
  const cfg = getAuthConfig();
  expect(cfg.clientIds).toEqual([
    "a.apps.googleusercontent.com",
    "b.apps.googleusercontent.com",
  ]);
});

test("lowercases allowlisted emails", () => {
  expect(getAuthConfig().allowedEmails).toEqual(["owner@example.com"]);
});

test("throws when client ids are missing", () => {
  delete process.env.GOOGLE_OAUTH_CLIENT_IDS;
  expect(() => getAuthConfig()).toThrow("Konfigurasi autentikasi tidak lengkap");
});

test("throws when allowed emails are missing", () => {
  delete process.env.ALLOWED_GOOGLE_EMAILS;
  expect(() => getAuthConfig()).toThrow("Konfigurasi autentikasi tidak lengkap");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/auth-config.test.ts`
Expected: FAIL — cannot find module `../src/lib/auth-config`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/auth-config.ts`:
```ts
export type AuthConfig = {
  clientIds: string[];
  allowedEmails: string[];
};

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Dibaca dari env tiap kali dipanggil (tanpa cache) agar konsisten di
// serverless dan mudah diuji.
export function getAuthConfig(): AuthConfig {
  const clientIds = parseList(process.env.GOOGLE_OAUTH_CLIENT_IDS);
  const allowedEmails = parseList(process.env.ALLOWED_GOOGLE_EMAILS).map((e) =>
    e.toLowerCase(),
  );

  if (clientIds.length === 0 || allowedEmails.length === 0) {
    throw new Error(
      "Konfigurasi autentikasi tidak lengkap: set GOOGLE_OAUTH_CLIENT_IDS dan ALLOWED_GOOGLE_EMAILS",
    );
  }

  return { clientIds, allowedEmails };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/auth-config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-config.ts tests/auth-config.test.ts
git commit -m "Add auth config reader for Google client IDs and email allowlist"
```

---

## Task 2: Google token verifier (thin adapter)

**Files:**
- Create: `src/lib/google-verifier.ts`

**Interfaces:**
- Produces: `type GoogleTokenPayload = { email?: string; email_verified?: boolean; sub: string; name?: string }` and `verifyGoogleToken(idToken: string, audience: string[]): Promise<GoogleTokenPayload>`. Throws if the token is invalid or the payload is empty.
- Consumes: `google-auth-library` `OAuth2Client`.

This is a thin network adapter (calls Google to validate the token), so it has no unit test — its policy is exercised through the middleware tests with a mocked verify function, and end-to-end via the `.http` file. Verification here is a typecheck only.

- [ ] **Step 1: Write the implementation**

Create `src/lib/google-verifier.ts`:
```ts
import { OAuth2Client } from "google-auth-library";

// Satu instance modul; google-auth-library meng-cache kunci publik Google.
const client = new OAuth2Client();

export type GoogleTokenPayload = {
  email?: string;
  email_verified?: boolean;
  sub: string;
  name?: string;
};

// Verifikasi Google ID token terhadap daftar audience (OAuth client IDs).
// Melempar bila token invalid/expired/audience tidak cocok, atau payload kosong.
export async function verifyGoogleToken(
  idToken: string,
  audience: string[],
): Promise<GoogleTokenPayload> {
  const ticket = await client.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error("Token Google tidak memiliki payload");
  }

  return {
    email: payload.email,
    email_verified: payload.email_verified,
    sub: payload.sub,
    name: payload.name,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0 (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/google-verifier.ts
git commit -m "Add Google ID token verifier adapter"
```

---

## Task 3: Auth middleware (core policy, TDD)

**Files:**
- Create: `src/middleware/auth.ts`
- Test: `tests/auth-middleware.test.ts`

**Interfaces:**
- Consumes: `getAuthConfig` (Task 1), `verifyGoogleToken` + `GoogleTokenPayload` (Task 2).
- Produces:
  - `type AuthUser = { email: string; sub: string; name?: string }`
  - `createAuthMiddleware(verify?: (idToken: string, audience: string[]) => Promise<GoogleTokenPayload>): MiddlewareHandler` — defaults `verify` to `verifyGoogleToken`.
  - `requireGoogleAuth: MiddlewareHandler` = `createAuthMiddleware()`.
  - Module augmentation so `c.get("user")` is typed as `AuthUser`.
- Behavior: 500 if config throws; 401 if no/blank/non-Bearer token or verify throws; 403 if `!email_verified` or email not in allowlist; else `c.set("user", {...})` and `await next()`.

- [ ] **Step 1: Write the failing test**

Create `tests/auth-middleware.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/auth-middleware.test.ts`
Expected: FAIL — cannot find module `../src/middleware/auth`.

- [ ] **Step 3: Write minimal implementation**

Create `src/middleware/auth.ts`:
```ts
import type { MiddlewareHandler } from "hono";
import { getAuthConfig } from "../lib/auth-config";
import {
  verifyGoogleToken,
  type GoogleTokenPayload,
} from "../lib/google-verifier";

export type AuthUser = {
  email: string;
  sub: string;
  name?: string;
};

// Buat c.get("user") ber-tipe di seluruh aplikasi.
declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

type VerifyFn = (
  idToken: string,
  audience: string[],
) => Promise<GoogleTokenPayload>;

// Factory agar fungsi verify bisa di-inject saat test (tanpa jaringan).
export function createAuthMiddleware(
  verify: VerifyFn = verifyGoogleToken,
): MiddlewareHandler {
  return async (c, next) => {
    let config;
    try {
      config = getAuthConfig();
    } catch (error) {
      console.error("[auth] konfigurasi tidak lengkap", error);
      return c.json({ error: "Konfigurasi autentikasi tidak lengkap" }, 500);
    }

    const header = c.req.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
      return c.json(
        { error: "Token autentikasi tidak ada atau tidak valid" },
        401,
      );
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      return c.json(
        { error: "Token autentikasi tidak ada atau tidak valid" },
        401,
      );
    }

    let payload: GoogleTokenPayload;
    try {
      payload = await verify(token, config.clientIds);
    } catch (error) {
      console.error("[auth] verifikasi token gagal", error);
      return c.json(
        { error: "Token autentikasi tidak ada atau tidak valid" },
        401,
      );
    }

    const email = payload.email?.toLowerCase();
    if (!payload.email_verified || !email || !config.allowedEmails.includes(email)) {
      return c.json({ error: "Akses ditolak untuk akun ini" }, 403);
    }

    c.set("user", { email, sub: payload.sub, name: payload.name });
    await next();
  };
}

export const requireGoogleAuth = createAuthMiddleware();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/auth-middleware.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/middleware/auth.ts tests/auth-middleware.test.ts
git commit -m "Add Google auth middleware with email allowlist"
```

---

## Task 4: Wire middleware into the app + /api/auth/me

**Files:**
- Create: `src/routes/auth.ts`
- Modify: `src/index.ts`
- Test: `tests/index-auth.test.ts`

**Interfaces:**
- Consumes: `requireGoogleAuth` (Task 3), `c.get("user")` (Task 3).
- Produces: `GET /api/auth/me` → `{ data: { email, sub, name? } }`; app behavior: `GET /` public (200), any `/api/*` without a Bearer token → 401.

The integration test uses the REAL `requireGoogleAuth`. Tests only exercise the public route and the no-token 401 path — both short-circuit before any network/DB call — so no Google token or live DB is needed.

- [ ] **Step 1: Write the `/me` route**

Create `src/routes/auth.ts`:
```ts
import { Hono } from "hono";

const router = new Hono();

// GET /api/auth/me — identitas dari token saat ini (untuk klien cek validitas)
router.get("/me", (c) => {
  return c.json({ data: c.get("user") });
});

export default router;
```

- [ ] **Step 2: Write the failing integration test**

Create `tests/index-auth.test.ts`:
```ts
import { test, expect, beforeAll } from "bun:test";

beforeAll(() => {
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/index-auth.test.ts`
Expected: FAIL — `/api/categories` returns 200 (no middleware yet) instead of 401.

- [ ] **Step 4: Modify `src/index.ts`**

Apply these exact changes.

(a) Replace the import block top section — add the auth imports after the existing route imports:
```ts
import summary from "./routes/summary";
import backup from "./routes/backup";
import auth from "./routes/auth";
import { requireGoogleAuth } from "./middleware/auth";
```

(b) Replace the CORS middleware block with an env-driven origin:
```ts
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  "*",
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);
```

(c) Immediately after `app.use("*", logger());`, before the health check, add the guard:
```ts
// Semua /api/* wajib Google ID token valid + email ter-allowlist.
// Health check "/" tetap publik (di luar /api).
app.use("/api/*", requireGoogleAuth);
```

(d) In the Routes section, register the auth route alongside the others:
```ts
app.route("/api/summary", summary);
app.route("/api/backup", backup);
app.route("/api/auth", auth);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/index-auth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Full typecheck + full test suite**

Run: `bunx tsc --noEmit && bun test`
Expected: tsc exit 0; all tests pass (config 4 + middleware 7 + index 3 = 14).

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/routes/auth.ts tests/index-auth.test.ts
git commit -m "Protect /api routes with Google auth middleware and add /api/auth/me"
```

---

## Task 5: Docs & config (.env.example, .http, CLAUDE.md)

**Files:**
- Modify: `.env.example`
- Modify: `pixel-pocket-api.http`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: env var names and route behavior from Tasks 1–4. No code; documentation only.

- [ ] **Step 1: Update `.env.example`**

Append to `.env.example`:
```env

# Autentikasi Google (Sign in with Google)
# OAuth 2.0 Client ID(s) dari Google Cloud Console (bukan service account Sheets).
# Bisa lebih dari satu (web + mobile), pisahkan dengan koma.
GOOGLE_OAUTH_CLIENT_IDS=xxx.apps.googleusercontent.com
# Email yang diizinkan mengakses API (single-user). Pisahkan koma bila lebih dari satu.
ALLOWED_GOOGLE_EMAILS=you@gmail.com
# Opsional: batasi CORS ke origin tertentu (pisahkan koma). Kosong = izinkan semua.
ALLOWED_ORIGINS=
```

- [ ] **Step 2: Update `pixel-pocket-api.http`**

After the `@BASE_URL` lines near the top, add a token variable and usage note:
```http
# Auth: semua /api/* butuh Google ID token. Ambil token via Google Identity
# Services (web) / Google Sign-In SDK (mobile) atau OAuth Playload, lalu isi di sini:
@TOKEN = PASTE_GOOGLE_ID_TOKEN_HERE
```

Then add an Auth section before the CATEGORIES section:
```http
###########################################################
# 🔐 AUTH
###########################################################

### A1. Identitas dari token saat ini
GET {{BASE_URL}}/api/auth/me
Authorization: Bearer {{TOKEN}}

### A2. Error: tanpa token (401)
GET {{BASE_URL}}/api/categories

### A3. Contoh request terproteksi dengan token
GET {{BASE_URL}}/api/categories
Authorization: Bearer {{TOKEN}}
```

Note in the plan (no code change needed beyond the above): the existing requests still work once you add `Authorization: Bearer {{TOKEN}}` to them; A2/A3 demonstrate the pattern.

- [ ] **Step 3: Update `CLAUDE.md`**

(a) Add an "Autentikasi" section after the "Environment Variables" section:
```markdown
## Autentikasi

API dilindungi **Google Auth (single-user)**. Semua `/api/*` butuh header
`Authorization: Bearer <Google ID token>`; health check `GET /` tetap publik.

**Alur:** klien login Google → dapat ID token → kirim sebagai Bearer →
middleware `requireGoogleAuth` ([src/middleware/auth.ts](src/middleware/auth.ts))
memverifikasi token via `google-auth-library` lalu mencocokkan email ke allowlist.

- `GOOGLE_OAUTH_CLIENT_IDS` — OAuth 2.0 Client ID (audience), comma-separated. **Bukan** service account Sheets.
- `ALLOWED_GOOGLE_EMAILS` — allowlist email (single-user), comma-separated.
- `ALLOWED_ORIGINS` — opsional; batasi CORS. Kosong = `*`.

Error: 401 token tidak ada/invalid; 403 email tidak diizinkan/belum verified.
`GET /api/auth/me` mengembalikan identitas token saat ini.

**Migrasi multi-user nanti:** hapus allowlist → tabel `users` ber-key Google `sub`
→ kolom `user_id` di 3 tabel → filter query per `c.get("user").sub`. Identitas
(`sub`) sudah tersedia di context sejak fase ini.
```

(b) Add a row to the "Environment Variables" env block (after the Google Sheets vars):
```env
# Autentikasi Google
GOOGLE_OAUTH_CLIENT_IDS=xxx.apps.googleusercontent.com
ALLOWED_GOOGLE_EMAILS=you@gmail.com
ALLOWED_ORIGINS=
```

(c) Add a row to the "Endpoint Summary" table:
```markdown
| GET | `/api/auth/me` | Identitas dari Google ID token saat ini |
```

(d) Add a row to the "Hal yang Sering Salah" table:
```markdown
| Semua `/api/*` balas 401 | Lupa header `Authorization: Bearer <token>` | Sertakan Google ID token; cek `GOOGLE_OAUTH_CLIENT_IDS`/`ALLOWED_GOOGLE_EMAILS` terisi |
```

- [ ] **Step 4: Typecheck (sanity, no code changed) and commit**

Run: `bunx tsc --noEmit`
Expected: exit 0.

```bash
git add .env.example pixel-pocket-api.http CLAUDE.md
git commit -m "Document Google auth: env, .http token usage, and CLAUDE.md"
```

---

## Manual Verification (after all tasks)

Requires a real Google ID token and the env vars set in `.env`:
1. Set `GOOGLE_OAUTH_CLIENT_IDS` + `ALLOWED_GOOGLE_EMAILS` in `.env`, restart `bun run dev`.
2. `GET /` → 200 (public).
3. `GET /api/categories` without header → 401.
4. `GET /api/auth/me` with `Authorization: Bearer <valid token for allowlisted email>` → 200 with identity.
5. Same with a token for a non-allowlisted account → 403.

---

## Self-Review Notes

- **Spec coverage:** §3 alur → Task 3/4; §4.1 config → Task 1; §4.2 middleware → Task 3; §4.3 index wiring → Task 4; §4.4 `/api/auth/me` → Task 4; §5 env/CORS → Task 4 (CORS) + Task 5 (.env.example); §6 errors → Tasks 3/4 tests; §7 testing → Tasks 1/3/4 + Manual; §8 docs incl. CLAUDE.md → Task 5; §9 multi-user note → CLAUDE.md in Task 5.
- **Verifier (§4.2 token verify):** isolated in Task 2 as a thin network adapter; policy tested via mocked verify in Task 3 (intentional test boundary — no live Google calls in CI).
- **Type consistency:** `GoogleTokenPayload` (Task 2) consumed by Task 3; `AuthUser` shape `{ email, sub, name? }` consistent across middleware, `/me` route, and tests; env names match Global Constraints everywhere.
