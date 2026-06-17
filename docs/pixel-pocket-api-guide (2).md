# Panduan Lengkap RESTful API Pixel Pocket

> Panduan ini membawa kamu dari folder kosong hingga API yang siap di-deploy ke Vercel, lengkap dengan semua fitur yang dibutuhkan aplikasi keuangan personal.

---

## Gambaran Umum

API ini dibangun dengan stack modern yang ringan dan cocok untuk Vercel:

| Lapisan | Teknologi |
|---|---|
| Framework | Hono (ultra-fast, Edge-compatible) |
| Database | Neon (serverless PostgreSQL) |
| ORM | Drizzle ORM (type-safe, ringan) |
| Validasi | Zod (schema-first validation) |
| Runtime Dev | Bun |
| Deployment | Vercel (Node.js runtime) |

**Catatan tentang runtime Vercel:** Panduan ini menggunakan `runtime: 'nodejs'` di Vercel (bukan Edge) karena fitur backup menggunakan package `googleapis` yang membutuhkan Node.js API. Untuk semua fitur lain, Hono dan Neon fully compatible dengan Edge Runtime.

---

## Langkah 1 — Inisialisasi Proyek

### Membuat Folder dan Menginisialisasi Proyek

Langkah pertama adalah membuat struktur folder proyek dan menginisialisasi Bun sebagai package manager sekaligus runtime. Bun dipilih karena kecepatan instalasi dependency-nya yang jauh lebih cepat dari npm/yarn, sekaligus bisa langsung menjalankan TypeScript tanpa perlu build step saat development.

```bash
mkdir pixel-pocket-api
cd pixel-pocket-api
bun init -y
git init
```

Perintah `bun init -y` akan membuat `package.json` dengan konfigurasi dasar. Sekarang install semua dependency yang dibutuhkan:

```bash
# Production dependencies
bun add hono @hono/zod-validator drizzle-orm @neondatabase/serverless zod googleapis

# Development dependencies
bun add -d typescript drizzle-kit @types/node
```

Penjelasan singkat masing-masing package:
- **hono** — web framework yang ringan dan kompatibel dengan Edge Runtime
- **@hono/zod-validator** — middleware untuk validasi request body dengan Zod
- **drizzle-orm** — ORM type-safe yang generate query tanpa runtime overhead besar
- **@neondatabase/serverless** — driver PostgreSQL khusus Neon yang bisa berjalan di Edge Runtime via HTTP
- **zod** — library validasi schema yang terintegrasi sempurna dengan TypeScript
- **googleapis** — client resmi Google API untuk fitur backup ke Google Sheets
- **drizzle-kit** — CLI Drizzle untuk mengelola migration database

### Konfigurasi TypeScript

Buat file `tsconfig.json` di root proyek. Strict mode diaktifkan agar TypeScript mendeteksi bug lebih dini — ini penting untuk proyek yang akan dikembangkan lebih lanjut.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*", "api/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Scripts di package.json

Buka `package.json` yang sudah dibuat Bun, lalu update bagian `scripts`:

```json
{
  "name": "pixel-pocket-api",
  "version": "0.1.0",
  "scripts": {
    "dev": "bun run --hot src/server.ts",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "hono": "latest",
    "@hono/zod-validator": "latest",
    "drizzle-orm": "latest",
    "@neondatabase/serverless": "latest",
    "zod": "latest",
    "googleapis": "latest"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "drizzle-kit": "latest",
    "@types/node": "^22.0.0"
  }
}
```

Flag `--hot` pada script `dev` mengaktifkan hot reload Bun, sehingga server otomatis restart setiap kali ada perubahan file TypeScript.

### File .gitignore

```gitignore
# Dependencies
node_modules/

# Build output
dist/

# Environment variables (JANGAN pernah commit file ini)
.env
.env.local
.env.production

# OS artifacts
.DS_Store
Thumbs.db

# Editor
.vscode/settings.json
.idea/

# Logs
*.log
npm-debug.log*
```

### File .env.example

File ini adalah template untuk environment variables. Commit file ini ke Git, tapi **jangan** commit `.env`.

```env
# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require

# Google Sheets API (untuk fitur backup)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id-from-url

# Development only
PORT=3000
```

Setelah langkah ini selesai, struktur folder awal terlihat seperti ini:

```
pixel-pocket-api/
├── node_modules/
├── .gitignore
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Langkah 2 — Setup Neon dan Drizzle ORM

### Membuat Project di Neon

Neon adalah PostgreSQL serverless yang cocok untuk aplikasi dengan traffic sporadis karena ia bisa scale-to-zero (tidak ada biaya saat idle). Ikuti langkah berikut:

1. Buka [console.neon.tech](https://console.neon.tech) dan buat akun atau login
2. Klik **New Project**, beri nama misalnya `pixel-pocket`
3. Pilih region terdekat (Singapore atau Tokyo untuk Indonesia)
4. Setelah project dibuat, buka tab **Connection Details**
5. Salin **connection string** yang terlihat seperti:
   `postgresql://user:password@ep-abc123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

Buat file `.env` di root proyek (ini tidak akan di-commit karena sudah ada di `.gitignore`):

```env
DATABASE_URL=postgresql://user:password@ep-abc123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
PORT=3000
```

### Konfigurasi Drizzle Kit

Buat file `drizzle.config.ts` di root proyek. File ini memberitahu Drizzle di mana schema berada dan ke mana file migration harus ditulis.

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

### Membuat Struktur Folder src

```bash
mkdir -p src/db src/routes src/validators src/lib
```

### Mendefinisikan Schema Database

Buat file `src/db/schema.ts`. Ini adalah inti dari seluruh proyek — mendefinisikan ketiga tabel beserta relasi dan constraint-nya. Setiap kolom dipilih dengan pertimbangan yang disertai penjelasan di komentar.

```typescript
import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  date,
  index,
} from 'drizzle-orm/pg-core';

// =============================================================================
// Tabel categories
// Harus didefinisikan lebih dulu karena transactions mereferensikannya
// =============================================================================
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),

  // unique() penting untuk endpoint seed — memastikan onConflictDoNothing() bekerja
  name: text('name').notNull().unique(),

  // color dalam format hex (#RRGGBB) — nullable karena opsional saat dibuat user
  color: text('color'),

  // enum di PostgreSQL level untuk validasi di database, bukan hanya di aplikasi
  type: text('type', { enum: ['income', 'expense', 'both'] }).notNull(),

  createdAt: timestamp('created_at').defaultNow(),
});

// =============================================================================
// Tabel transactions
// =============================================================================
export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),

    // date (bukan timestamp) karena kita hanya butuh tanggal, bukan jam
    // PostgreSQL DATE → Drizzle mengembalikannya sebagai string 'YYYY-MM-DD'
    transactionDate: date('transaction_date').notNull(),

    transactionType: text('transaction_type', {
      enum: ['income', 'expense'],
    }).notNull(),

    // numeric(15,2) untuk presisi finansial yang tepat
    // CATATAN: Drizzle mengembalikan numeric sebagai STRING, bukan number!
    // Selalu parseFloat() saat membaca, String() saat menulis
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),

    // onDelete: 'set null' — jika kategori dihapus, transaksi tetap ada tapi category_id jadi null
    categoryId: integer('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),

    description: text('description'),
    createdAt: timestamp('created_at').defaultNow(),

    // $onUpdate memastikan updatedAt diupdate otomatis saat record diubah via Drizzle
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Index untuk query filtering yang sering digunakan
    index('idx_transactions_date').on(table.transactionDate),
    index('idx_transactions_type').on(table.transactionType),
    index('idx_transactions_category').on(table.categoryId),
  ]
);

// =============================================================================
// Tabel salary_periods
// =============================================================================
export const salaryPeriods = pgTable('salary_periods', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),

  // nullable — tidak semua orang tahu atau mau mencatat nominal gaji
  salaryAmount: numeric('salary_amount', { precision: 15, scale: 2 }),

  createdAt: timestamp('created_at').defaultNow(),
});

// =============================================================================
// Tipe TypeScript — diturunkan langsung dari schema, tidak perlu didefinisikan ulang
// =============================================================================
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type SalaryPeriod = typeof salaryPeriods.$inferSelect;
export type NewSalaryPeriod = typeof salaryPeriods.$inferInsert;
```

### Koneksi Database

Buat `src/db/index.ts`. Kita menggunakan driver `neon-http` yang bekerja via HTTP request, kompatibel dengan Edge Runtime dan Serverless environment.

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// neon() membuat HTTP client yang mengirim query ke Neon via HTTPS
// Ini beda dengan koneksi PostgreSQL biasa yang pakai TCP
const sql = neon(process.env.DATABASE_URL!);

