# Pixel Pocket API — Spesifikasi API

> Versi: 1.0.0  
> Base URL Dev: `http://localhost:3000`  
> Base URL Prod: `https://<project>.vercel.app`

---

## Konvensi Umum

### Format Response

Semua response menggunakan `Content-Type: application/json`.

**Success:**
```json
{ "data": { ... } }
```

**Success dengan pagination:**
```json
{
  "data": [ ... ],
  "count": 42,
  "meta": {
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

**Error:**
```json
{ "error": "Pesan error yang deskriptif" }
```

**Validation Error (400):**
```json
{
  "error": "Data tidak valid",
  "details": {
    "field_name": ["Pesan validasi"]
  }
}
```

### HTTP Status Codes

| Code | Keterangan |
|------|------------|
| `200` | OK — request berhasil |
| `201` | Created — data berhasil dibuat |
| `400` | Bad Request — validasi gagal atau parameter salah |
| `404` | Not Found — resource tidak ditemukan |
| `409` | Conflict — data duplikat |
| `500` | Internal Server Error |

### Filter Tanggal (dipakai di Transactions & Summary)

Semua endpoint yang mendukung filter tanggal menggunakan parameter berikut:

| Parameter | Tipe | Keterangan |
|-----------|------|------------|
| `filter` | `week` \| `month` \| `year` \| `custom` | Mode filter waktu |
| `salary_period_id` | `number` | Prioritas tertinggi, mengabaikan `filter` |
| `start_date` | `string` `YYYY-MM-DD` | Wajib jika `filter=custom` |
| `end_date` | `string` `YYYY-MM-DD` | Wajib jika `filter=custom` |

**Prioritas:** `salary_period_id` → `filter` → tanpa filter (ambil semua)

---

## Health Check

### `GET /`

Cek status API.

**Response `200`:**
```json
{
  "message": "Pixel Pocket API",
  "version": "1.0.0",
  "status": "ok",
  "timestamp": "2026-06-17T04:00:00.000Z"
}
```

---

## Categories

### `GET /api/categories`

Ambil semua kategori, diurutkan berdasarkan tipe lalu nama.

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Makanan & Minuman",
      "color": "#FF6B6B",
      "type": "expense",
      "createdAt": "2026-06-17T04:00:00.000Z"
    }
  ]
}
```

---

### `GET /api/categories/:id`

Ambil satu kategori berdasarkan ID.

**Path Parameter:**

| Parameter | Tipe | Keterangan |
|-----------|------|------------|
| `id` | `number` | ID kategori |

**Response `200`:**
```json
{
  "data": {
    "id": 1,
    "name": "Makanan & Minuman",
    "color": "#FF6B6B",
    "type": "expense",
    "createdAt": "2026-06-17T04:00:00.000Z"
  }
}
```

**Response `404`:**
```json
{ "error": "Kategori tidak ditemukan" }
```

---

### `POST /api/categories`

Buat kategori baru.

**Request Body:**

| Field | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `name` | `string` | ✅ | Maks 100 karakter, harus unik |
| `type` | `income` \| `expense` \| `both` | ✅ | |
| `color` | `string` | ❌ | Format hex `#RRGGBB` |

```json
{
  "name": "Cicilan Rumah",
  "color": "#FF5733",
  "type": "expense"
}
```

**Response `201`:**
```json
{
  "data": {
    "id": 16,
    "name": "Cicilan Rumah",
    "color": "#FF5733",
    "type": "expense",
    "createdAt": "2026-06-17T04:00:00.000Z"
  }
}
```

**Response `409`:**
```json
{ "error": "Kategori dengan nama tersebut sudah ada" }
```

---

### `PUT /api/categories/:id`

Update kategori. Semua field opsional — hanya field yang dikirim yang diupdate.

**Request Body (semua opsional):**
```json
{
  "name": "Cicilan KPR",
  "color": "#27AE60"
}
```

**Response `200`:**
```json
{
  "data": {
    "id": 16,
    "name": "Cicilan KPR",
    "color": "#27AE60",
    "type": "expense",
    "createdAt": "2026-06-17T04:00:00.000Z"
  }
}
```

---

### `DELETE /api/categories/:id`

Hapus kategori. Transaksi yang terkait tidak ikut terhapus — `category_id` di transaksi tersebut menjadi `null`.

**Response `200`:**
```json
{
  "data": {
    "message": "Kategori berhasil dihapus",
    "id": 16
  }
}
```

---

### `POST /api/categories/seed`

Insert 15 kategori default (idempotent — aman dijalankan berkali-kali).

**Kategori yang di-seed:**

