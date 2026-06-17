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