// drizzle() membungkus client tersebut dengan query builder type-safe
// schema diberikan agar Drizzle tahu relasi antar tabel untuk query dengan relasi
export const db = drizzle(sql, { schema });
```

### Menjalankan Migration

Untuk development, gunakan `db:push` yang mendorong schema langsung ke database tanpa membuat file migration. Ini praktis saat schema masih sering berubah.

```bash
bun run db:push
```

Perintah ini akan membaca `src/db/schema.ts`, membandingkan dengan kondisi database saat ini, dan menerapkan perubahan yang diperlukan (CREATE TABLE, dll.). Bila berjalan sukses, kamu akan melihat konfirmasi tiga tabel berhasil dibuat.

> 💡 **Tips:** Untuk production, gunakan `db:generate` lalu `db:migrate` agar ada rekam jejak perubahan schema dalam file SQL yang bisa di-review sebelum dijalankan.

---

## Langkah 3 — Setup Instance Hono

### Aplikasi Hono Utama

Buat `src/index.ts` — ini adalah entry point aplikasi yang mendaftarkan semua middleware dan route. File ini hanya mengatur struktur; logika bisnis ada di masing-masing route file.

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import transactions from './routes/transactions';
import categories from './routes/categories';
import salaryPeriods from './routes/salary-periods';
import summary from './routes/summary';
import backup from './routes/backup';

const app = new Hono();

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────

// CORS — izinkan semua origin untuk Phase 1 (single user, no auth)
// Perketat ini di Phase 2 saat menambahkan authentication
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Logger — tampilkan setiap request di console (method, path, status, duration)
app.use('*', logger());

// ─────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────
app.get('/', (c) =>
  c.json({
    message: 'Pixel Pocket API',
    version: '1.0.0',
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
);

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
app.route('/api/transactions', transactions);
app.route('/api/categories', categories);
app.route('/api/salary-periods', salaryPeriods);
app.route('/api/summary', summary);
app.route('/api/backup', backup);

// ─────────────────────────────────────────────
// Error Handlers
// ─────────────────────────────────────────────
app.notFound((c) =>
  c.json({ error: 'Endpoint tidak ditemukan' }, 404)
);

app.onError((err, c) => {
  console.error('[Global Error Handler]', err);
  return c.json({ error: 'Terjadi kesalahan internal pada server' }, 500);
});

export default app;
```

### Server untuk Development Lokal

Buat `src/server.ts`. File ini hanya dipakai saat development lokal — saat deploy ke Vercel, entry point-nya berbeda (akan dibuat di Langkah 9).

```typescript
import app from './index';

// Bun membaca export default sebagai konfigurasi HTTP server bawaan
const port = parseInt(process.env.PORT ?? '3000', 10);

console.log(`🚀 Pixel Pocket API berjalan di http://localhost:${port}`);
console.log(`   Database: ${process.env.DATABASE_URL ? '✅ Terhubung' : '❌ DATABASE_URL tidak ditemukan'}`);

export default {
  port,
  fetch: app.fetch,
};
```

Coba jalankan server untuk memastikan setup berjalan:

```bash
bun run dev
```

Akses `http://localhost:3000` di browser atau curl — kamu seharusnya mendapat respons JSON health check. Jika ada error koneksi database, periksa kembali `DATABASE_URL` di `.env`.

---

## Langkah 4 — Implementasi CRUD Transactions

Langkah ini adalah yang paling kompleks karena mencakup filtering multi-parameter, pagination, dan JOIN dengan tabel categories.

### Helper Filter Tanggal

Buat `src/lib/date-filters.ts`. Semua kalkulasi rentang tanggal dipusatkan di sini agar tidak tersebar di banyak route.

```typescript
export type DateRange = {
  startDate: string; // Format: 'YYYY-MM-DD'
  endDate: string;   // Format: 'YYYY-MM-DD'
};

// Menggunakan UTC untuk konsistensi di Vercel (server timezone UTC)
function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Rentang minggu berjalan: Senin minggu ini → hari ini
 * JavaScript: Minggu=0, Senin=1, ..., Sabtu=6
 * Konversi ke Senin-based: Senin=0, ..., Minggu=6
 */
export function getWeekRange(): DateRange {
  const today = todayUTC();
  const dayOfWeek = today.getUTCDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - daysFromMonday);

  return {
    startDate: toDateString(monday),
    endDate: toDateString(today),
  };
}

/**
 * Rentang bulan berjalan: tanggal 1 bulan ini → hari ini
 */
export function getMonthRange(): DateRange {
  const today = todayUTC();
  const firstDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  return {
    startDate: toDateString(firstDay),
    endDate: toDateString(today),
  };
}

/**
 * Rentang tahun berjalan: 1 Januari tahun ini → hari ini
 */
export function getYearRange(): DateRange {
  const today = todayUTC();
  const firstDay = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  return {
    startDate: toDateString(firstDay),
    endDate: toDateString(today),
  };
}

/**
 * Generate array semua tanggal antara start dan end (inklusif).
 * Digunakan untuk mengisi tanggal yang tidak ada transaksi dengan nilai 0
 * saat membangun data chart.
 */
export function generateDateRange(startDate: string, endDate: string): string[] {
  const labels: string[] = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const current = new Date(start);

  while (current <= end) {
    labels.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return labels;
}
```

### Validator Query Parameters

Buat `src/validators/query-filters.ts`. Query params selalu datang sebagai string dari HTTP request, sehingga kita perlu `z.coerce` untuk konversi ke number. Validasi ini dipakai bersama oleh transactions dan summary endpoints.

```typescript
import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const transactionQuerySchema = z
  .object({
    // filter waktu: week | month | year | custom
    filter: z.enum(['week', 'month', 'year', 'custom']).optional(),

    // Alternatif filter: gunakan rentang tanggal dari salary period
    // z.coerce.number() otomatis mengkonversi string '1' ke number 1
    salary_period_id: z.coerce.number().int().positive().optional(),

    // Wajib jika filter=custom
    start_date: z
      .string()
      .regex(dateRegex, 'Format tanggal harus YYYY-MM-DD')
      .optional(),
    end_date: z
      .string()
      .regex(dateRegex, 'Format tanggal harus YYYY-MM-DD')
      .optional(),

    category_id: z.coerce.number().int().positive().optional(),
    transaction_type: z.enum(['income', 'expense']).optional(),

    // Pagination dengan nilai default
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) => {
      if (data.filter === 'custom') {
        return Boolean(data.start_date && data.end_date);
      }
      return true;
    },
    {
      message: 'start_date dan end_date wajib diisi jika filter=custom',
      path: ['start_date'],
    }
  );

// Schema untuk summary endpoints — sama tapi tanpa page, limit, category_id
export const summaryQuerySchema = z
  .object({
    filter: z.enum(['week', 'month', 'year', 'custom']).optional(),
    salary_period_id: z.coerce.number().int().positive().optional(),
    start_date: z
      .string()
      .regex(dateRegex, 'Format tanggal harus YYYY-MM-DD')
      .optional(),
    end_date: z
      .string()
      .regex(dateRegex, 'Format tanggal harus YYYY-MM-DD')
      .optional(),
    transaction_type: z.enum(['income', 'expense']).optional(),
  })
  .refine(
    (data) => {
      if (data.filter === 'custom') {
        return Boolean(data.start_date && data.end_date);
      }
      return true;
    },
    {
      message: 'start_date dan end_date wajib diisi jika filter=custom',
      path: ['start_date'],
    }
  );

export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
```

### Validator Body Transaksi

Buat `src/validators/transaction.ts`:

```typescript
import { z } from 'zod';

export const createTransactionSchema = z.object({
  transaction_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
    .refine(
      (d) => !isNaN(new Date(d).getTime()),
      'Tanggal tidak valid'
    ),
  transaction_type: z.enum(['income', 'expense'], {
    errorMap: () => ({ message: 'Tipe transaksi harus income atau expense' }),
  }),
  amount: z
    .number({
      required_error: 'Nominal wajib diisi',
      invalid_type_error: 'Nominal harus berupa angka',
    })
    .positive('Nominal harus lebih dari 0'),
  category_id: z.number().int().positive().optional().nullable(),
  description: z
    .string()
    .max(500, 'Deskripsi maksimal 500 karakter')
    .optional()
    .nullable(),
});

// .partial() membuat semua field menjadi opsional untuk update
export const updateTransactionSchema = createTransactionSchema.partial();

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
```

### Route Transaksi

Buat `src/routes/transactions.ts`. Ini file terpanjang karena mencakup semua operasi CRUD plus logika filtering yang kompleks.

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { transactions, categories, salaryPeriods } from '../db/schema';
import { transactionQuerySchema } from '../validators/query-filters';
import {
  createTransactionSchema,
  updateTransactionSchema,
} from '../validators/transaction';
import {
  getWeekRange,
  getMonthRange,
  getYearRange,
  type DateRange,
} from '../lib/date-filters';

const router = new Hono();

// ─────────────────────────────────────────────
// Helper: Resolve date range dari query params
// ─────────────────────────────────────────────
// salary_period_id memiliki prioritas lebih tinggi dari filter
async function resolveDateRange(query: {
  filter?: string;
  salary_period_id?: number;
  start_date?: string;
  end_date?: string;
}): Promise<{ range: DateRange | null; error?: string }> {
  if (query.salary_period_id) {
    const [period] = await db
      .select()
      .from(salaryPeriods)
      .where(eq(salaryPeriods.id, query.salary_period_id))
      .limit(1);

    if (!period) {
      return { range: null, error: 'Salary period tidak ditemukan' };
    }

    return {
      range: { startDate: period.startDate, endDate: period.endDate },
    };
  }

  if (query.filter) {
    switch (query.filter) {
      case 'week':
        return { range: getWeekRange() };
      case 'month':
        return { range: getMonthRange() };
      case 'year':
        return { range: getYearRange() };
      case 'custom':
        return {
          range: { startDate: query.start_date!, endDate: query.end_date! },
        };
    }
  }

  // Tidak ada filter → ambil semua transaksi
  return { range: null };
}