| Nama | Icon | Tipe |
|------|------|------|
| Makanan & Minuman | 🍔 | expense |
| Transportasi | 🚗 | expense |
| Belanja | 🛍️ | expense |
| Tagihan & Utilitas | 💡 | expense |
| Hiburan | 🎮 | expense |
| Kesehatan | 💊 | expense |
| Pendidikan | 📚 | expense |
| Perawatan Diri | 💇 | expense |
| Sosial | 🤝 | expense |
| Lainnya | 📦 | expense |
| Gaji | 💼 | income |
| Freelance | 💻 | income |
| Investasi | 📈 | income |
| Bonus | 🎁 | income |
| Lainnya Pemasukan | 💰 | income |

**Response `201`:**
```json
{
  "data": {
    "message": "Seeding selesai. 15 kategori baru ditambahkan.",
    "inserted": 15,
    "skipped": 0,
    "total_defaults": 15
  }
}
```

---

## Salary Periods

### `GET /api/salary-periods`

Ambil semua salary period, diurutkan dari yang terbaru.

**Response `200`:**
```json
{
  "data": [
    {
      "id": 3,
      "name": "Juni 2026",
      "startDate": "2026-05-27",
      "endDate": "2026-06-26",
      "salaryAmount": 8000000,
      "createdAt": "2026-06-17T04:00:00.000Z"
    }
  ]
}
```

---

### `GET /api/salary-periods/:id`

Ambil satu salary period berdasarkan ID.

**Response `200`:**
```json
{
  "data": {
    "id": 3,
    "name": "Juni 2026",
    "startDate": "2026-05-27",
    "endDate": "2026-06-26",
    "salaryAmount": 8000000,
    "createdAt": "2026-06-17T04:00:00.000Z"
  }
}
```

**Response `404`:**
```json
{ "error": "Salary period tidak ditemukan" }
```

---

### `POST /api/salary-periods`

Buat salary period baru secara manual.

**Request Body:**

| Field | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `name` | `string` | ✅ | Maks 100 karakter |
| `start_date` | `string` `YYYY-MM-DD` | ✅ | |
| `end_date` | `string` `YYYY-MM-DD` | ✅ | Harus setelah `start_date` |
| `salary_amount` | `number` | ❌ | Nominal gaji, harus > 0 |

```json
{
  "name": "Juni 2026",
  "start_date": "2026-05-27",
  "end_date": "2026-06-26",
  "salary_amount": 8000000
}
```

**Response `201`:**
```json
{
  "data": {
    "id": 3,
    "name": "Juni 2026",
    "startDate": "2026-05-27",
    "endDate": "2026-06-26",
    "salaryAmount": 8000000,
    "createdAt": "2026-06-17T04:00:00.000Z"
  }
}
```

**Response `400` (end_date sebelum start_date):**
```json
{
  "error": "Data salary period tidak valid",
  "details": {
    "end_date": ["Tanggal akhir harus setelah tanggal mulai"]
  }
}
```

---

### `PUT /api/salary-periods/:id`

Update salary period. Semua field opsional.

**Request Body (semua opsional):**
```json
{
  "salary_amount": 9000000
}
```

**Response `200`:**
```json
{
  "data": {
    "id": 3,
    "name": "Juni 2026",
    "startDate": "2026-05-27",
    "endDate": "2026-06-26",
    "salaryAmount": 9000000,
    "createdAt": "2026-06-17T04:00:00.000Z"
  }
}
```

---

### `DELETE /api/salary-periods/:id`

Hapus salary period.

**Response `200`:**
```json
{
  "data": {
    "message": "Salary period berhasil dihapus",
    "id": 3
  }
}
```

---

### `POST /api/salary-periods/seed`

Generate salary period otomatis berdasarkan tanggal gaji **setiap tanggal 27**. Menghasilkan ~36 period: dari Januari tahun lalu hingga Desember tahun depan. Idempotent — period yang sudah ada dilewati.

**Pola yang di-generate:**

| Period | Start | End |
|--------|-------|-----|
| Januari 2025 | 2025-01-27 | 2025-02-26 |
| Februari 2025 | 2025-02-27 | 2025-03-26 |
| ... | ... | ... |
| Juni 2026 | 2026-06-27 | 2026-07-26 |

**Response `201`:**
```json
{
  "message": "Berhasil menambahkan 36 salary period",
  "inserted": 36,
  "skipped": 0,
  "data": [
    {
      "id": 1,
      "name": "Januari 2025",
      "startDate": "2025-01-27",
      "endDate": "2025-02-26",
      "salaryAmount": null,
      "createdAt": "2026-06-17T04:00:00.000Z"
    }
  ]
}
```

**Response `200` (sudah di-seed sebelumnya):**
```json
{
  "message": "Semua salary period sudah ada, tidak ada yang ditambahkan",
  "inserted": 0,
  "skipped": 36
}
```

