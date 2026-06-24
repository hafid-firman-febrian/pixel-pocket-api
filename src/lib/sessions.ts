// src/lib/sessions.ts
import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { generateRefreshToken, hashToken, refreshExpiry } from "./tokens.js";
import type { SessionStore } from "./session-store.js";

// Implementasi produksi: simpan hanya hash refresh token. Rotasi memperbarui
// baris yang sama (token lama otomatis tidak ditemukan = reuse ditolak),
// expiry absolut dipertahankan dari saat login.
export const drizzleSessionStore: SessionStore = {
  async create({ userSub, email }) {
    const refreshToken = generateRefreshToken();
    const expiresAt = refreshExpiry();
    await db.insert(sessions).values({ userSub, email, tokenHash: hashToken(refreshToken), expiresAt });
    return { refreshToken, expiresAt };
  },

  async rotate(refreshToken) {
    const hash = hashToken(refreshToken);
    const next = generateRefreshToken();
    const rows = await db
      .update(sessions)
      .set({ tokenHash: hashToken(next), lastUsedAt: new Date() })
      .where(
        and(
          eq(sessions.tokenHash, hash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .returning();
    if (rows.length === 0) return null;
    const row = rows[0];
    return { refreshToken: next, userSub: row.userSub, email: row.email, expiresAt: row.expiresAt };
  },

  async revoke(refreshToken) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(refreshToken)));
  },
};
