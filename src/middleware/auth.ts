import type { MiddlewareHandler } from "hono";
import { getTokenConfig, verifyAccessToken, type AccessClaims } from "../lib/tokens.js";

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

// Endpoint yang menerbitkan/menukar token tidak boleh butuh access token.
const PUBLIC_PATHS = new Set([
  "/api/auth/google",
  "/api/auth/refresh",
  "/api/auth/logout",
]);

type VerifyFn = (token: string) => Promise<AccessClaims>;

// Factory agar fungsi verify bisa di-inject saat test (tanpa JWT nyata).
export function createAuthMiddleware(
  verify: VerifyFn = verifyAccessToken,
): MiddlewareHandler {
  return async (c, next) => {
    if (PUBLIC_PATHS.has(c.req.path)) {
      await next();
      return;
    }

    try {
      getTokenConfig(); // pastikan AUTH_JWT_SECRET ada
    } catch (error) {
      console.error("[auth] konfigurasi tidak lengkap", error);
      return c.json({ error: "Konfigurasi autentikasi tidak lengkap" }, 500);
    }

    const header = c.req.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
      return c.json({ error: "Token autentikasi tidak ada atau tidak valid" }, 401);
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      return c.json({ error: "Token autentikasi tidak ada atau tidak valid" }, 401);
    }

    let claims: AccessClaims;
    try {
      claims = await verify(token);
    } catch (error) {
      console.error("[auth] verifikasi access token gagal", error);
      return c.json({ error: "Token autentikasi tidak ada atau tidak valid" }, 401);
    }

    c.set("user", { email: claims.email, sub: claims.sub, name: claims.name });
    await next();
  };
}

export const requireAuth = createAuthMiddleware();
