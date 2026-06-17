# Setup Autentikasi Google — Pixel Pocket API

Panduan **lengkap & detail** menyiapkan Google Auth agar endpoint `/api/*` bisa diakses.

> **Ringkasan cara kerja.** Klien (web/mobile) login ke akun Google → Google memberi
> **ID token** (sebuah JWT). Klien mengirim token itu ke API sebagai header
> `Authorization: Bearer <ID token>`. Middleware `requireGoogleAuth`
> ([src/middleware/auth.ts](../src/middleware/auth.ts)) memverifikasi token ke Google
> (`google-auth-library`), memastikan `email_verified` true, lalu mencocokkan email ke
> **allowlist**. Cocok → lanjut; tidak → ditolak. API **tidak** menyimpan password dan
> **tidak** menerbitkan token sendiri.

**Aturan akses setelah auth aktif:**
- `GET /` (health check) → **publik**, tetap bisa diakses tanpa token.
- Semua `/api/*` (termasuk `/api/auth/me`, `/api/backup/*`) → **wajib token**.
- Bila env auth belum diisi → semua `/api/*` balas **500** (`Konfigurasi autentikasi tidak lengkap`).

**Tiga environment variable yang dipakai:**

| Variabel | Wajib | Contoh | Keterangan |
|---|---|---|---|
| `GOOGLE_OAUTH_CLIENT_IDS` | ✅ | `812....apps.googleusercontent.com` | OAuth 2.0 Client ID (dipakai sebagai *audience* saat verifikasi). Pisah koma bila >1 (web + mobile). **Bukan** service account Sheets. |
| `ALLOWED_GOOGLE_EMAILS` | ✅ | `dev.ammarhanif@gmail.com` | Daftar email yang boleh akses (single-user). Pisah koma. Email di luar daftar → 403. Pencocokan **case-insensitive**. |
| `ALLOWED_ORIGINS` | ⬜ | `https://app.kamu.com,http://localhost:5173` | Batasi CORS ke origin tertentu (pisah koma). **Kosong = izinkan semua (`*`)**. |