---

## Transactions

### `GET /api/transactions`

Ambil daftar transaksi dengan filter dan pagination. Response menyertakan data kategori (JOIN).

**Query Parameters:**

| Parameter | Tipe | Default | Keterangan |
|-----------|------|---------|------------|
| `filter` | `week` \| `month` \| `year` \| `custom` | — | Filter waktu |
| `salary_period_id` | `number` | — | Filter by salary period (prioritas utama) |
| `start_date` | `string` | — | Wajib jika `filter=custom` |
| `end_date` | `string` | — | Wajib jika `filter=custom` |
| `transaction_type` | `income` \| `expense` | — | Filter by tipe |
| `category_id` | `number` | — | Filter by kategori |
| `page` | `number` | `1` | Halaman pagination |
| `limit` | `number` | `20` | Jumlah per halaman (maks 100) |

**Contoh Request:**
```
GET /api/transactions?filter=month&transaction_type=expense&page=1&limit=10
GET /api/transactions?salary_period_id=3
GET /api/transactions?filter=custom&start_date=2026-06-01&end_date=2026-06-17
```

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "transactionDate": "2026-06-15",
      "transactionType": "expense",
      "amount": 75000,
      "categoryId": 1,
      "description": "Makan siang",
      "createdAt": "2026-06-15T07:00:00.000Z",
      "updatedAt": "2026-06-15T07:00:00.000Z",
      "categoryName": "Makanan & Minuman",
      "categoryIcon": "🍔",
      "categoryColor": "#FF6B6B"
    }
  ],
  "count": 42,
  "meta": {
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

### `GET /api/transactions/:id`

Ambil detail satu transaksi.

**Response `200`:**
```json
{
  "data": {
    "id": 1,
    "transactionDate": "2026-06-15",
    "transactionType": "expense",
    "amount": 75000,
    "categoryId": 1,
    "description": "Makan siang",
    "createdAt": "2026-06-15T07:00:00.000Z",
    "updatedAt": "2026-06-15T07:00:00.000Z",
    "categoryName": "Makanan & Minuman",
    "categoryIcon": "🍔",
    "categoryColor": "#FF6B6B"
  }
}
```

**Response `404`:**
```json
{ "error": "Transaksi tidak ditemukan" }
```

---

### `POST /api/transactions`

Buat transaksi baru.

**Request Body:**

| Field | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `transaction_date` | `string` `YYYY-MM-DD` | ✅ | |
| `transaction_type` | `income` \| `expense` | ✅ | |
| `amount` | `number` | ✅ | Harus > 0 |
| `category_id` | `number` | ❌ | Harus ada di tabel categories |
| `description` | `string` | ❌ | Maks 500 karakter |

```json
{
  "transaction_date": "2026-06-17",
  "transaction_type": "income",
  "amount": 8000000,
  "category_id": 11,
  "description": "Gaji Juni 2026"
}
```

**Response `201`:**
```json
{
  "data": {
    "id": 5,
    "transactionDate": "2026-06-17",
    "transactionType": "income",
    "amount": 8000000,
    "categoryId": 11,
    "description": "Gaji Juni 2026",
    "createdAt": "2026-06-17T04:00:00.000Z",
    "updatedAt": "2026-06-17T04:00:00.000Z"
  }
}
```

**Response `404` (category_id tidak ada):**
```json
{ "error": "Kategori tidak ditemukan" }
```

---

### `PUT /api/transactions/:id`

Update transaksi. Semua field opsional — hanya field yang dikirim yang diupdate.

**Request Body (semua opsional):**
```json
{
  "amount": 80000,
  "description": "Makan siang + minuman"
}
```

**Response `200`:**
```json
{
  "data": {
    "id": 1,
    "transactionDate": "2026-06-15",
    "transactionType": "expense",
    "amount": 80000,
    "categoryId": 1,
    "description": "Makan siang + minuman",
    "createdAt": "2026-06-15T07:00:00.000Z",
    "updatedAt": "2026-06-17T04:00:00.000Z"
  }
}
```

---

### `DELETE /api/transactions/:id`

Hapus transaksi.

**Response `200`:**
```json
{
  "data": {
    "message": "Transaksi berhasil dihapus",
    "id": 1
  }
}
```

---

## Summary & Analytics

### `GET /api/summary`

Total income, expense, dan balance. Mendukung semua filter tanggal.

**Query Parameters:** Lihat [Filter Tanggal](#filter-tanggal-dipakai-di-transactions--summary) + `transaction_type`

**Contoh Request:**
```
GET /api/summary?filter=month
GET /api/summary?salary_period_id=3
GET /api/summary?filter=custom&start_date=2026-05-27&end_date=2026-06-26
```

**Response `200`:**
```json
{
  "data": {
    "total_income": 8000000,
    "total_expense": 3200000,
    "balance": 4800000,
    "transaction_count": 24
  },
  "period": {
    "filter": "month",
    "start_date": "2026-06-01",
    "end_date": "2026-06-17"
  }
}
```

---

### `GET /api/summary/by-category`

Breakdown pengeluaran/pemasukan per kategori, termasuk persentase.

**Query Parameters:** Lihat [Filter Tanggal](#filter-tanggal-dipakai-di-transactions--summary) + `transaction_type`

**Response `200`:**
```json
{
  "data": [
    {
      "category_id": 1,
      "category_name": "Makanan & Minuman",
      "category_color": "#FF6B6B",
      "transaction_type": "expense",
      "total": 850000,
      "percentage": 26.6,
      "count": 12
    },
    {
      "category_id": 2,
      "category_name": "Transportasi",
      "category_color": "#4ECDC4",
      "transaction_type": "expense",
      "total": 450000,
      "percentage": 14.1,
      "count": 6
    }
  ],
  "period": {
    "filter": "month",
    "start_date": "2026-06-01",
    "end_date": "2026-06-17"
  }
}
```

---

### `GET /api/summary/chart`

Data time-series harian untuk chart. Semua tanggal dalam rentang selalu ada (tanggal tanpa transaksi bernilai 0).

**Query Parameters:** Lihat [Filter Tanggal](#filter-tanggal-dipakai-di-transactions--summary). Default: bulan berjalan.

**Response `200`:**
```json
{
  "data": {
    "labels": [
      "2026-06-01",
      "2026-06-02",
      "2026-06-03"
    ],
    "income":  [0, 8000000, 0],
    "expense": [125000, 0, 75000]
  },
  "period": {
    "start_date": "2026-06-01",
    "end_date": "2026-06-17"
  }
}
```

> `labels`, `income`, dan `expense` selalu memiliki panjang array yang sama. Index ke-N pada `income` dan `expense` berkorespondensi dengan `labels[N]`.

---

## Backup

### `POST /api/backup/spreadsheet`

Export semua transaksi ke Google Sheets. Sheet `Transactions` akan di-clear terlebih dahulu sebelum data baru ditulis.

**Kolom yang diekspor:**

| Kolom | Keterangan |
|-------|------------|
| ID | ID transaksi |
| Tanggal | Format YYYY-MM-DD |
| Tipe | `Pemasukan` atau `Pengeluaran` |
| Nominal | Angka |
| Kategori | Nama kategori atau `-` jika tidak ada |
| Deskripsi | Teks atau `-` jika tidak ada |
| Dibuat Pada | ISO timestamp |

**Response `200`:**
```json
{
  "data": {
    "message": "Backup berhasil. 124 transaksi diekspor ke Google Sheets.",
    "rows_exported": 124,
    "timestamp": "2026-06-17T04:00:00.000Z"
  }
}
```

**Response `500` (konfigurasi tidak lengkap):**
```json
{
  "error": "Konfigurasi Google Sheets tidak lengkap. Periksa GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, dan GOOGLE_SPREADSHEET_ID di environment variables."
}
```

---

## Ringkasan Semua Endpoint

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| `GET` | `/` | Health check |
| `GET` | `/api/categories` | List semua kategori |
| `GET` | `/api/categories/:id` | Detail kategori |
| `POST` | `/api/categories` | Buat kategori baru |
| `POST` | `/api/categories/seed` | Seed 15 kategori default |
| `PUT` | `/api/categories/:id` | Update kategori |
| `DELETE` | `/api/categories/:id` | Hapus kategori |
| `GET` | `/api/salary-periods` | List semua salary period |
| `GET` | `/api/salary-periods/:id` | Detail salary period |
| `POST` | `/api/salary-periods` | Buat salary period manual |
| `POST` | `/api/salary-periods/seed` | Generate salary period otomatis (gajian tgl 27) |
| `PUT` | `/api/salary-periods/:id` | Update salary period |
| `DELETE` | `/api/salary-periods/:id` | Hapus salary period |
| `GET` | `/api/transactions` | List transaksi (filter + pagination) |
| `GET` | `/api/transactions/:id` | Detail transaksi |
| `POST` | `/api/transactions` | Buat transaksi baru |
| `PUT` | `/api/transactions/:id` | Update transaksi |
| `DELETE` | `/api/transactions/:id` | Hapus transaksi |
| `GET` | `/api/summary` | Total income/expense/balance |
| `GET` | `/api/summary/by-category` | Breakdown per kategori |
| `GET` | `/api/summary/chart` | Data time-series harian |
| `POST` | `/api/backup/spreadsheet` | Export ke Google Sheets |
