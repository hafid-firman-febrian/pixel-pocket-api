# Setup Autentikasi Google — Pixel Pocket API

Panduan menyiapkan Google Auth agar endpoint `/api/*` bisa diakses. Setelah fitur
auth aktif, **semua `/api/*` butuh `Authorization: Bearer <Google ID token>`**;
hanya `GET /` (health check) yang publik. Bila env auth belum diisi, semua
`/api/*` balas **500** (`Konfigurasi autentikasi tidak lengkap`).

Env yang dipakai:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_IDS` | ya | OAuth 2.0 Client ID (audience), pisah koma bila lebih dari satu. **Bukan** service account Sheets. |
| `ALLOWED_GOOGLE_EMAILS` | ya | Allowlist email yang boleh akses (single-user), pisah koma. Email lain → 403. |
| `ALLOWED_ORIGINS` | tidak | Batasi CORS ke origin tertentu (pisah koma). Kosong = izinkan semua (`*`). |

---

## A. Setup wajib

### Langkah 0 — OAuth Consent Screen (sekali saja)
Tanpa ini, login Google ditolak.

1. [Google Cloud Console](https://console.cloud.google.com) → pilih project yang sama dengan Sheets.
2. **APIs & Services → OAuth consent screen**.
3. **User Type: External** → Create.
4. Isi **App name** (mis. "Pixel Pocket"), **User support email**, **Developer contact email** → Save & Continue.
5. **Scopes:** Add → centang `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` → Update → Save & Continue.
6. **Test users:** Add Users → masukkan email Gmail-mu. Selama status "Testing", hanya test user yang boleh login (cukup untuk single-user; tidak perlu "Publish app").

### Langkah 1 — Buat OAuth 2.0 Client ID
1. **APIs & Services → Credentials**.
2. **+ Create Credentials → OAuth client ID**.
3. Pilih **Application type** sesuai klien:

| Klien | Application type | Yang perlu diisi |
|---|---|---|
| Web (browser) | **Web application** | Authorized JavaScript origins (mis. `http://localhost:5173`, domain web). Untuk tes via OAuth Playground, tambah Authorized redirect URI: `https://developers.google.com/oauthplayground` |
| Android | **Android** | Package name + SHA-1 fingerprint |
| iOS | **iOS** | Bundle ID |

4. **Create** → salin **Client ID** (`xxxxx.apps.googleusercontent.com`). Client secret tidak dipakai API (API hanya memverifikasi token).
5. Punya web **dan** mobile? Buat dua Client ID; masukkan keduanya dipisah koma di env.

### Langkah 2 — Isi `.env` lokal
Edit file `.env` (yang asli, di-gitignore — bukan `.env.example`):

```env
GOOGLE_OAUTH_CLIENT_IDS=xxxxx.apps.googleusercontent.com
ALLOWED_GOOGLE_EMAILS=you@gmail.com
ALLOWED_ORIGINS=
```

### Langkah 3 — Restart dev server
```bash
bun run dev
```
Perubahan `.env` tidak ikut hot-reload, jadi harus restart. Setelah ini `/api/*` berhenti balas 500.

### Langkah 4 — Set env di Vercel (production)
**Project Settings → Environment Variables** → tambahkan ketiga variabel (nilai sama) → redeploy. Bila belum di-set, semua `/api/*` di production balas 500.

### Langkah 5 — Cek cepat
- `GET /` → 200 (publik).
- `GET /api/categories` tanpa token → **401** (proteksi aktif).
- Uji token valid → lihat bagian C.

---

## B. Integrasi klien (mendapatkan token)
Klien login Google lalu mengirim ID token-nya:

- **Web:** Google Identity Services (GIS) → ID token.
- **Mobile:** Google Sign-In SDK (Android/iOS) → ID token.
- Setiap request ke `/api/*` kirim header: `Authorization: Bearer <ID token>`.

---

## C. Tes cepat tanpa app (OAuth Playground)
1. Buka [OAuth Playground](https://developers.google.com/oauthplayground).
2. Klik ⚙️ (Settings) → centang **Use your own OAuth credentials** → masukkan **Client ID** + **Client secret** milikmu. Ini membuat ID token ber-`aud` = Client ID-mu (audience yang diverifikasi API).
3. Pilih scope `openid email profile` → Authorize → login pakai email yang di-allowlist.
4. Tukar code → ambil **id_token** dari response.
5. Tempel ke variabel `@TOKEN` di [pixel-pocket-api.http](../pixel-pocket-api.http), jalankan request **A1** (`GET /api/auth/me`) → 200 + identitasmu. Request **A2** (tanpa token) → 401.

Perilaku benar: 401 (tanpa/invalid token), 403 (email tak diizinkan / belum verified), 200 (token valid + email cocok).

---

## Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Semua `/api/*` → 500 | `GOOGLE_OAUTH_CLIENT_IDS`/`ALLOWED_GOOGLE_EMAILS` kosong | Isi env, restart server / redeploy |
| `/api/*` → 401 walau kirim token | Token bukan ID token, expired, atau `aud` ≠ Client ID | Pakai ID token (bukan access token); pastikan token terbit untuk Client ID di env |
| `/api/*` → 403 | Email token tidak ada di `ALLOWED_GOOGLE_EMAILS`, atau `email_verified` false | Tambahkan email ke allowlist; login dengan akun yang sesuai |
| Tidak bisa login di OAuth Playground | Email belum jadi Test user, consent screen masih "Testing" | Tambahkan email ke Test users |

> **Catatan:** Backup Google Sheets (`/api/backup/spreadsheet`) memakai **service account**
> (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID`) —
> terpisah dari OAuth Client ID di atas.