> **Penting — dua kredensial Google yang BERBEDA.** Jangan tertukar:
> - **Service account** (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`) → dipakai fitur **backup Sheets** (server-ke-server).
> - **OAuth Client ID** (`GOOGLE_OAUTH_CLIENT_IDS`) → dipakai **login user / auth** ini.
>
> Keduanya boleh berada di satu project Google Cloud, tapi bukan benda yang sama.

---

## A. Setup wajib (server bisa menerima request)

### Langkah 0 — Konfigurasi OAuth Consent Screen (sekali per project)

Consent screen adalah halaman izin yang muncul saat user login Google. Wajib ada sebelum Client ID bisa dipakai.

> **Catatan UI:** Google sedang memindahkan menu ini ke **"Google Auth Platform"**. Kamu mungkin melihat **APIs & Services → OAuth consent screen** (UI lama) atau **Google Auth Platform → Branding / Audience / Clients** (UI baru). Isinya sama, hanya tata letak berbeda.

1. Buka [Google Cloud Console](https://console.cloud.google.com) → pastikan **project yang benar** terpilih di dropdown atas (boleh project yang sama dengan backup Sheets).
2. Menu kiri → **APIs & Services → OAuth consent screen** (atau **Google Auth Platform**).
3. **User Type → External** → **Create**. (External = akun Google mana pun bisa, tapi selama "Testing" dibatasi ke test users — ini yang kita mau untuk single-user.)
4. **Halaman "App information":**
   - **App name:** mis. `Pixel Pocket`
   - **User support email:** pilih email-mu
   - **App logo:** opsional, lewati
5. **Developer contact information:** isi email-mu → **Save and Continue**.
6. **Halaman "Scopes":** klik **Add or Remove Scopes** → centang tiga ini → **Update** → **Save and Continue**:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
7. **Halaman "Test users":** **Add Users** → masukkan **email Gmail yang akan kamu allowlist** (mis. `dev.ammarhanif@gmail.com`) → **Save and Continue**.
   - ⚠️ Selama app berstatus **"Testing"**, **hanya** email di daftar Test users yang bisa login. Untuk single-user ini sudah cukup — **tidak perlu** klik "Publish app".

### Langkah 1 — Buat OAuth 2.0 Client ID

1. Menu kiri → **APIs & Services → Credentials**.
2. **+ Create Credentials** → **OAuth client ID**.
3. Pilih **Application type** sesuai klien yang akan memanggil API:

#### Opsi Web application (frontend di browser)
- **Name:** mis. `pixel-pocket-web`
- **Authorized JavaScript origins** → Add URI untuk tiap origin frontend:
  - `http://localhost:5173` (dev Vite), atau `http://localhost:3000`, sesuaikan
  - `https://app.kamu.com` (domain production)
- **Authorized redirect URIs** → tambahkan **hanya bila** memakai alur redirect. Untuk tes via OAuth Playground (lihat Bagian C), tambahkan:
  - `https://developers.google.com/oauthplayground`
- **Create**.

#### Opsi Android
- **Name:** mis. `pixel-pocket-android`
- **Package name:** mis. `com.kamu.pixelpocket` (sesuai `applicationId` app)
- **SHA-1 certificate fingerprint:** ambil dengan salah satu:
  ```bash
  # Debug keystore (development)
  keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1
  # atau via Gradle
  ./gradlew signingReport
  ```
  Salin nilai **SHA1** dan tempel.
- **Create**.

#### Opsi iOS
- **Name:** mis. `pixel-pocket-ios`
- **Bundle ID:** mis. `com.kamu.pixelpocket` (sama dengan di Xcode)
- **Create**.

4. Setelah Create muncul dialog berisi **Client ID** seperti `812345678901-abc123def456.apps.googleusercontent.com`. **Salin Client ID** ini.
   - **Client secret tidak dipakai** API kita (API hanya *memverifikasi* token, tidak menukar code). Secret hanya diperlukan klien web tertentu / OAuth Playground.
5. Punya **web dan mobile**? Ulangi untuk tiap platform, lalu masukkan **semua** Client ID dipisah koma di env (Langkah 2).

### Langkah 2 — Isi `.env` lokal

Buka file `.env` (file asli yang **di-gitignore**, bukan `.env.example`). Tambahkan/isi:

```env
# Auth — satu client id
GOOGLE_OAUTH_CLIENT_IDS=812345678901-abc123def456.apps.googleusercontent.com

# Auth — beberapa client id (web + android), dipisah koma TANPA spasi wajib (spasi otomatis di-trim)
# GOOGLE_OAUTH_CLIENT_IDS=812...-web.apps.googleusercontent.com,812...-android.apps.googleusercontent.com

# Email yang boleh akses (single-user). Bisa lebih dari satu, pisah koma.
ALLOWED_GOOGLE_EMAILS=dev.ammarhanif@gmail.com

# Opsional: batasi CORS. Kosong = izinkan semua origin.
ALLOWED_ORIGINS=
```

Hal yang perlu dipastikan:
- `GOOGLE_OAUTH_CLIENT_IDS` = Client ID dari Langkah 1 (yang berakhiran `.apps.googleusercontent.com`).
- `ALLOWED_GOOGLE_EMAILS` = email Google yang kamu pakai login. Email lain → 403 walau tokennya valid.
- `ALLOWED_ORIGINS` boleh dikosongkan dulu. Untuk production disarankan diisi origin frontend-mu.

### Langkah 3 — Restart dev server

```bash
bun run dev
```

Perubahan `.env` **tidak** ikut hot-reload (`--hot` hanya memantau file `.ts`). Jadi setiap mengubah `.env`, **hentikan lalu jalankan ulang** server. Setelah env terisi, `/api/*` berhenti membalas 500.

### Langkah 4 — Set env yang sama di Vercel (untuk production)

1. Vercel dashboard → project → **Settings → Environment Variables**.
2. Tambahkan **`GOOGLE_OAUTH_CLIENT_IDS`**, **`ALLOWED_GOOGLE_EMAILS`**, dan (opsional) **`ALLOWED_ORIGINS`** dengan nilai yang sama. Pilih environment **Production** (dan Preview bila perlu).
3. **Redeploy** agar env terbaca. Bila belum di-set, semua `/api/*` di production balas 500.

### Langkah 5 — Cek cepat bahwa proteksi aktif

```bash
# Publik → 200
curl -i http://localhost:3000/

# Terproteksi, tanpa token → 401
curl -i http://localhost:3000/api/categories
```

Diharapkan: `/` → `200 OK`; `/api/categories` → `401` dengan body
`{"error":"Token autentikasi tidak ada atau tidak valid"}`. Kalau `/api/categories` malah `500`, berarti env auth belum terisi (ulangi Langkah 2–3).

---

## B. Integrasi klien (cara klien mendapatkan ID token)

API hanya memverifikasi token; klien yang bertugas login & mengambil token.

- **Web (browser):** pakai **Google Identity Services (GIS)**. Render tombol "Sign in with Google" dengan `client_id` = Client ID Web-mu. Callback memberi `credential` = **ID token**. Kirim sebagai header.
- **Android/iOS:** pakai **Google Sign-In SDK**. Setelah user login, ambil **idToken** dari hasil sign-in.
- Setiap request ke `/api/*`:
  ```
  Authorization: Bearer <ID token>
  ```
  Contoh fetch di web:
  ```js
  await fetch(`${API}/api/transactions`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  ```

> **ID token vs access token.** Yang dipakai adalah **ID token** (JWT, biasanya bagian payload memuat `email`, `sub`, `aud`, `exp`). **Bukan** access token (`ya29....`). Salah jenis → 401.

---

## C. Tes cepat tanpa app (OAuth Playground)

Cara paling cepat mendapat ID token untuk diuji ke API:

1. Buka [OAuth Playground](https://developers.google.com/oauthplayground).
2. Klik ikon ⚙️ (kanan atas) → centang **Use your own OAuth credentials** → isi **OAuth Client ID** dan **OAuth Client secret** milikmu (dari client **Web application**; pastikan redirect URI `https://developers.google.com/oauthplayground` sudah ditambahkan di Langkah 1). Ini penting agar `aud` token = Client ID-mu sehingga lolos verifikasi.
3. Di kolom kiri "Step 1", masukkan scope: `openid email profile` → **Authorize APIs** → login dengan email yang **di-allowlist**.
4. "Step 2" → **Exchange authorization code for tokens**.
5. Pada response, salin nilai **`id_token`** (string panjang berawalan `eyJ...`).
6. Buka [pixel-pocket-api.http](../pixel-pocket-api.http), tempel ke variabel:
   ```
   @TOKEN = eyJhbGciOi...isi_id_token_di_sini
   ```
7. Jalankan request **A1** (`GET /api/auth/me`) → harus **200** dengan identitasmu. Jalankan **A2** (tanpa token) → **401**.

Atau dengan curl:
```bash
TOKEN="eyJhbGciOi..."   # id_token dari Playground
curl -i http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

---

## Contoh Response

**Sukses — `GET /api/auth/me` (200):**
```json
{ "data": { "email": "dev.ammarhanif@gmail.com", "sub": "1172459......", "name": "Ammar Hanif" } }
```

**Tanpa / token salah format (401):**
```json
{ "error": "Token autentikasi tidak ada atau tidak valid" }
```

**Token valid tapi email tidak diizinkan / belum verified (403):**
```json
{ "error": "Akses ditolak untuk akun ini" }
```

**Env auth belum diisi (500):**
```json
{ "error": "Konfigurasi autentikasi tidak lengkap" }
```

---

## Troubleshooting

| Gejala | Status | Penyebab paling mungkin | Solusi |
|---|---|---|---|
| Semua `/api/*` error | 500 | `GOOGLE_OAUTH_CLIENT_IDS` / `ALLOWED_GOOGLE_EMAILS` kosong | Isi `.env`, **restart** server / redeploy Vercel |
| Kirim token tetap ditolak | 401 | Mengirim **access token** (`ya29...`), bukan **ID token** | Ambil `id_token`, bukan `access_token` |
| Kirim token tetap ditolak | 401 | `aud` token ≠ Client ID di env (token terbit untuk client lain) | Pakai client id yang sama; di Playground aktifkan "Use your own OAuth credentials" |
| Kirim token tetap ditolak | 401 | Token **expired** (`exp` lewat; ID token umumnya ~1 jam) | Ambil token baru |
| Token valid tapi ditolak | 403 | Email tidak ada di `ALLOWED_GOOGLE_EMAILS` | Tambahkan email (case-insensitive); atau login dengan akun yang benar |
| Tidak bisa login di Playground/app | — | Email belum jadi **Test user** (consent screen "Testing") | Tambahkan email ke Test users di consent screen |
| Frontend kena CORS | — | Origin tidak diizinkan | Tambahkan origin ke `ALLOWED_ORIGINS` (atau kosongkan untuk izinkan semua) |
| `/api/*` lama di `.http` kena 401 | 401 | Request belum membawa header | Tambahkan `Authorization: Bearer {{TOKEN}}` di tiap request |

---

## Catatan untuk Phase 2 (multi-user)

Desain saat ini sudah menyiapkan jalur ke multi-user tanpa membongkar arsitektur:
hapus pengecekan allowlist → buat tabel `users` ber-key Google **`sub`** → tambah kolom
`user_id` di 3 tabel → filter query per `c.get("user").sub`. Identitas (`sub`, `email`,
`name`) sudah tersedia di context request sejak sekarang.

> Backup Google Sheets (`/api/backup/spreadsheet`) memakai **service account**
> (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID`) —
> terpisah dari OAuth Client ID di panduan ini.