// ─────────────────────────────────────────────
// GET / — List transaksi dengan filter & pagination
// ─────────────────────────────────────────────
router.get(
  '/',
  zValidator('query', transactionQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'Parameter query tidak valid',
          details: result.error.flatten().fieldErrors,
        },
        400
      );
    }
  }),
  async (c) => {
    try {
      const query = c.req.valid('query');

      const { range: dateRange, error: dateError } = await resolveDateRange(query);
      if (dateError) {
        return c.json({ error: dateError }, 404);
      }

      // Bangun kondisi WHERE secara dinamis
      const conditions = [];

      if (dateRange) {
        // gte = greater than or equal, lte = less than or equal
        conditions.push(gte(transactions.transactionDate, dateRange.startDate));
        conditions.push(lte(transactions.transactionDate, dateRange.endDate));
      }
      if (query.category_id) {
        conditions.push(eq(transactions.categoryId, query.category_id));
      }
      if (query.transaction_type) {
        conditions.push(eq(transactions.transactionType, query.transaction_type));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Hitung total row untuk pagination
      // ::int cast karena PostgreSQL count() mengembalikan bigint
      const [{ total }] = await db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(transactions)
        .where(whereClause);

      const offset = (query.page - 1) * query.limit;
      const totalPages = Math.ceil(total / query.limit);

      // Ambil data dengan LEFT JOIN ke categories
      // LEFT JOIN memastikan transaksi tanpa kategori tetap muncul (categoryName = null)
      const data = await db
        .select({
          id: transactions.id,
          transactionDate: transactions.transactionDate,
          transactionType: transactions.transactionType,
          amount: transactions.amount,
          categoryId: transactions.categoryId,
          description: transactions.description,
          createdAt: transactions.createdAt,
          updatedAt: transactions.updatedAt,
          categoryName: categories.name,
          categoryColor: categories.color,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(whereClause)
        .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
        .limit(query.limit)
        .offset(offset);

      return c.json({
        data: data.map((t) => ({
          ...t,
          // PENTING: amount dari numeric PostgreSQL datang sebagai string!
          amount: parseFloat(t.amount),
        })),
        count: total,
        meta: {
          page: query.page,
          limit: query.limit,
          totalPages,
          hasNextPage: query.page < totalPages,
          hasPrevPage: query.page > 1,
        },
      });
    } catch (error) {
      console.error('[GET /transactions]', error);
      return c.json({ error: 'Gagal mengambil data transaksi' }, 500);
    }
  }
);

// ─────────────────────────────────────────────
// GET /:id — Detail satu transaksi
// ─────────────────────────────────────────────
router.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id) || id <= 0) {
      return c.json({ error: 'ID transaksi tidak valid' }, 400);
    }

    const [transaction] = await db
      .select({
        id: transactions.id,
        transactionDate: transactions.transactionDate,
        transactionType: transactions.transactionType,
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        description: transactions.description,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt,
        categoryName: categories.name,
        categoryColor: categories.color,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(eq(transactions.id, id))
      .limit(1);

    if (!transaction) {
      return c.json({ error: 'Transaksi tidak ditemukan' }, 404);
    }

    return c.json({
      data: { ...transaction, amount: parseFloat(transaction.amount) },
    });
  } catch (error) {
    console.error('[GET /transactions/:id]', error);
    return c.json({ error: 'Gagal mengambil data transaksi' }, 500);
  }
});

// ─────────────────────────────────────────────
// POST / — Buat transaksi baru
// ─────────────────────────────────────────────
router.post(
  '/',
  zValidator('json', createTransactionSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'Data transaksi tidak valid',
          details: result.error.flatten().fieldErrors,
        },
        400
      );
    }
  }),
  async (c) => {
    try {
      const body = c.req.valid('json');

      // Validasi category_id ada di database (jika diberikan)
      if (body.category_id) {
        const [cat] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, body.category_id))
          .limit(1);

        if (!cat) {
          return c.json({ error: 'Kategori tidak ditemukan' }, 404);
        }
      }

      // PENTING: amount harus dikonversi ke String saat INSERT ke kolom numeric
      const [created] = await db
        .insert(transactions)
        .values({
          transactionDate: body.transaction_date,
          transactionType: body.transaction_type,
          amount: String(body.amount),
          categoryId: body.category_id ?? null,
          description: body.description ?? null,
        })
        .returning();

      return c.json(
        { data: { ...created, amount: parseFloat(created.amount) } },
        201
      );
    } catch (error) {
      console.error('[POST /transactions]', error);
      return c.json({ error: 'Gagal membuat transaksi' }, 500);
    }
  }
);

// ─────────────────────────────────────────────
// PUT /:id — Update transaksi
// ─────────────────────────────────────────────
router.put(
  '/:id',
  zValidator('json', updateTransactionSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'Data pembaruan tidak valid',
          details: result.error.flatten().fieldErrors,
        },
        400
      );
    }
  }),
  async (c) => {
    try {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id) || id <= 0) {
        return c.json({ error: 'ID transaksi tidak valid' }, 400);
      }

      const body = c.req.valid('json');

      // Cek transaksi ada
      const [existing] = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1);

      if (!existing) {
        return c.json({ error: 'Transaksi tidak ditemukan' }, 404);
      }

      // Cek kategori baru ada (jika disertakan)
      if (body.category_id) {
        const [cat] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, body.category_id))
          .limit(1);

        if (!cat) {
          return c.json({ error: 'Kategori tidak ditemukan' }, 404);
        }
      }

      // Bangun objek update hanya dari field yang dikirim
      // Menggunakan Record<string, unknown> karena field bersifat dinamis
      const updateData: Record<string, unknown> = {};
      if (body.transaction_date !== undefined)
        updateData.transactionDate = body.transaction_date;
      if (body.transaction_type !== undefined)
        updateData.transactionType = body.transaction_type;
      if (body.amount !== undefined)
        updateData.amount = String(body.amount);
      if (body.category_id !== undefined)
        updateData.categoryId = body.category_id;
      if (body.description !== undefined)
        updateData.description = body.description;

      const [updated] = await db
        .update(transactions)
        .set(updateData)
        .where(eq(transactions.id, id))
        .returning();

      return c.json({
        data: { ...updated, amount: parseFloat(updated.amount) },
      });
    } catch (error) {
      console.error('[PUT /transactions/:id]', error);
      return c.json({ error: 'Gagal memperbarui transaksi' }, 500);
    }
  }
);

// ─────────────────────────────────────────────
// DELETE /:id — Hapus transaksi
// ─────────────────────────────────────────────
router.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id) || id <= 0) {
      return c.json({ error: 'ID transaksi tidak valid' }, 400);
    }

    // .returning() mengembalikan data yang dihapus — jika kosong berarti tidak ada
    const [deleted] = await db
      .delete(transactions)
      .where(eq(transactions.id, id))
      .returning();

    if (!deleted) {
      return c.json({ error: 'Transaksi tidak ditemukan' }, 404);
    }

    return c.json({
      data: { message: 'Transaksi berhasil dihapus', id: deleted.id },
    });
  } catch (error) {
    console.error('[DELETE /transactions/:id]', error);
    return c.json({ error: 'Gagal menghapus transaksi' }, 500);
  }
});

export default router;
```

> 🐛 **Gotcha paling umum di Langkah ini:** Lupa mengkonversi `amount`. Drizzle memetakan kolom PostgreSQL `numeric` ke JavaScript `string` — bukan `number`. Selalu gunakan `String(body.amount)` saat INSERT/UPDATE, dan `parseFloat(row.amount)` saat mengembalikan ke client. Jika lupa, TypeScript tidak akan error tapi response JSON akan berisi string seperti `"amount": "75000.00"` bukannya `"amount": 75000`.

---

## Langkah 5 — Implementasi CRUD Categories

### Validator Kategori

Buat `src/validators/category.ts`:

```typescript
import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, 'Nama kategori tidak boleh kosong')
    .max(100, 'Nama kategori maksimal 100 karakter'),
  color: z
    .string()
    .regex(
      /^#[0-9A-Fa-f]{6}$/,
      'Warna harus dalam format hex (#RRGGBB), contoh: #FF6B6B'
    )
    .optional()
    .nullable(),
  type: z.enum(['income', 'expense', 'both'], {
    errorMap: () => ({
      message: 'Tipe harus income, expense, atau both',
    }),
  }),
});

