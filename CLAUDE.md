# CLAUDE.md — Pixel Pocket API

Panduan ini membantu Claude Code memahami proyek, konvensi, dan keputusan arsitektur yang sudah ada.

## Stack

| Lapisan | Teknologi |
|---|---|
| Framework | Hono |
| Database | Neon (serverless PostgreSQL) |
| ORM | Drizzle ORM |
| Validasi | Zod v4 |
| Runtime Dev | Bun |
| Deployment | Vercel (Node.js runtime) |
| Bahasa | TypeScript (strict mode) |

---

## Commands

```bash
bun run dev          # Jalankan server lokal dengan hot reload
bun run db:push      # Push schema ke database (development)
bun run db:generate  # Generate file migration SQL
bun run db:migrate   # Jalankan file migration
bun run db:studio    # Buka Drizzle Studio (GUI database)
```

---

## Struktur Proyek

```
pixel-pocket-api/
├── api/
│   └── index.ts                  ← Vercel entry point (export runtime = 'nodejs')
├── src/
│   ├── db/
│   │   ├── index.ts              ← Koneksi Neon + instance Drizzle
│   │   └── schema.ts             ← Definisi 3 tabel (categories, transactions, salary_periods)
│   ├── routes/
│   │   ├── transactions.ts       ← CRUD + filtering + pagination
│   │   ├── categories.ts         ← CRUD + seed 15 kategori default
│   │   ├── salary-periods.ts     ← CRUD + seed otomatis (gajian tgl 27)
│   │   ├── summary.ts            ← Analytics (total, by-category, chart)
│   │   └── backup.ts             ← Export ke Google Sheets
│   ├── validators/
│   │   ├── transaction.ts        ← Zod schema create/update transaksi
│   │   ├── category.ts           ← Zod schema create/update kategori
│   │   ├── salary-period.ts      ← Zod schema create/update salary period
│   │   └── query-filters.ts      ← Zod schema query params (filter, pagination)
│   ├── lib/
│   │   ├── date-filters.ts       ← Helper getWeekRange, getMonthRange, getYearRange, generateDateRange
│   │   └── google-sheets.ts      ← Helper export ke Google Sheets
│   ├── server.ts                 ← Bun native server (dev only)
│   └── index.ts                  ← Hono app, middleware, semua route didaftarkan di sini
├── drizzle/
│   └── migrations/
├── drizzle.config.ts
├── tsconfig.json
├── vercel.json
└── pixel-pocket-api.http         ← Test file untuk VS Code REST Client
```

---

## Environment Variables

```env
# Wajib
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require

# Wajib untuk fitur backup Google Sheets
GOOGLE_SERVICE_ACCOUNT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----\n"
GOOGLE_SPREADSHEET_ID=...

# Autentikasi Google
GOOGLE_OAUTH_CLIENT_IDS=xxx.apps.googleusercontent.com
ALLOWED_GOOGLE_EMAILS=you@gmail.com
ALLOWED_ORIGINS=

# Dev only
PORT=3000
```

---

## Autentikasi

API dilindungi **Google Auth (single-user)**. Semua `/api/*` butuh header
`Authorization: Bearer <Google ID token>`; health check `GET /` tetap publik.

**Alur:** klien login Google → dapat ID token → kirim sebagai Bearer →
middleware `requireGoogleAuth` ([src/middleware/auth.ts](src/middleware/auth.ts))
memverifikasi token via `google-auth-library` lalu mencocokkan email ke allowlist.

- `GOOGLE_OAUTH_CLIENT_IDS` — OAuth 2.0 Client ID (audience), comma-separated. **Bukan** service account Sheets.
- `ALLOWED_GOOGLE_EMAILS` — allowlist email (single-user), comma-separated.
- `ALLOWED_ORIGINS` — opsional; batasi CORS. Kosong = `*`.

Error: 401 token tidak ada/invalid; 403 email tidak diizinkan/belum verified.
`GET /api/auth/me` mengembalikan identitas token saat ini.

**Migrasi multi-user nanti:** hapus allowlist → tabel `users` ber-key Google `sub`
→ kolom `user_id` di 3 tabel → filter query per `c.get("user").sub`. Identitas
(`sub`) sudah tersedia di context sejak fase ini.

---

## Schema Database

### Tabel `categories`
- `id`, `name` (unique), `color` (hex), `type` (income|expense|both), `createdAt`
- Constraint `UNIQUE` pada `name` — dipakai untuk idempotency seed via `onConflictDoNothing()`
- **Tidak ada kolom `icon`** (keputusan desain). Jangan tambahkan `icon` di schema/seed/response.

### Tabel `transactions`
- `id`, `transactionDate` (DATE), `transactionType` (income|expense), `amount` (numeric 15,2), `categoryId` (FK → categories, onDelete: set null), `description`, `createdAt`, `updatedAt`
- `updatedAt` menggunakan `$onUpdate(() => new Date())` — update otomatis via Drizzle

### Tabel `salary_periods`
- `id`, `name`, `startDate` (DATE), `endDate` (DATE), `salaryAmount` (numeric 15,2, nullable), `createdAt`

---

## Konvensi Kode

### Numeric → selalu konversi

Drizzle memetakan kolom PostgreSQL `numeric` ke JavaScript **string**, bukan `number`.

```typescript
// ✅ Saat INSERT / UPDATE
amount: String(body.amount)
salaryAmount: body.salary_amount != null ? String(body.salary_amount) : null

// ✅ Saat READ (response ke client)
amount: parseFloat(row.amount)
salaryAmount: p.salaryAmount ? parseFloat(p.salaryAmount) : null
```

### Date column

Driver `neon-http` mengembalikan kolom `DATE` sebagai string `YYYY-MM-DD`. Jangan `new Date(row.date)` — hasilnya sudah string, langsung pakai.

