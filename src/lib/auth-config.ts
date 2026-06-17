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
