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
        payload = await verifyGoogle(idToken, config.clientIds);
      } catch (error) {
        console.error("[auth] verifikasi Google token gagal", error);
        return c.json({ error: "Token Google tidak valid" }, 401);
      }

      const email = payload.email?.toLowerCase();
      if (!payload.email_verified || !email || !config.allowedEmails.includes(email)) {
        return c.json({ error: "Akses ditolak untuk akun ini" }, 403);
      }

      const { refreshToken } = await sessionStore.create({ userSub: payload.sub, email });
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
