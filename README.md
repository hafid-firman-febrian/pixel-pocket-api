# Pixel Pocket API

REST API untuk aplikasi pencatatan keuangan pribadi **Pixel Pocket** — mengelola transaksi (income/expense), kategori, periode gajian, ringkasan analitik, dan backup ke Google Sheets.

API single-user yang dilindungi **Google Auth**, dibangun dengan **Hono** + **Drizzle ORM** di atas **Neon (serverless PostgreSQL)**, dan dideploy ke **Vercel** (Node.js runtime).

---

## Stack

| Lapisan | Teknologi |
|---|---|
| Framework | [Hono](https://hono.dev) |
| Database | [Neon](https://neon.tech) (serverless PostgreSQL) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Validasi | [Zod v4](https://zod.dev) |
| Auth | Google ID token (`google-auth-library`) |
| Runtime Dev | [Bun](https://bun.sh) |
| Deployment | Vercel (Node.js runtime) |
| Bahasa | TypeScript (strict mode) |

---

## Memulai

### 1. Install dependency

```sh
bun install
```

### 2. Siapkan environment variable

Buat file `.env` di root project (lihat [Environment Variables](#environment-variables)).

### 3. Push schema ke database

```sh
bun run db:push
```

### 4. Jalankan server dev

```sh
bun run dev
```

Server berjalan di `http://localhost:3000`. Cek health:

```sh
curl http://localhost:3000/
```

### 5. Seed data awal (opsional)

```sh
# butuh header Authorization: Bearer <Google ID token>
curl -X POST http://localhost:3000/api/categories/seed     -H "Authorization: Bearer <token>"
curl -X POST http://localhost:3000/api/salary-periods/seed -H "Authorization: Bearer <token>"
```

---

## Commands

```sh
bun run dev          # Server lokal dengan hot reload
bun run db:push      # Push schema ke database (development)
bun run db:generate  # Generate file migration SQL
bun run db:migrate   # Jalankan file migration
bun run db:studio    # Buka Drizzle Studio (GUI database)
```

---

## Environment Variables

```env
# Wajib — koneksi database
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require

# Wajib — autentikasi Google
GOOGLE_OAUTH_CLIENT_IDS=xxx.apps.googleusercontent.com   # OAuth Client ID (audience), comma-separated
ALLOWED_GOOGLE_EMAILS=you@gmail.com                      # allowlist email, comma-separated
ALLOWED_ORIGINS=                                         # opsional; kosong = CORS *

# Wajib untuk fitur backup Google Sheets
GOOGLE_SERVICE_ACCOUNT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----\n"
GOOGLE_SPREADSHEET_ID=...

# Dev only
PORT=3000
```

> **Catatan `GOOGLE_PRIVATE_KEY`:** di `.env` pakai `\n` literal — kode mengonversinya dengan `.replace(/\\n/g, '\n')`. Di dashboard Vercel, paste key dengan newline asli tanpa tanda kutip.

---

## Autentikasi

Semua endpoint `/api/*` butuh header:

```
Authorization: Bearer <Google ID token>
```

Health check `GET /` tetap publik.

**Alur:** klien login Google → dapat **ID token** → kirim sebagai Bearer → middleware [`requireGoogleAuth`](src/middleware/auth.ts) memverifikasi token via `google-auth-library` (mencocokkan `aud` ke `GOOGLE_OAUTH_CLIENT_IDS`) lalu mencocokkan email ke `ALLOWED_GOOGLE_EMAILS`.

| Status | Arti |
|---|---|
| `401` | Token tidak ada / invalid / expired / terpotong |
| `403` | Email tidak ada di allowlist atau belum verified |

`GET /api/auth/me` mengembalikan identitas dari token saat ini.

> ⚠️ **Yang dipakai adalah ID token (`id_token`), bukan access token.** Token berlaku ~1 jam. Pastikan token utuh — signature RS256 ~342 karakter; token terpotong menyebabkan error `Invalid token signature`.

---

## Struktur Proyek

```
pixel-pocket-api/
├── api/
│   └── index.ts                  ← Vercel entry point (runtime = 'nodejs')
├── src/
│   ├── db/
│   │   ├── index.ts              ← Koneksi Neon + instance Drizzle
│   │   └── schema.ts             ← 3 tabel: categories, transactions, salary_periods
│   ├── middleware/
│   │   └── auth.ts               ← requireGoogleAuth (verifikasi Google ID token)
│   ├── routes/
│   │   ├── transactions.ts       ← CRUD + filtering + pagination
│   │   ├── categories.ts         ← CRUD + seed kategori default
│   │   ├── salary-periods.ts     ← CRUD + seed otomatis (gajian tgl 27)
│   │   ├── summary.ts            ← Analytics (total, by-category, chart)
│   │   └── backup.ts             ← Export ke Google Sheets
│   ├── validators/               ← Zod schema (transaction, category, salary-period, query-filters)
│   ├── lib/
│   │   ├── date-filters.ts       ← Helper rentang tanggal (week/month/year/custom)
│   │   ├── google-sheets.ts      ← Helper export ke Google Sheets
│   │   └── google-verifier.ts    ← Verifikasi Google ID token
│   ├── server.ts                 ← Bun native server (dev only)
│   └── index.ts                  ← Hono app, middleware, registrasi route
├── drizzle/migrations/
├── drizzle.config.ts
├── vercel.json
└── pixel-pocket-api.http         ← Test file untuk VS Code REST Client
```

---

## Schema Database

### `categories`
`id`, `name` (unique), `color` (hex), `type` (`income`|`expense`|`both`), `createdAt`
Constraint `UNIQUE` pada `name` dipakai untuk idempotency seed via `onConflictDoNothing()`.

### `transactions`
`id`, `transactionDate` (DATE), `transactionType` (`income`|`expense`), `amount` (numeric 15,2), `categoryId` (FK → categories, `onDelete: set null`), `description`, `createdAt`, `updatedAt`

### `salary_periods`
`id`, `name`, `startDate` (DATE), `endDate` (DATE), `salaryAmount` (numeric 15,2, nullable), `createdAt`

---

## Filter Tanggal

Dipakai di `GET /api/transactions` dan semua `GET /api/summary/*`.

**Prioritas (tertinggi → terendah):**
1. `salary_period_id` — ambil rentang dari tabel `salary_periods`
2. `filter=week|month|year|custom` — `filter=custom` wajib sertakan `start_date` & `end_date`
3. Tidak ada keduanya — ambil semua data

Semua kalkulasi tanggal memakai **UTC** (konsisten dengan server Vercel).

**Salary period:** user gajian tiap **tanggal 27**. Pola period: start tgl 27 bulan M → end tgl 26 bulan M+1. `POST /api/salary-periods/seed` generate ~36 period (idempotent).

---

## Daftar Endpoint

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/` | Health check (publik) |
| GET | `/api/auth/me` | Identitas dari Google ID token saat ini |
| GET | `/api/categories` | List semua kategori |
| GET | `/api/categories/:id` | Detail kategori |
| POST | `/api/categories` | Buat kategori |
| POST | `/api/categories/seed` | Seed kategori default |
| PUT | `/api/categories/:id` | Update kategori |
| DELETE | `/api/categories/:id` | Hapus kategori |
| GET | `/api/salary-periods` | List salary period |
| GET | `/api/salary-periods/:id` | Detail salary period |
| POST | `/api/salary-periods` | Buat salary period manual |
| POST | `/api/salary-periods/seed` | Generate salary period (gajian tgl 27) |
| PUT | `/api/salary-periods/:id` | Update salary period |
| DELETE | `/api/salary-periods/:id` | Hapus salary period |
| GET | `/api/transactions` | List transaksi (filter + pagination) |
| GET | `/api/transactions/:id` | Detail transaksi |
| POST | `/api/transactions` | Buat transaksi |
| PUT | `/api/transactions/:id` | Update transaksi |
| DELETE | `/api/transactions/:id` | Hapus transaksi |
| GET | `/api/summary` | Total income/expense/balance |
| GET | `/api/summary/by-category` | Breakdown per kategori |
| GET | `/api/summary/chart` | Time-series harian untuk chart |
| POST | `/api/backup/spreadsheet` | Export ke Google Sheets |

**Query param (transactions & summary):** `filter`, `start_date`, `end_date`, `salary_period_id`, `transaction_type`, `category_id`, `page`, `limit`.

### Contoh

```sh
# Total ringkasan untuk satu periode gajian
GET /api/summary?salary_period_id=3

# Breakdown pengeluaran per kategori bulan ini
GET /api/summary/by-category?filter=month&transaction_type=expense

# Transaksi expense kategori tertentu, paginated
GET /api/transactions?filter=month&transaction_type=expense&category_id=1&page=1&limit=5
```

---

## Format Response

```jsonc
// Success
{ "data": { /* ... */ } }

// Success dengan pagination
{ "data": [ /* ... */ ], "count": 42, "meta": { "page": 1, "limit": 10, "totalPages": 5, "hasNextPage": true, "hasPrevPage": false } }

// Error
{ "error": "Pesan error" }

// Validation error
{ "error": "Label error", "details": { "field": ["pesan"] } }
```

> Kolom `numeric` PostgreSQL dipetakan Drizzle ke **string** — response mengonversinya ke `number` (`parseFloat`), dan input dikonversi ke string (`String(...)`) saat insert/update.

---

## Testing

- **VS Code REST Client:** buka [pixel-pocket-api.http](pixel-pocket-api.http), isi variable `@TOKEN`, jalankan tiap request.
- **Postman:** import `pixel-pocket-api.postman_collection.json` (berisi semua endpoint + variasi filter), isi variable `token` & `base_url`.

> ID token bisa diambil dari log aplikasi mobile (salin via clipboard agar tidak terpotong). Token berlaku ~1 jam.

---

## Deployment (Vercel)

- Entry point: [api/index.ts](api/index.ts)
- Runtime: **Node.js** (bukan Edge) — `googleapis` tidak kompatibel dengan Edge Runtime
- Semua request diarahkan ke `api/index.ts` via rewrite di [vercel.json](vercel.json)
- Set semua environment variable di dashboard Vercel sebelum deploy

```ts
// api/index.ts
export const runtime = "nodejs"; // JANGAN diubah ke 'edge'
```

---

## Lisensi

Proyek pribadi — belum berlisensi publik.
