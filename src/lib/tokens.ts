// src/lib/tokens.ts
import { sign, verify } from "hono/jwt";
import { randomBytes, createHash } from "node:crypto";

export type AccessClaims = { sub: string; email: string; name?: string };

type TokenConfig = { secret: string; accessTtlMin: number; refreshTtlDays: number };

// Dibaca dari env tiap panggil (tanpa cache) agar konsisten di serverless & mudah diuji.
export function getTokenConfig(): TokenConfig {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error("Konfigurasi autentikasi tidak lengkap: set AUTH_JWT_SECRET");
  }
  const accessTtlMin = Number(process.env.ACCESS_TOKEN_TTL_MIN ?? 30);
  if (!Number.isFinite(accessTtlMin)) {
    throw new Error("ACCESS_TOKEN_TTL_MIN tidak valid");
  }
  const refreshTtlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
  if (!Number.isFinite(refreshTtlDays)) {
    throw new Error("REFRESH_TOKEN_TTL_DAYS tidak valid");
  }
  return { secret, accessTtlMin, refreshTtlDays };
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  const { secret, accessTtlMin } = getTokenConfig();
  const exp = Math.floor(Date.now() / 1000) + accessTtlMin * 60;
  return sign({ sub: claims.sub, email: claims.email, ...(claims.name != null ? { name: claims.name } : {}), exp }, secret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { secret } = getTokenConfig();
  const payload = await verify(token, secret, "HS256"); // melempar bila invalid/expired
  return {
    sub: String(payload.sub),
    email: String(payload.email),
    name: payload.name != null ? String(payload.name) : undefined,
  };
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshExpiry(now: Date = new Date()): Date {
  const { refreshTtlDays } = getTokenConfig();
  return new Date(now.getTime() + refreshTtlDays * 24 * 60 * 60 * 1000);
}

export function accessTtlSeconds(): number {
  return getTokenConfig().accessTtlMin * 60;
}