export const updateCategorySchema = createCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
```

### Route Kategori

Buat `src/routes/categories.ts`. Yang membuat file ini istimewa adalah endpoint `/seed` yang harus idempotent — aman dijalankan berkali-kali tanpa membuat duplikat.

Trik idempotency: Karena kolom `name` di tabel `categories` punya constraint `unique()`, kita bisa menggunakan `.onConflictDoNothing()` dari Drizzle. Jika kategori dengan nama yang sama sudah ada, Drizzle akan skip INSERT tersebut tanpa error.

> ⚠️ **Penting:** Route `/seed` harus didefinisikan **sebelum** `/:id`, karena Hono mencocokkan route secara berurutan. Jika `/:id` lebih dulu, maka `/seed` akan ditangkap oleh route itu dengan `id = 'seed'`.

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, asc } from 'drizzle-orm';
import { db } from '../db';
import { categories } from '../db/schema';
import {
  createCategorySchema,
  updateCategorySchema,
} from '../validators/category';

const router = new Hono();

// ─────────────────────────────────────────────
// Data seed default
// ─────────────────────────────────────────────
const DEFAULT_CATEGORIES: Array<{
  name: string;
  color: string;
  type: 'income' | 'expense' | 'both';
}> = [
  // Expense
  { name: 'Makanan & Minuman', color: '#FF6B6B', type: 'expense' },
  { name: 'Transportasi',      color: '#4ECDC4', type: 'expense' },
  { name: 'Belanja',           color: '#45B7D1', type: 'expense' },
  { name: 'Tagihan & Utilitas',color: '#FFA07A', type: 'expense' },
  { name: 'Hiburan',           color: '#98D8C8', type: 'expense' },
  { name: 'Kesehatan',         color: '#F7DC6F', type: 'expense' },
  { name: 'Pendidikan',        color: '#BB8FCE', type: 'expense' },
  { name: 'Perawatan Diri',    color: '#85C1E9', type: 'expense' },
  { name: 'Sosial',            color: '#82E0AA', type: 'expense' },
  { name: 'Lainnya',           color: '#AEB6BF', type: 'expense' },
  // Income
  { name: 'Gaji',              color: '#2ECC71', type: 'income' },
  { name: 'Freelance',         color: '#3498DB', type: 'income' },
  { name: 'Investasi',         color: '#F39C12', type: 'income' },
  { name: 'Bonus',             color: '#E74C3C', type: 'income' },
  { name: 'Lainnya Pemasukan', color: '#9B59B6', type: 'income' },
];

// ─────────────────────────────────────────────
// GET / — Semua kategori
// ─────────────────────────────────────────────
router.get('/', async (c) => {
  try {
    const data = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.type), asc(categories.name));

    return c.json({ data });
  } catch (error) {
    console.error('[GET /categories]', error);
    return c.json({ error: 'Gagal mengambil data kategori' }, 500);
  }
});

// ─────────────────────────────────────────────
// POST /seed — Seed kategori default (IDEMPOTENT)
// Harus sebelum /:id agar tidak salah route!
// ─────────────────────────────────────────────
router.post('/seed', async (c) => {
  try {
    // onConflictDoNothing() skip INSERT jika name sudah ada (unique constraint)
    // Ini yang membuat endpoint ini idempotent
    const inserted = await db
      .insert(categories)
      .values(DEFAULT_CATEGORIES)
      .onConflictDoNothing()
      .returning();

    return c.json(
      {
        data: {
          message: `Seeding selesai. ${inserted.length} kategori baru ditambahkan.`,
          inserted: inserted.length,
          skipped: DEFAULT_CATEGORIES.length - inserted.length,
          total_defaults: DEFAULT_CATEGORIES.length,
        },
      },
      201
    );
  } catch (error) {
    console.error('[POST /categories/seed]', error);
    return c.json({ error: 'Gagal melakukan seed kategori' }, 500);
  }
});

// ─────────────────────────────────────────────
// GET /:id — Satu kategori
// ─────────────────────────────────────────────
router.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id) || id <= 0) {
      return c.json({ error: 'ID kategori tidak valid' }, 400);
    }

    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    if (!category) {
      return c.json({ error: 'Kategori tidak ditemukan' }, 404);
    }

    return c.json({ data: category });
  } catch (error) {
    console.error('[GET /categories/:id]', error);
    return c.json({ error: 'Gagal mengambil data kategori' }, 500);
  }
});

// ─────────────────────────────────────────────
// POST / — Buat kategori baru
// ─────────────────────────────────────────────
router.post(
  '/',
  zValidator('json', createCategorySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'Data kategori tidak valid',
          details: result.error.flatten().fieldErrors,
        },
        400
      );
    }
  }),
  async (c) => {
    try {
      const body = c.req.valid('json');

      const [created] = await db
        .insert(categories)
        .values({
          name: body.name,
          color: body.color ?? null,
          type: body.type,
        })
        .returning();

      return c.json({ data: created }, 201);
    } catch (error: unknown) {
      // PostgreSQL error code 23505 = unique_violation
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
        return c.json(
          { error: 'Kategori dengan nama tersebut sudah ada' },
          409
        );
      }
      console.error('[POST /categories]', error);
      return c.json({ error: 'Gagal membuat kategori' }, 500);
    }
  }
);

// ─────────────────────────────────────────────
// PUT /:id — Update kategori
// ─────────────────────────────────────────────
router.put(
  '/:id',
  zValidator('json', updateCategorySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'Data pembaruan tidak valid',
          details: result.error.flatten().fieldErrors,
        },
        400
      );
    }
  }),
  async (c) => {
    try {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id) || id <= 0) {
        return c.json({ error: 'ID kategori tidak valid' }, 400);
      }

      const body = c.req.valid('json');

      const [existing] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);

      if (!existing) {
        return c.json({ error: 'Kategori tidak ditemukan' }, 404);
      }

      const [updated] = await db
        .update(categories)
        .set(body)
        .where(eq(categories.id, id))
        .returning();

      return c.json({ data: updated });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
        return c.json(
          { error: 'Kategori dengan nama tersebut sudah ada' },
          409
        );
      }
      console.error('[PUT /categories/:id]', error);
      return c.json({ error: 'Gagal memperbarui kategori' }, 500);
    }
  }
);

// ─────────────────────────────────────────────
// DELETE /:id — Hapus kategori
// ─────────────────────────────────────────────
router.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id) || id <= 0) {
      return c.json({ error: 'ID kategori tidak valid' }, 400);
    }

    const [deleted] = await db
      .delete(categories)
      .where(eq(categories.id, id))
      .returning();

    if (!deleted) {
      return c.json({ error: 'Kategori tidak ditemukan' }, 404);
    }

    return c.json({
      data: { message: 'Kategori berhasil dihapus', id: deleted.id },
    });
  } catch (error) {
    console.error('[DELETE /categories/:id]', error);
    return c.json({ error: 'Gagal menghapus kategori' }, 500);
  }
});

export default router;
```

---

## Langkah 6 — Implementasi CRUD Salary Periods

### Validasi Cross-Field dengan Zod `.refine()`

Tantangan utama di fitur ini adalah memvalidasi bahwa `end_date` harus selalu setelah `start_date`. Ini adalah validasi lintas-field yang tidak bisa dilakukan dengan single-field validator biasa. Zod menyediakan `.refine()` untuk kasus ini.

Buat `src/validators/salary-period.ts`:

```typescript
import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createSalaryPeriodSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Nama periode tidak boleh kosong')
      .max(100, 'Nama periode maksimal 100 karakter'),
    start_date: z
      .string()
      .regex(dateRegex, 'Format tanggal mulai harus YYYY-MM-DD'),
    end_date: z
      .string()
      .regex(dateRegex, 'Format tanggal akhir harus YYYY-MM-DD'),
    salary_amount: z
      .number()
      .positive('Nominal gaji harus lebih dari 0')
      .optional()
      .nullable(),
  })
  // .refine() menerima fungsi validator yang melihat seluruh objek
  // Berguna untuk validasi yang melibatkan lebih dari satu field
  .refine((data) => data.end_date > data.start_date, {
    message: 'Tanggal akhir harus setelah tanggal mulai',
    path: ['end_date'], // error akan muncul di field end_date
  });

// Untuk update: semua field opsional, tapi jika keduanya ada, validasi tetap berlaku
export const updateSalaryPeriodSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    start_date: z.string().regex(dateRegex).optional(),
    end_date: z.string().regex(dateRegex).optional(),
    salary_amount: z.number().positive().optional().nullable(),
  })
  .refine(
    (data) => {
      // Hanya validasi jika kedua tanggal diberikan bersamaan
      if (data.start_date && data.end_date) {
        return data.end_date > data.start_date;
      }
      return true;
    },
    {
      message: 'Tanggal akhir harus setelah tanggal mulai',
      path: ['end_date'],
    }
  );

export type CreateSalaryPeriodInput = z.infer<typeof createSalaryPeriodSchema>;
export type UpdateSalaryPeriodInput = z.infer<typeof updateSalaryPeriodSchema>;
```

### Route Salary Periods

Buat `src/routes/salary-periods.ts`. Di handler PUT, ada validasi tambahan di level route untuk kasus di mana hanya satu tanggal yang diupdate — kita perlu membandingkannya dengan tanggal yang sudah tersimpan di database.

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { salaryPeriods } from '../db/schema';
import {
  createSalaryPeriodSchema,
  updateSalaryPeriodSchema,
} from '../validators/salary-period';

const router = new Hono();

// Helper konversi salaryAmount dari string ke number
function formatPeriod(p: typeof salaryPeriods.$inferSelect) {
  return {
    ...p,
    salaryAmount: p.salaryAmount ? parseFloat(p.salaryAmount) : null,
  };
}

// ─────────────────────────────────────────────
// GET / — Semua salary period, urut terbaru
// ─────────────────────────────────────────────
router.get('/', async (c) => {
  try {
    const data = await db
      .select()
      .from(salaryPeriods)
      .orderBy(desc(salaryPeriods.startDate));

    return c.json({ data: data.map(formatPeriod) });
  } catch (error) {
    console.error('[GET /salary-periods]', error);
    return c.json({ error: 'Gagal mengambil data salary period' }, 500);
  }
});

