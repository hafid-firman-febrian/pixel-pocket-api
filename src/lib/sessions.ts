// src/lib/sessions.ts
import { eq } from "drizzle-orm";
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
    const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, hash));
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;

    const next = generateRefreshToken();
    await db
      .update(sessions)
      .set({ tokenHash: hashToken(next), lastUsedAt: new Date() })
      .where(eq(sessions.tokenHash, hash));

    return { refreshToken: next, userSub: row.userSub, email: row.email, expiresAt: row.expiresAt };
  },

  async revoke(refreshToken) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(refreshToken)));
  },
};
