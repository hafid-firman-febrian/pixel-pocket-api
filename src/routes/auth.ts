import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getAuthConfig } from "../lib/auth-config.js";
import {
  verifyGoogleToken,
  type GoogleTokenPayload,
} from "../lib/google-verifier.js";
import { signAccessToken, accessTtlSeconds } from "../lib/tokens.js";
import { drizzleSessionStore } from "../lib/sessions.js";
import type { SessionStore } from "../lib/session-store.js";
import {
  googleAuthSchema,
  refreshSchema,
  logoutSchema,
} from "../validators/auth.js";

type Deps = {
  verifyGoogle?: (idToken: string, audience: string[]) => Promise<GoogleTokenPayload>;
  sessionStore?: SessionStore;
};

// DIAGNOSTIK SEMENTARA: batasi tiap langkah agar hang tak berkepanjangan dan
// log timing-nya, supaya ketahuan langkah mana yang macet di Vercel.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${ms}ms pada langkah: ${label}`)), ms),
    ),
  ]);
}

export function createAuthRoutes(deps: Deps = {}) {
  const verifyGoogle = deps.verifyGoogle ?? verifyGoogleToken;
  const sessionStore = deps.sessionStore ?? drizzleSessionStore;
  const router = new Hono();

  // Tukar Google ID token → access + refresh token milik kita.
  router.post(
    "/google",
    zValidator("json", googleAuthSchema, (result, c) => {
      if (!result.success) {
        return c.json(
          { error: "Body tidak valid", details: z.flattenError(result.error).fieldErrors },
          400,
        );
      }
    }),
    async (c) => {
      let config;
      try {
        config = getAuthConfig();
      } catch (error) {
        console.error("[auth] konfigurasi tidak lengkap", error);
        return c.json({ error: "Konfigurasi autentikasi tidak lengkap" }, 500);
      }

      const { idToken } = c.req.valid("json");

      let payload: GoogleTokenPayload;
      try {
        console.log("[auth] mulai verifikasi Google token");
        const t0 = Date.now();
        payload = await withTimeout(verifyGoogle(idToken, config.clientIds), 8000, "verifyGoogle");
        console.log(`[auth] verifikasi Google token OK dalam ${Date.now() - t0}ms`);
      } catch (error) {
        console.error("[auth] verifikasi Google token gagal/timeout", error);
        return c.json({ error: "Token Google tidak valid atau verifikasi timeout" }, 504);
      }

      const email = payload.email?.toLowerCase();
      if (!payload.email_verified || !email || !config.allowedEmails.includes(email)) {
        return c.json({ error: "Akses ditolak untuk akun ini" }, 403);
      }

      let refreshToken: string;
      try {
        console.log("[auth] mulai simpan sesi (DB insert)");
        const t1 = Date.now();
        ({ refreshToken } = await withTimeout(
          sessionStore.create({ userSub: payload.sub, email }),
          8000,
          "sessionStore.create",
        ));
        console.log(`[auth] simpan sesi OK dalam ${Date.now() - t1}ms`);
      } catch (error) {
        console.error("[auth] simpan sesi gagal/timeout (DB)", error);
        return c.json({ error: "Gagal menyimpan sesi (DB timeout)" }, 504);
      }
      const accessToken = await signAccessToken({ sub: payload.sub, email, name: payload.name });

      return c.json({
        data: {
          accessToken,
          refreshToken,
          expiresIn: accessTtlSeconds(),
          user: { email, sub: payload.sub, name: payload.name },
        },
      });
    },
  );

  // Tukar refresh token → access token baru (+ refresh token baru, rotasi).
  router.post(
    "/refresh",
    zValidator("json", refreshSchema, (result, c) => {
      if (!result.success) {
        return c.json(
          { error: "Body tidak valid", details: z.flattenError(result.error).fieldErrors },
          400,
        );
      }
    }),
    async (c) => {
      const { refreshToken } = c.req.valid("json");
      const rotated = await sessionStore.rotate(refreshToken);
      if (!rotated) {
        return c.json({ error: "Sesi tidak valid, silakan login ulang" }, 401);
      }
      let config;
      try {
        config = getAuthConfig();
      } catch (error) {
        console.error("[auth] konfigurasi tidak lengkap", error);
        return c.json({ error: "Konfigurasi autentikasi tidak lengkap" }, 500);
      }
      if (!config.allowedEmails.includes(rotated.email.toLowerCase())) {
        await sessionStore.revoke(rotated.refreshToken);
        return c.json({ error: "Akses ditolak untuk akun ini" }, 403);
      }
      const accessToken = await signAccessToken({ sub: rotated.userSub, email: rotated.email });
      return c.json({
        data: { accessToken, refreshToken: rotated.refreshToken, expiresIn: accessTtlSeconds() },
      });
    },
  );

  // Revoke sesi (idempotent).
  router.post(
    "/logout",
    zValidator("json", logoutSchema, (result, c) => {
      if (!result.success) {
        return c.json(
          { error: "Body tidak valid", details: z.flattenError(result.error).fieldErrors },
          400,
        );
      }
    }),
    async (c) => {
      const { refreshToken } = c.req.valid("json");
      await sessionStore.revoke(refreshToken);
      return c.json({ data: { success: true } });
    },
  );

  // Identitas dari access token saat ini (diproteksi middleware global).
  router.get("/me", (c) => c.json({ data: c.get("user") }));

  return router;
}

export default createAuthRoutes();