### Koneksi database

Selalu gunakan `drizzle-orm/neon-http` (bukan `neon-serverless` websocket). HTTP driver kompatibel dengan Vercel serverless dan tidak perlu connection pooling.

```typescript
// src/db/index.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

### Urutan route — seed sebelum /:id

Hono mencocokkan route secara berurutan. Route statis harus didefinisikan **sebelum** route dinamis.

```typescript
// ✅ Urutan benar
router.post('/seed', ...)   // ← statis, harus duluan
router.post('/:id', ...)    // ← dinamis

// ❌ Salah — /seed akan tertangkap /:id dengan id='seed'
router.post('/:id', ...)
router.post('/seed', ...)
```

Berlaku di `categories.ts` dan `salary-periods.ts`.

### Struktur response

```typescript
// Success
return c.json({ data: result })
return c.json({ data: result }, 201)

// Success dengan pagination
return c.json({ data: rows, count: total, meta: { page, limit, totalPages, hasNextPage, hasPrevPage } })

// Error
return c.json({ error: 'Pesan error' }, 404)

// Validation error
return c.json({ error: 'Label error', details: z.flattenError(result.error).fieldErrors }, 400)
```

### Validasi dengan Zod

Semua validator menggunakan `zValidator` dari `@hono/zod-validator`. Selalu sertakan callback untuk mengontrol format error response:

```typescript
zValidator('json', schema, (result, c) => {
  if (!result.success) {
    return c.json({ error: 'Label', details: z.flattenError(result.error).fieldErrors }, 400)
  }
})
```

Query params yang datang sebagai string dikonversi otomatis dengan `z.coerce.number()`.

> **Zod v4:** proyek memakai Zod v4. Gunakan `z.flattenError(result.error).fieldErrors` (bukan `result.error.flatten()` yang sudah deprecated). Untuk custom message enum/number pakai opsi `{ error: "..." }`, bukan `errorMap`/`required_error`/`invalid_type_error` ala v3.

### Cross-field validation

Gunakan `.refine()` pada Zod object untuk validasi yang melibatkan lebih dari satu field:

```typescript
.refine((data) => data.end_date > data.start_date, {
  message: 'Tanggal akhir harus setelah tanggal mulai',
  path: ['end_date'],
})
```

---

## Logika Filter Tanggal

Dipakai di `GET /api/transactions` dan semua `GET /api/summary/*`.

**Prioritas (tertinggi ke terendah):**
1. `salary_period_id` — ambil `startDate`/`endDate` dari tabel `salary_periods`
2. `filter=week|month|year|custom` — gunakan helper di `src/lib/date-filters.ts`
3. Tidak ada keduanya — tidak ada kondisi WHERE tanggal, ambil semua data

Semua kalkulasi tanggal menggunakan **UTC** untuk konsistensi di Vercel (server timezone UTC).

---

## Salary Period

Pengguna gajian tiap **tanggal 27**. Pola period:
- Start: tanggal 27 bulan M
- End: tanggal 26 bulan M+1
- Nama: nama bulan Indonesia + tahun (contoh: `"Juni 2026"`)

Endpoint `POST /api/salary-periods/seed` generate ~36 period: dari Januari tahun lalu hingga Desember tahun depan. Idempotent via pengecekan `startDate` yang sudah ada di DB.

---

## Google Sheets — Private Key

Private key di `.env` menggunakan `\n` literal (dua karakter). Di kode wajib dikonversi:

```typescript
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
```

Di Vercel dashboard: paste key langsung tanpa tanda kutip, dengan newline asli (bukan `\n` escaped).

---

## Deployment (Vercel)

- Entry point: `api/index.ts`
- Runtime: **Node.js** (bukan Edge) — `googleapis` tidak kompatibel dengan Edge Runtime
- Semua request diarahkan ke `api/index.ts` via `vercel.json` rewrite

```typescript
// api/index.ts
export const runtime = 'nodejs' // JANGAN diubah ke 'edge'
```

---

## Hal yang Sering Salah

| Masalah | Penyebab | Solusi |
|---|---|---|
| `amount` di response berupa string | Drizzle `numeric` → string | `parseFloat(row.amount)` saat baca |
| INSERT `amount` error | Drizzle `numeric` butuh string input | `String(body.amount)` saat tulis |
| `/seed` tertangkap `/:id` | Urutan route salah | Definisikan `/seed` sebelum `/:id` |
| Google Sheets auth gagal | Format private key salah | `.replace(/\\n/g, '\n')` |
| `filter=custom` error | `start_date`/`end_date` tidak dikirim | Keduanya wajib ada saat `filter=custom` |
| `date` jadi Date object | Driver salah | Pakai `neon-http`, hasilnya string `YYYY-MM-DD` |
| TypeScript error di `process.env` | `@types/node` belum di-include | Tambah `"types": ["node"]` di `tsconfig.json` |
| Semua `/api/*` balas 401 | Lupa header `Authorization: Bearer <token>` | Sertakan Google ID token; cek `GOOGLE_OAUTH_CLIENT_IDS`/`ALLOWED_GOOGLE_EMAILS` terisi |

---

## Endpoint Summary

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/` | Health check |
| GET | `/api/auth/me` | Identitas dari Google ID token saat ini |
| GET | `/api/categories` | List semua kategori |
| GET | `/api/categories/:id` | Detail kategori |
| POST | `/api/categories` | Buat kategori |
| POST | `/api/categories/seed` | Seed 15 kategori default |
| PUT | `/api/categories/:id` | Update kategori |
| DELETE | `/api/categories/:id` | Hapus kategori |
| GET | `/api/salary-periods` | List semua salary period |
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
