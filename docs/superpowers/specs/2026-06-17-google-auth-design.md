# Spec Desain — Autentikasi Google (Single-User) untuk Pixel Pocket API

**Tanggal:** 2026-06-17
**Status:** Disetujui (menunggu review spec tertulis)
**Scope:** Proteksi API single-user via verifikasi Google ID token + allowlist email.

---

## 1. Tujuan & Konteks

Pixel Pocket API saat ini terbuka tanpa autentikasi (CORS `origin: '*'`, semua `/api/*` publik). Tujuan fitur ini: **menolak setiap request yang bukan dari pemilik**, tanpa membangun sistem multi-user.

**Keputusan yang sudah diambil (hasil brainstorming):**
- **Model:** single-user — hanya melindungi API, **tanpa** tabel `users`, **tanpa** kolom `user_id`, **tanpa** isolasi data per user.
- **Klien:** campuran/belum pasti — mobile sekarang, kemungkinan web (Next.js/React) nanti ("mungkin multi-user nanti").
- **Pendekatan:** **Google Auth** — klien login ke Google, API memverifikasi **Google ID token** dan mencocokkan email terhadap allowlist. Dipilih karena: reuse ekosistem Google yang sudah dipakai (backup Sheets), `google-auth-library` sudah terpasang lewat `googleapis`, paling sedikit kode backend (tanpa password/JWT sendiri), dan jalur migrasi ke multi-user paling mulus (Google `sub` → `user_id`).

**Non-goals (di luar scope):**
- Multi-user, signup, manajemen banyak akun.
- Penerbitan JWT sesi milik API sendiri (kita verifikasi token Google langsung tiap request).
- Refresh token, reset password (ditangani Google).
- Social provider selain Google.

---

## 2. Prasyarat (aksi di sisi pengguna)

Backup Sheets memakai **service account** (server-to-server) — ini **berbeda** dari kebutuhan Google Sign-In.