// ─────────────────────────────────────────────
// POST /seed — Generate salary period otomatis
// Tanggal gaji: 27 setiap bulan
// Range: (tahun ini - 1) s.d. (tahun ini + 1)
// ⚠️ Harus di atas /:id agar tidak ter-intercept
// ─────────────────────────────────────────────
router.post('/seed', async (c) => {
  try {
    const BULAN = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];

    const now = new Date();
    const startYear = now.getFullYear() - 1;
    const endYear = now.getFullYear() + 1;

    // Generate daftar period berdasarkan tanggal gaji = 27
    const periodsToSeed: { name: string; startDate: string; endDate: string }[] = [];

    for (let year = startYear; year <= endYear; year++) {
      for (let month = 0; month < 12; month++) {
        // Mulai: tanggal 27 bulan ini
        const startDate = `${year}-${String(month + 1).padStart(2, '0')}-27`;

        // Selesai: tanggal 26 bulan berikutnya
        const nextMonth = month === 11 ? 0 : month + 1;
        const nextYear = month === 11 ? year + 1 : year;
        const endDate = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-26`;

        periodsToSeed.push({
          name: `${BULAN[month]} ${year}`,
          startDate,
          endDate,
        });
      }
    }

    // Ambil start_date yang sudah ada di DB untuk cek duplikat
    const existing = await db
      .select({ startDate: salaryPeriods.startDate })
      .from(salaryPeriods);

    const existingDates = new Set(existing.map((r) => r.startDate));

    // Hanya insert yang belum ada
    const newPeriods = periodsToSeed.filter((p) => !existingDates.has(p.startDate));

    if (newPeriods.length === 0) {
      return c.json({
        message: 'Semua salary period sudah ada, tidak ada yang ditambahkan',
        inserted: 0,
        skipped: periodsToSeed.length,
      });
    }

    const inserted = await db
      .insert(salaryPeriods)
      .values(newPeriods)
      .returning();

    return c.json(
      {
        message: `Berhasil menambahkan ${inserted.length} salary period`,
        inserted: inserted.length,
        skipped: periodsToSeed.length - inserted.length,
        data: inserted.map(formatPeriod),
      },
      201
    );
  } catch (error) {
    console.error('[POST /salary-periods/seed]', error);
    return c.json({ error: 'Gagal melakukan seed salary periods' }, 500);
  }
});

// ─────────────────────────────────────────────
// GET /:id — Satu salary period
// ─────────────────────────────────────────────
router.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id) || id <= 0) {
      return c.json({ error: 'ID salary period tidak valid' }, 400);
    }

    const [period] = await db
      .select()
      .from(salaryPeriods)
      .where(eq(salaryPeriods.id, id))
      .limit(1);

    if (!period) {
      return c.json({ error: 'Salary period tidak ditemukan' }, 404);
    }

    return c.json({ data: formatPeriod(period) });
  } catch (error) {
    console.error('[GET /salary-periods/:id]', error);
    return c.json({ error: 'Gagal mengambil data salary period' }, 500);
  }
});

// ─────────────────────────────────────────────
// POST / — Buat salary period baru
// ─────────────────────────────────────────────
router.post(
  '/',
  zValidator('json', createSalaryPeriodSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'Data salary period tidak valid',
          details: result.error.flatten().fieldErrors,
        },
        400
      );
    }
  }),
  async (c) => {
    try {
      const body = c.req.valid('json');

      const [created] = await db
        .insert(salaryPeriods)
        .values({
          name: body.name,
          startDate: body.start_date,
          endDate: body.end_date,
          salaryAmount: body.salary_amount != null ? String(body.salary_amount) : null,
        })
        .returning();

      return c.json({ data: formatPeriod(created) }, 201);
    } catch (error) {
      console.error('[POST /salary-periods]', error);
      return c.json({ error: 'Gagal membuat salary period' }, 500);
    }
  }
);

// ─────────────────────────────────────────────
// PUT /:id — Update salary period
// ─────────────────────────────────────────────
router.put(
  '/:id',
  zValidator('json', updateSalaryPeriodSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'Data pembaruan tidak valid',
          details: result.error.flatten().fieldErrors,
        },
        400
      );
    }
  }),
  async (c) => {
    try {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id) || id <= 0) {
        return c.json({ error: 'ID salary period tidak valid' }, 400);
      }

      const body = c.req.valid('json');

      const [existing] = await db
        .select()
        .from(salaryPeriods)
        .where(eq(salaryPeriods.id, id))
        .limit(1);

      if (!existing) {
        return c.json({ error: 'Salary period tidak ditemukan' }, 404);
      }

      // Validasi cross-field dengan data yang sudah ada di database
      // Contoh: user kirim hanya end_date → bandingkan dengan start_date yang ada
      const finalStartDate = body.start_date ?? existing.startDate;
      const finalEndDate = body.end_date ?? existing.endDate;

      if (finalEndDate <= finalStartDate) {
        return c.json(
          { error: 'Tanggal akhir harus setelah tanggal mulai' },
          400
        );
      }

      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.start_date !== undefined) updateData.startDate = body.start_date;
      if (body.end_date !== undefined) updateData.endDate = body.end_date;
      if (body.salary_amount !== undefined) {
        updateData.salaryAmount =
          body.salary_amount != null ? String(body.salary_amount) : null;
      }

      const [updated] = await db
        .update(salaryPeriods)
        .set(updateData)
        .where(eq(salaryPeriods.id, id))
        .returning();

      return c.json({ data: formatPeriod(updated) });
    } catch (error) {
      console.error('[PUT /salary-periods/:id]', error);
      return c.json({ error: 'Gagal memperbarui salary period' }, 500);
    }
  }
);

// ─────────────────────────────────────────────
// DELETE /:id — Hapus salary period
// ─────────────────────────────────────────────
router.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id) || id <= 0) {
      return c.json({ error: 'ID salary period tidak valid' }, 400);
    }

    const [deleted] = await db
      .delete(salaryPeriods)
      .where(eq(salaryPeriods.id, id))
      .returning();

    if (!deleted) {
      return c.json({ error: 'Salary period tidak ditemukan' }, 404);
    }

    return c.json({
      data: { message: 'Salary period berhasil dihapus', id: deleted.id },
    });
  } catch (error) {
    console.error('[DELETE /salary-periods/:id]', error);
    return c.json({ error: 'Gagal menghapus salary period' }, 500);
  }
});

export default router;
```

---

## Langkah 7 — Implementasi Summary & Analytics

Langkah ini adalah yang paling teknis karena melibatkan query agregasi SQL, grouping, dan pembuatan data time-series. Drizzle menyediakan helper `sql` template literal untuk menulis SQL langsung saat query builder bawaan tidak cukup.

Buat `src/routes/summary.ts`:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm';
import { db } from '../db';
import { transactions, categories, salaryPeriods } from '../db/schema';
import { summaryQuerySchema, type SummaryQuery } from '../validators/query-filters';
import {
  getWeekRange,
  getMonthRange,
  getYearRange,
  generateDateRange,
  type DateRange,
} from '../lib/date-filters';

const router = new Hono();

// ─────────────────────────────────────────────
// Helper: Resolve date range + metadata periode
// ─────────────────────────────────────────────
async function resolveSummaryRange(query: SummaryQuery): Promise<{
  range: DateRange | null;
  periodMeta: Record<string, unknown>;
  error?: string;
}> {
  if (query.salary_period_id) {
    const [period] = await db
      .select()
      .from(salaryPeriods)
      .where(eq(salaryPeriods.id, query.salary_period_id))
      .limit(1);

    if (!period) {
      return { range: null, periodMeta: {}, error: 'Salary period tidak ditemukan' };
    }

    return {
      range: { startDate: period.startDate, endDate: period.endDate },
      periodMeta: {
        filter: 'salary_period',
        salary_period_id: query.salary_period_id,
        start_date: period.startDate,
        end_date: period.endDate,
      },
    };
  }

  if (query.filter) {
    let range: DateRange;
    switch (query.filter) {
      case 'week':  range = getWeekRange();  break;
      case 'month': range = getMonthRange(); break;
      case 'year':  range = getYearRange();  break;
      case 'custom':
        range = { startDate: query.start_date!, endDate: query.end_date! };
        break;
      default: range = getMonthRange();
    }
    return {
      range,
      periodMeta: { filter: query.filter, start_date: range.startDate, end_date: range.endDate },
    };
  }

  return { range: null, periodMeta: { filter: 'all' } };
}

// ─────────────────────────────────────────────
// GET / — Total income, expense, balance
// ─────────────────────────────────────────────
router.get(
  '/',
  zValidator('query', summaryQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Parameter tidak valid', details: result.error.flatten().fieldErrors }, 400);
    }
  }),
  async (c) => {
    try {
      const query = c.req.valid('query');
      const { range, periodMeta, error } = await resolveSummaryRange(query);
      if (error) return c.json({ error }, 404);

      const conditions = [];
      if (range) {
        conditions.push(gte(transactions.transactionDate, range.startDate));
        conditions.push(lte(transactions.transactionDate, range.endDate));
      }
      if (query.transaction_type) {
        conditions.push(eq(transactions.transactionType, query.transaction_type));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Query agregasi dengan GROUP BY transaction_type
      // sql`coalesce(sum(...), 0)` mengembalikan 0 jika tidak ada transaksi
      const results = await db
        .select({
          transactionType: transactions.transactionType,
          total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(transactions)
        .where(whereClause)
        .groupBy(transactions.transactionType);

      let totalIncome = 0;
      let totalExpense = 0;
      let transactionCount = 0;

      results.forEach((row) => {
        const amount = parseFloat(row.total);
        if (row.transactionType === 'income') {
          totalIncome = amount;
        } else {
          totalExpense = amount;
        }
        transactionCount += row.count;
      });

      return c.json({
        data: {
          total_income: totalIncome,
          total_expense: totalExpense,
          balance: totalIncome - totalExpense,
          transaction_count: transactionCount,
        },
        period: periodMeta,
      });
    } catch (error) {
      console.error('[GET /summary]', error);
      return c.json({ error: 'Gagal mengambil ringkasan' }, 500);
    }
  }
);

// ─────────────────────────────────────────────
// GET /by-category — Breakdown per kategori
// ─────────────────────────────────────────────
router.get(
  '/by-category',
  zValidator('query', summaryQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Parameter tidak valid', details: result.error.flatten().fieldErrors }, 400);
    }
  }),
  async (c) => {
    try {
      const query = c.req.valid('query');
      const { range, periodMeta, error } = await resolveSummaryRange(query);
      if (error) return c.json({ error }, 404);

      const conditions = [];
      if (range) {
        conditions.push(gte(transactions.transactionDate, range.startDate));
        conditions.push(lte(transactions.transactionDate, range.endDate));
      }
      if (query.transaction_type) {
        conditions.push(eq(transactions.transactionType, query.transaction_type));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // GROUP BY multi-kolom: kategori + tipe transaksi
      // Ini menghasilkan satu baris per kombinasi kategori-tipe
      const results = await db
        .select({
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          categoryColor: categories.color,
          transactionType: transactions.transactionType,
          total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(whereClause)
        .groupBy(
          transactions.categoryId,
          categories.name,
          categories.color,
          transactions.transactionType
        )
        .orderBy(desc(sql`sum(${transactions.amount})`));

      // Hitung total per tipe untuk menghitung persentase
      const incomeTotals = results
        .filter((r) => r.transactionType === 'income')
        .reduce((sum, r) => sum + parseFloat(r.total), 0);
      const expenseTotals = results
        .filter((r) => r.transactionType === 'expense')
        .reduce((sum, r) => sum + parseFloat(r.total), 0);

      const data = results.map((row) => {
        const total = parseFloat(row.total);
        const typeTotal = row.transactionType === 'income' ? incomeTotals : expenseTotals;
        const percentage = typeTotal > 0 ? (total / typeTotal) * 100 : 0;

        return {
          category_id: row.categoryId,
          category_name: row.categoryName,
          category_color: row.categoryColor,
          transaction_type: row.transactionType,
          total,
          percentage: Math.round(percentage * 10) / 10, // 1 desimal
          count: row.count,
        };
      });

      return c.json({ data, period: periodMeta });
    } catch (error) {
      console.error('[GET /summary/by-category]', error);
      return c.json({ error: 'Gagal mengambil ringkasan per kategori' }, 500);
    }
  }
);

// ─────────────────────────────────────────────
// GET /chart — Data time-series harian untuk chart
// ─────────────────────────────────────────────
router.get(
  '/chart',
  zValidator('query', summaryQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Parameter tidak valid', details: result.error.flatten().fieldErrors }, 400);
    }
  }),
  async (c) => {
    try {
      const query = c.req.valid('query');

      // Chart selalu butuh date range — default ke bulan berjalan
      let range: DateRange;
      let periodMeta: Record<string, unknown>;

      if (query.salary_period_id) {
        const [period] = await db
          .select()
          .from(salaryPeriods)
          .where(eq(salaryPeriods.id, query.salary_period_id))
          .limit(1);

        if (!period) return c.json({ error: 'Salary period tidak ditemukan' }, 404);

        range = { startDate: period.startDate, endDate: period.endDate };
        periodMeta = { start_date: period.startDate, end_date: period.endDate };
      } else if (query.filter === 'custom') {
        range = { startDate: query.start_date!, endDate: query.end_date! };
        periodMeta = { start_date: query.start_date, end_date: query.end_date };
      } else if (query.filter === 'week') {
        range = getWeekRange();
        periodMeta = { start_date: range.startDate, end_date: range.endDate };
      } else if (query.filter === 'year') {
        range = getYearRange();
        periodMeta = { start_date: range.startDate, end_date: range.endDate };
      } else {
        range = getMonthRange();
        periodMeta = { start_date: range.startDate, end_date: range.endDate };
      }

      // Query: total per hari per tipe transaksi
      const rawData = await db
        .select({
          date: transactions.transactionDate,
          transactionType: transactions.transactionType,
          total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.transactionDate, range.startDate),
            lte(transactions.transactionDate, range.endDate)
          )
        )
        .groupBy(transactions.transactionDate, transactions.transactionType)
        .orderBy(asc(transactions.transactionDate));

      // Generate semua label tanggal dalam rentang (termasuk hari tanpa transaksi)
      const labels = generateDateRange(range.startDate, range.endDate);

      // Buat Map untuk lookup O(1) saat mengisi array
      const incomeMap = new Map<string, number>();
      const expenseMap = new Map<string, number>();

      rawData.forEach((row) => {
        // Drizzle date type → string 'YYYY-MM-DD'
        const date = row.date as string;
        const amount = parseFloat(row.total);

        if (row.transactionType === 'income') {
          incomeMap.set(date, (incomeMap.get(date) ?? 0) + amount);
        } else {
          expenseMap.set(date, (expenseMap.get(date) ?? 0) + amount);
        }
      });

      // Map setiap label ke nilai income/expense (0 jika tidak ada transaksi)
      return c.json({
        data: {
          labels,
          income:  labels.map((d) => incomeMap.get(d)  ?? 0),
          expense: labels.map((d) => expenseMap.get(d) ?? 0),
        },
        period: periodMeta,
      });
    } catch (error) {
      console.error('[GET /summary/chart]', error);
      return c.json({ error: 'Gagal mengambil data chart' }, 500);
    }
  }
);

export default router;
```

> 💡 **Penjelasan teknis data chart:** Database hanya menyimpan hari-hari yang punya transaksi. Jika tanggal 15 tidak ada transaksi, tidak ada baris untuk tanggal itu. Kita perlu mengisi "celah" ini dengan 0 agar chart di frontend bisa menampilkan grafik yang benar. Caranya: generate semua tanggal terlebih dahulu dengan `generateDateRange()`, lalu untuk setiap tanggal, ambil nilainya dari Map (atau 0 jika tidak ada). Pendekatan Map memberikan lookup O(1) yang efisien.

---

## Langkah 8 — Implementasi Backup Google Sheets

### Setup Google Cloud Console

Sebelum menulis kode, kita perlu membuat service account di Google Cloud untuk autentikasi tanpa OAuth flow. Ikuti langkah-langkah berikut:

**1. Buat Project di Google Cloud Console**
- Buka [console.cloud.google.com](https://console.cloud.google.com)
- Klik dropdown project di atas, lalu **New Project**
- Beri nama misalnya `pixel-pocket`, klik **Create**

**2. Aktifkan Google Sheets API**
- Di sidebar kiri, buka **APIs & Services → Library**
- Cari `Google Sheets API`, klik, lalu klik **Enable**

**3. Buat Service Account**
- Buka **APIs & Services → Credentials**
- Klik **+ Create Credentials → Service Account**
- Isi nama service account (misal `pixel-pocket-sheets`)
- Klik **Create and Continue**, lewati langkah grant access, klik **Done**

**4. Buat dan Download Key**
- Klik service account yang baru dibuat
- Buka tab **Keys** → **Add Key → Create new key**
- Pilih format **JSON**, klik **Create**
- File JSON akan otomatis ter-download

**5. Siapkan Google Spreadsheet**
- Buka atau buat spreadsheet baru di [sheets.google.com](https://sheets.google.com)
- Rename sheet pertama menjadi `Transactions`
- Salin **Spreadsheet ID** dari URL: `https://docs.google.com/spreadsheets/d/**[INI_ID_NYA]**/edit`
- Klik **Share**, tambahkan email service account (terlihat di JSON key, field `client_email`) dengan akses **Editor**

**6. Masukkan Credentials ke .env**

Buka file JSON key yang ter-download. Isi `.env` dengan:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=pixel-pocket-sheets@pixel-pocket-xxx.iam.gserviceaccount.com
GOOGLE_SPREADSHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms

# Private key: salin dari JSON, ganti newline literal dengan \n
# Format di .env: "-----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----\n"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBg...\n-----END PRIVATE KEY-----\n"
```

> ⚠️ **Masalah paling umum: Format GOOGLE_PRIVATE_KEY**
> Private key di JSON aslinya berisi newline literal (`\n` yang benar-benar jadi baris baru). Saat kamu copy ke file `.env`, newline harus direpresentasikan sebagai `\n` (dua karakter: backslash dan n) di dalam satu baris, dibungkus tanda kutip ganda. Di kode, kita akan `replace(/\\n/g, '\n')` untuk mengembalikannya ke newline sesungguhnya.

### Helper Google Sheets

Buat `src/lib/google-sheets.ts`:

```typescript
import { google } from 'googleapis';

function createAuthClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  // Konversi \n literal ke newline sesungguhnya
  // Ini diperlukan karena .env menyimpan newline sebagai literal \n
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!email || !privateKey || !spreadsheetId) {
    throw new Error(
      'Konfigurasi Google Sheets tidak lengkap. Periksa GOOGLE_SERVICE_ACCOUNT_EMAIL, ' +
      'GOOGLE_PRIVATE_KEY, dan GOOGLE_SPREADSHEET_ID di environment variables.'
    );
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export interface SheetRow {
  id: number;
  transactionDate: string;
  transactionType: string;
  amount: number;
  categoryName: string | null;
  description: string | null;
  createdAt: Date | null;
}

export async function exportTransactionsToSheet(rows: SheetRow[]): Promise<{
  rowsExported: number;
}> {
  const auth = createAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID!;
  const sheetName = 'Transactions';

  // Header baris pertama
  const headers = [
    ['ID', 'Tanggal', 'Tipe', 'Nominal', 'Kategori', 'Deskripsi', 'Dibuat Pada'],
  ];

  // Ubah setiap row menjadi array nilai sesuai urutan kolom
  const dataRows = rows.map((row) => [
    row.id,
    row.transactionDate,
    row.transactionType === 'income' ? 'Pemasukan' : 'Pengeluaran',
    row.amount,
    row.categoryName ?? '-',
    row.description ?? '-',
    row.createdAt ? row.createdAt.toISOString() : '-',
  ]);

  const values = [...headers, ...dataRows];

  // Hapus semua data lama di kolom A-G
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A:G`,
  });

  // Tulis data baru mulai dari A1
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW', // RAW = nilai disimpan as-is, bukan diinterpretasi formula
    requestBody: { values },
  });

  return { rowsExported: dataRows.length };
}
```

### Route Backup

Buat `src/routes/backup.ts`:

```typescript
import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { transactions, categories } from '../db/schema';
import { exportTransactionsToSheet, type SheetRow } from '../lib/google-sheets';

const router = new Hono();

// POST /api/backup/spreadsheet
router.post('/spreadsheet', async (c) => {
  try {
    // Ambil semua transaksi beserta nama kategorinya
    const allTransactions = await db
      .select({
        id: transactions.id,
        transactionDate: transactions.transactionDate,
        transactionType: transactions.transactionType,
        amount: transactions.amount,
        categoryName: categories.name,
        description: transactions.description,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt));

    const rows: SheetRow[] = allTransactions.map((t) => ({
      id: t.id,
      transactionDate: t.transactionDate,
      transactionType: t.transactionType,
      amount: parseFloat(t.amount),
      categoryName: t.categoryName,
      description: t.description,
      createdAt: t.createdAt,
    }));

    const result = await exportTransactionsToSheet(rows);

    return c.json({
      data: {
        message: `Backup berhasil. ${result.rowsExported} transaksi diekspor ke Google Sheets.`,
        rows_exported: result.rowsExported,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[POST /backup/spreadsheet]', error);

    // Berikan pesan error yang informatif untuk kesalahan konfigurasi
    if (error instanceof Error && error.message.includes('Konfigurasi')) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ error: 'Gagal melakukan backup ke Google Sheets' }, 500);
  }
});

export default router;
```

---

## Langkah 9 — Konfigurasi Vercel

### Entry Point Vercel

Buat folder `api/` dan file `api/index.ts`. Vercel mendeteksi file di folder `api/` sebagai Serverless Function secara otomatis.

```typescript
import { handle } from 'hono/vercel';
import app from '../src/index';

// Menggunakan Node.js runtime karena package 'googleapis' membutuhkan Node.js API
// (tidak kompatibel dengan Edge Runtime yang hanya memiliki Web Standard API)
// Jika fitur backup tidak diperlukan dan kamu ingin Edge Runtime, ganti ke 'edge'
export const runtime = 'nodejs';

export default handle(app);
```

### File vercel.json

Buat `vercel.json` di root proyek. File ini menginstruksikan Vercel untuk meneruskan semua request ke serverless function kita.

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index"
    }
  ]
}
```

### Mendeploy ke Vercel

**Cara 1: Via Vercel CLI**

```bash
# Install Vercel CLI
bun add -g vercel

# Login dan deploy
vercel login
vercel

# Ikuti petunjuk di terminal:
# - Set up and deploy? Y
# - Which scope? (pilih akun kamu)
# - Link to existing project? N
# - Project name? pixel-pocket-api
# - Directory? ./
# - Override settings? N
```

**Cara 2: Via GitHub Integration**

1. Push kode ke GitHub repository
2. Buka [vercel.com](https://vercel.com), klik **New Project**
3. Import repository dari GitHub
4. Vercel otomatis mendeteksi konfigurasi

### Menambahkan Environment Variables di Vercel

Setelah deploy, buka **Project Settings → Environment Variables** di Vercel dashboard dan tambahkan:

| Name | Value |
|------|-------|
| `DATABASE_URL` | Connection string Neon kamu |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email service account |
| `GOOGLE_SPREADSHEET_ID` | ID spreadsheet |
| `GOOGLE_PRIVATE_KEY` | Private key lengkap (lihat catatan di bawah) |

> ⚠️ **Cara memasukkan GOOGLE_PRIVATE_KEY di Vercel Dashboard:**
> Saat memasukkan private key di Vercel, **jangan** bungkus dengan tanda kutip. Vercel menyediakan text area yang bisa menampung newline sesungguhnya. Salin konten key dari JSON langsung (dengan newline asli), bukan versi `\n`-escaped. Vercel akan menyimpannya dengan benar.
>
> Jika kamu menggunakan Vercel CLI, tambahkan dengan:
> ```bash
> vercel env add GOOGLE_PRIVATE_KEY
> # Paste key lengkap, tekan Enter, lalu Ctrl+D
> ```

Setelah menambahkan env vars, lakukan redeploy:

```bash
vercel --prod
```

---

## Langkah 10 — Testing Lengkap

Buat file `pixel-pocket-api.http` di root proyek untuk VS Code REST Client. Install extension **REST Client** (Huachao Mao) di VS Code jika belum ada.

```http
### Pixel Pocket API — Complete Test Suite
### Gunakan dengan VS Code Extension: REST Client

@BASE_URL = http://localhost:3000

# Untuk production, ganti dengan:
# @BASE_URL = https://pixel-pocket-api-xxx.vercel.app

###########################################################
# 🏥 HEALTH CHECK
###########################################################

### Health Check
GET {{BASE_URL}}/


###########################################################
# 🗂️ CATEGORIES
###########################################################

### 1. Seed kategori default (jalankan ini dulu!)
POST {{BASE_URL}}/api/categories/seed

### 2. Seed lagi (idempotent — aman, tidak buat duplikat)
POST {{BASE_URL}}/api/categories/seed

### 3. Get semua kategori
GET {{BASE_URL}}/api/categories

### 4. Get kategori by ID
GET {{BASE_URL}}/api/categories/1

### 5. Buat kategori custom
POST {{BASE_URL}}/api/categories
Content-Type: application/json

{
  "name": "Cicilan Rumah",
  "color": "#FF5733",
  "type": "expense"
}

### 6. Update kategori
PUT {{BASE_URL}}/api/categories/16
Content-Type: application/json

{
  "color": "#27AE60"
}

### 7. Hapus kategori (ganti ID sesuai yang dibuat)
DELETE {{BASE_URL}}/api/categories/16

### 8. Error: warna hex tidak valid
POST {{BASE_URL}}/api/categories
Content-Type: application/json

{
  "name": "Test Invalid",
  "color": "merah",
  "type": "expense"
}

### 9. Error: nama sudah ada (duplikat)
POST {{BASE_URL}}/api/categories
Content-Type: application/json

{
  "name": "Gaji",
  "type": "income"
}


###########################################################
# 📅 SALARY PERIODS
###########################################################

### 10. Seed salary period otomatis (gajian tanggal 27)
### Generate ~36 period: (tahun ini - 1) s.d. (tahun ini + 1)
### Aman dijalankan berulang — duplikat otomatis dilewati
POST {{BASE_URL}}/api/salary-periods/seed

### 11. Buat salary period dengan nominal
POST {{BASE_URL}}/api/salary-periods
Content-Type: application/json

{
  "name": "Gaji Januari 2025",
  "start_date": "2024-12-25",
  "end_date": "2025-01-24",
  "salary_amount": 5000000
}

### 12. Buat salary period tanpa nominal
POST {{BASE_URL}}/api/salary-periods
Content-Type: application/json

{
  "name": "Gaji Februari 2025",
  "start_date": "2025-01-25",
  "end_date": "2025-02-24"
}

### 12. Get semua salary period
GET {{BASE_URL}}/api/salary-periods

### 13. Get salary period by ID
GET {{BASE_URL}}/api/salary-periods/1

### 14. Update salary period
PUT {{BASE_URL}}/api/salary-periods/1
Content-Type: application/json

{
  "salary_amount": 5500000
}

### 15. Hapus salary period
DELETE {{BASE_URL}}/api/salary-periods/2

### 16. Error: end_date sebelum start_date
POST {{BASE_URL}}/api/salary-periods
Content-Type: application/json

{
  "name": "Invalid Period",
  "start_date": "2025-02-01",
  "end_date": "2025-01-01"
}


###########################################################
# 💰 TRANSACTIONS
###########################################################

### 17. Buat transaksi income (pastikan category_id=11 ada — Gaji)
POST {{BASE_URL}}/api/transactions
Content-Type: application/json

{
  "transaction_date": "2025-01-15",
  "transaction_type": "income",
  "amount": 5000000,
  "category_id": 11,
  "description": "Gaji bulan Januari 2025"
}

### 18. Buat transaksi expense
POST {{BASE_URL}}/api/transactions
Content-Type: application/json

{
  "transaction_date": "2025-01-16",
  "transaction_type": "expense",
  "amount": 75000,
  "category_id": 1,
  "description": "Makan siang di Warteg Barokah"
}

### 19. Buat transaksi tanpa kategori dan deskripsi
POST {{BASE_URL}}/api/transactions
Content-Type: application/json

{
  "transaction_date": "2025-01-17",
  "transaction_type": "expense",
  "amount": 50000
}

### 20. Buat beberapa transaksi untuk test chart
POST {{BASE_URL}}/api/transactions
Content-Type: application/json

{
  "transaction_date": "2025-01-18",
  "transaction_type": "expense",
  "amount": 150000,
  "category_id": 2,
  "description": "Grab ke kantor"
}

### 21. Get semua transaksi (tanpa filter)
GET {{BASE_URL}}/api/transactions

### 22. Get transaksi — filter minggu ini
GET {{BASE_URL}}/api/transactions?filter=week

### 23. Get transaksi — filter bulan ini
GET {{BASE_URL}}/api/transactions?filter=month

### 24. Get transaksi — filter tahun ini
GET {{BASE_URL}}/api/transactions?filter=year

### 25. Get transaksi — filter custom range
GET {{BASE_URL}}/api/transactions?filter=custom&start_date=2025-01-01&end_date=2025-01-31

### 26. Get transaksi — filter by salary period
GET {{BASE_URL}}/api/transactions?salary_period_id=1

### 27. Get transaksi — filter by kategori
GET {{BASE_URL}}/api/transactions?filter=month&category_id=1

### 28. Get transaksi — hanya expense
GET {{BASE_URL}}/api/transactions?filter=month&transaction_type=expense

### 29. Get transaksi — kombinasi filter
GET {{BASE_URL}}/api/transactions?filter=month&transaction_type=expense&category_id=1

### 30. Get transaksi — dengan pagination
GET {{BASE_URL}}/api/transactions?filter=month&page=1&limit=5

### 31. Get transaksi detail by ID
GET {{BASE_URL}}/api/transactions/1

### 32. Update transaksi
PUT {{BASE_URL}}/api/transactions/2
Content-Type: application/json

{
  "amount": 80000,
  "description": "Makan siang + minuman es teh"
}

### 33. Hapus transaksi
DELETE {{BASE_URL}}/api/transactions/3

### 34. Error: nominal negatif
POST {{BASE_URL}}/api/transactions
Content-Type: application/json

{
  "transaction_date": "2025-01-20",
  "transaction_type": "expense",
  "amount": -50000
}

### 35. Error: format tanggal salah
POST {{BASE_URL}}/api/transactions
Content-Type: application/json

{
  "transaction_date": "20/01/2025",
  "transaction_type": "expense",
  "amount": 50000
}

### 36. Error: transaksi tidak ditemukan
GET {{BASE_URL}}/api/transactions/99999


###########################################################
# 📊 SUMMARY & ANALYTICS
###########################################################

### 37. Summary bulan ini
GET {{BASE_URL}}/api/summary?filter=month

### 38. Summary minggu ini
GET {{BASE_URL}}/api/summary?filter=week

### 39. Summary tahun ini
GET {{BASE_URL}}/api/summary?filter=year

### 40. Summary custom range
GET {{BASE_URL}}/api/summary?filter=custom&start_date=2025-01-01&end_date=2025-01-31

### 41. Summary by salary period
GET {{BASE_URL}}/api/summary?salary_period_id=1

### 42. Summary hanya income
GET {{BASE_URL}}/api/summary?filter=month&transaction_type=income

### 43. Summary hanya expense
GET {{BASE_URL}}/api/summary?filter=month&transaction_type=expense

### 44. Summary semua (tanpa filter)
GET {{BASE_URL}}/api/summary

### 45. Summary per kategori — bulan ini
GET {{BASE_URL}}/api/summary/by-category?filter=month

### 46. Summary per kategori — hanya expense
GET {{BASE_URL}}/api/summary/by-category?filter=month&transaction_type=expense

### 47. Summary per kategori — custom range
GET {{BASE_URL}}/api/summary/by-category?filter=custom&start_date=2025-01-01&end_date=2025-01-31

### 48. Chart data — bulan ini (default)
GET {{BASE_URL}}/api/summary/chart

### 49. Chart data — minggu ini
GET {{BASE_URL}}/api/summary/chart?filter=week

### 50. Chart data — custom range
GET {{BASE_URL}}/api/summary/chart?filter=custom&start_date=2025-01-01&end_date=2025-01-31

### 51. Chart data — by salary period
GET {{BASE_URL}}/api/summary/chart?salary_period_id=1


###########################################################
# 💾 BACKUP
###########################################################

### 52. Backup ke Google Sheets
POST {{BASE_URL}}/api/backup/spreadsheet

###########################################################
# 🚫 ERROR CASES TAMBAHAN
###########################################################

### 53. Endpoint tidak ditemukan
GET {{BASE_URL}}/api/tidak-ada

### 54. filter=custom tanpa tanggal
GET {{BASE_URL}}/api/transactions?filter=custom
```

### Contoh Response yang Diharapkan

**Response sukses GET /api/summary?filter=month:**
```json
{
  "data": {
    "total_income": 5000000,
    "total_expense": 275000,
    "balance": 4725000,
    "transaction_count": 3
  },
  "period": {
    "filter": "month",
    "start_date": "2025-01-01",
    "end_date": "2025-01-31"
  }
}
```

**Response error validasi (400):**
```json
{
  "error": "Data transaksi tidak valid",
  "details": {
    "amount": ["Nominal harus lebih dari 0"],
    "transaction_date": ["Format tanggal harus YYYY-MM-DD"]
  }
}
```

**Response 404:**
```json
{
  "error": "Transaksi tidak ditemukan"
}
```

---

## Penutup — Ringkasan Struktur Proyek Final

Setelah semua langkah selesai, struktur folder proyek terlihat seperti ini:

```
pixel-pocket-api/
├── api/
│   └── index.ts                  ← Vercel entry point
├── src/
│   ├── db/
│   │   ├── index.ts              ← Koneksi Neon + instance Drizzle
│   │   └── schema.ts             ← Definisi 3 tabel
│   ├── routes/
│   │   ├── transactions.ts       ← CRUD + filtering transaksi
│   │   ├── categories.ts         ← CRUD + seed kategori default
│   │   ├── salary-periods.ts     ← CRUD salary period
│   │   ├── summary.ts            ← Analytics
│   │   └── backup.ts             ← Google Sheets export
│   ├── validators/
│   │   ├── transaction.ts        ← Zod schema transaksi
│   │   ├── category.ts           ← Zod schema kategori
│   │   ├── salary-period.ts      ← Zod schema salary period
│   │   └── query-filters.ts      ← Zod schema query params
│   ├── lib/
│   │   ├── date-filters.ts       ← Helper kalkulasi rentang tanggal
│   │   └── google-sheets.ts      ← Helper Google Sheets
│   ├── server.ts                 ← Server Bun untuk dev lokal
│   └── index.ts                  ← Hono app + middleware + routing
├── drizzle/
│   └── migrations/               ← File SQL migration
├── .env                          ← (tidak di-commit)
├── .env.example
├── .gitignore
├── drizzle.config.ts
├── package.json
├── pixel-pocket-api.http         ← Test file REST Client
├── tsconfig.json
└── vercel.json
```

### Gotcha Summary — Hal yang Paling Sering Salah

| Masalah | Penyebab | Solusi |
|---|---|---|
| `amount` di response berupa string | Drizzle return `numeric` sebagai string | Selalu `parseFloat(row.amount)` saat baca |
| INSERT amount error | Drizzle numeric butuh string input | Selalu `String(body.amount)` saat tulis |
| Endpoint `/seed` tertangkap `/:id` | Urutan route salah | Definisikan `/seed` sebelum `/:id` |
| Google Sheets auth gagal | Format private key salah | Pastikan `\\n` di env → `replace(/\\n/g, '\n')` |
| `filter=custom` tanpa tanggal error | Refine Zod tidak triggered | Cek request — kedua parameter wajib ada |
| `date` column di Drizzle jadi Date object | Driver berbeda mengembalikan tipe berbeda | Gunakan `neon-http`, hasilnya string YYYY-MM-DD |

### Langkah Selanjutnya (Phase 2)

Ketika siap menambahkan autentikasi dan multi-user di Phase 2, struktur yang sudah dibangun di sini memudahkan:

1. **Auth middleware** — tambahkan di `src/index.ts` sebelum route, semua endpoint otomatis terlindungi
2. **User ID** — tambahkan kolom `user_id` di ketiga tabel dan filter semua query berdasarkan user yang login
3. **Refresh token** — Neon dan Drizzle siap, hanya perlu tabel baru untuk session management
