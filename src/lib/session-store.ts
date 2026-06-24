// src/lib/session-store.ts
import { generateRefreshToken, hashToken, refreshExpiry } from "./tokens.js";

export type SessionIdentity = { userSub: string; email: string };
export type IssuedRefresh = { refreshToken: string; expiresAt: Date };
export type RotatedSession = {
  refreshToken: string;
  userSub: string;
  email: string;
  expiresAt: Date;
};

export type SessionStore = {
  create(input: SessionIdentity): Promise<IssuedRefresh>;
  rotate(refreshToken: string): Promise<RotatedSession | null>;
  revoke(refreshToken: string): Promise<void>;
};

type Row = { userSub: string; email: string; expiresAt: Date };

// Implementasi in-memory untuk test.
// Rotasi: token lama dihapus sehingga tidak bisa dipakai lagi (bukan deteksi replay penuh).
export function createInMemorySessionStore(): SessionStore {
  const rows = new Map<string, Row>(); // key = hash(refreshToken)

  return {
    async create({ userSub, email }) {
      const refreshToken = generateRefreshToken();
      const expiresAt = refreshExpiry();
      rows.set(hashToken(refreshToken), { userSub, email, expiresAt });
      return { refreshToken, expiresAt };
    },
    async rotate(refreshToken) {
      const hash = hashToken(refreshToken);
      const row = rows.get(hash);
      if (!row || row.expiresAt.getTime() <= Date.now()) return null;
      rows.delete(hash);
      const next = generateRefreshToken();
      rows.set(hashToken(next), { userSub: row.userSub, email: row.email, expiresAt: row.expiresAt });
      return { refreshToken: next, userSub: row.userSub, email: row.email, expiresAt: row.expiresAt };
    },
    async revoke(refreshToken) {
      rows.delete(hashToken(refreshToken));
    },
  };
}
