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