1. Di Google Cloud Console (boleh project yang sama dengan Sheets), buat **OAuth 2.0 Client ID**:
   - Tipe **Web application** untuk frontend web (set authorized JavaScript origins / redirect URI).
   - Tipe **Android**/**iOS** untuk klien mobile (sesuai platform).
2. Catat tiap Client ID (`*.apps.googleusercontent.com`). Client ID inilah `audience` yang diverifikasi API.
3. Isi env (lihat Bagian 5).

> Catatan: ID token diterbitkan **klien** lewat Google Sign-In SDK (mobile) / Google Identity Services (web). API hanya **memverifikasi**, tidak menerbitkan token.

---

## 3. Arsitektur & Alur Request

```
Klien (mobile/web)  ──login Google──►  Google  ──ID token (JWT)──►  Klien
Klien  ──Authorization: Bearer <ID token>──►  API Hono
        └─ middleware requireGoogleAuth:
             1. Ambil Bearer token dari header Authorization
             2. OAuth2Client.verifyIdToken({ idToken, audience: CLIENT_IDS })
             3. Pastikan payload.email_verified === true
             4. Pastikan payload.email ∈ ALLOWED_GOOGLE_EMAILS (case-insensitive)
             5. set c.user = { email, sub, name } → lanjut ke handler route
           Gagal:
             - token tidak ada / format salah / verifikasi gagal → 401
             - token valid tapi email tidak di-allowlist / belum verified → 403
```

- **Diproteksi:** semua `/api/*` (termasuk `/api/backup/*`).
- **Publik:** health check `GET /` (tidak di bawah `/api`).
- Verifikasi memakai `google-auth-library` (`OAuth2Client.verifyIdToken`). Library meng-cache kunci publik Google (Google certs), jadi tidak fetch JWKS tiap request pada instance hangat.

---

## 4. Komponen

Tiap unit punya satu tanggung jawab jelas, antarmuka terdefinisi, dan bisa diuji terpisah.

### 4.1 `src/lib/auth-config.ts`
- **Tugas:** membaca & memvalidasi env auth sekali.
- **Ekspor:** `getAuthConfig(): { clientIds: string[]; allowedEmails: string[] }`.
- **Perilaku:** parse `GOOGLE_OAUTH_CLIENT_IDS` & `ALLOWED_GOOGLE_EMAILS` (comma-separated, trim, lowercase email). Lempar `Error` deskriptif bila salah satu kosong. Cache hasil parse.
- **Dependensi:** `process.env`.

### 4.2 `src/middleware/auth.ts`
- **Tugas:** middleware Hono yang mewajibkan Google ID token valid + email ter-allowlist.
- **Ekspor:** `requireGoogleAuth` (Hono `MiddlewareHandler`).
- **Perilaku:** ambil Bearer token → `verifyIdToken` (audience = `clientIds`) → cek `email_verified` & allowlist → `c.set('user', { email, sub, name })` → `await next()`. Pada kegagalan kembalikan 401/403 JSON (tidak memanggil `next`).
- **Dependensi:** `google-auth-library` (`OAuth2Client`, singleton modul), `auth-config`.
- **Tipe konteks:** definisikan `AuthUser = { email: string; sub: string; name?: string }` dan ketikkan Hono `Variables` agar `c.get('user')` ber-tipe.

### 4.3 `src/index.ts` (perubahan)
- Pasang `app.use('/api/*', requireGoogleAuth)` **setelah** CORS + logger, **sebelum** registrasi route.
- CORS diubah jadi env-driven (lihat 5).
- Health `GET /` tetap publik (di luar `/api`).

### 4.4 (Opsional, disepakati ikut) `GET /api/auth/me`
- **Tugas:** kembalikan identitas terdekode dari token saat ini (`{ data: { email, sub, name } }`), berguna bagi klien memvalidasi token.
- Berada di bawah `/api/*` sehingga otomatis terproteksi middleware. Implementasi: baca `c.get('user')`.

---

## 5. Konfigurasi (Environment Variables)

```env
# Wajib untuk auth
GOOGLE_OAUTH_CLIENT_IDS=xxx.apps.googleusercontent.com,yyy.apps.googleusercontent.com
ALLOWED_GOOGLE_EMAILS=dev.ammarhanif@gmail.com

# Opsional — CORS. Bila kosong, default ke '*' (tidak breaking; disarankan diisi di production)
ALLOWED_ORIGINS=https://app.contoh.com,http://localhost:5173
```

- `GOOGLE_OAUTH_CLIENT_IDS`: daftar audience yang diterima (mendukung beberapa client ID untuk web + mobile).
- `ALLOWED_GOOGLE_EMAILS`: allowlist; saat ini satu email, tapi format list agar fleksibel.
- `ALLOWED_ORIGINS`: bila diisi, CORS hanya mengizinkan origin tersebut; bila kosong, fallback `*`.
- Allowlist dicocokkan via **email** (mudah dibaca); `sub` tetap disimpan di context sebagai fondasi multi-user.
- `.env.example` diperbarui dengan ketiga variabel di atas.

---

## 6. Error Handling

Konsisten dengan pola `{ error: string }` yang sudah ada:

| Kondisi | Status | Body |
|---|---|---|
| Header `Authorization` tidak ada / bukan Bearer | 401 | `{ "error": "Token autentikasi tidak ada atau tidak valid" }` |
| `verifyIdToken` gagal (invalid/expired/audience salah) | 401 | `{ "error": "Token autentikasi tidak ada atau tidak valid" }` |
| Token valid tapi `email_verified` false atau email tak di-allowlist | 403 | `{ "error": "Akses ditolak untuk akun ini" }` |
| Konfigurasi auth tidak lengkap (env kosong) | 500 | `{ "error": "Konfigurasi autentikasi tidak lengkap" }` (di-log detail) |

- Detail error verifikasi **tidak** dibocorkan ke klien (cukup pesan generik), tetapi di-`console.error` untuk debugging — selaras gaya route lain.

---

## 7. Strategi Testing

### 7.1 Unit (TDD, `bun test`)
Token Google asli tak bisa dibuat di test, jadi **mock `verifyIdToken`** (mis. injeksikan verifier atau mock modul `google-auth-library`). Kasus minimal:
1. Tanpa header `Authorization` → 401, `next` tidak dipanggil.
2. Header bukan format `Bearer <token>` → 401.
3. `verifyIdToken` melempar (token invalid) → 401.
4. Token valid tapi email di luar allowlist → 403.
5. Token valid tapi `email_verified` false → 403.
6. Token valid + email ter-allowlist + verified → `next` dipanggil, `c.get('user')` terisi `{ email, sub, name }`.
7. `auth-config`: env lengkap → parse benar (trim, lowercase, split); env kosong → melempar Error.

Desain middleware harus memudahkan injeksi/mok verifier (mis. fungsi `verifyIdToken` bisa di-override untuk test) agar tidak bergantung jaringan.

### 7.2 Manual (REST Client)
- `pixel-pocket-api.http` ditambah variabel `@TOKEN = <Google ID token>` dan header `Authorization: Bearer {{TOKEN}}` pada request terproteksi.
- Tambahkan catatan cara memperoleh ID token (Google OAuth Playground atau Google Identity Services di app).
- Tambahkan contoh kasus 401 (tanpa token) dan 403 (token akun lain) bila memungkinkan.

---

## 8. Dampak ke Kode yang Ada

- `src/index.ts`: tambah middleware `/api/*` + CORS env-driven. Tidak mengubah logika route.
- `.env.example`: tambah variabel auth.
- `pixel-pocket-api.http`: tambah token & catatan.
- `CLAUDE.md`: tambah bagian Autentikasi (cara kerja, env, route publik vs terproteksi) — diperbarui setelah implementasi.
- **Tidak ada** perubahan schema database pada fase ini.

---

## 9. Migrasi Multi-User (di luar scope, didesain agar mulus)

Saat siap multi-user nanti:
1. Hapus pengecekan allowlist email di middleware (terima semua Google user terverifikasi).
2. Buat tabel `users` ber-key `google_sub` (upsert saat login pertama).
3. Tambah kolom `user_id` di `transactions`, `categories`, `salary_periods`.
4. Filter semua query berdasarkan `c.get('user').sub` / `user_id`.

Karena identitas (`sub`) sudah tersedia di context sejak fase ini, tidak ada arsitektur yang perlu dibongkar.

---

## 10. Open Questions / Asumsi

- Diasumsikan klien dapat mengintegrasikan Google Sign-In (mobile SDK / GIS web) untuk memperoleh ID token. Untuk pengetesan via curl/Postman, token diambil manual.
- Diasumsikan allowlist berbasis email cukup (email akun personal stabil). Bila perlu lebih ketat, bisa pindah ke allowlist berbasis `sub`.
