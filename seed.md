# Seed Reference — Pixel Pocket API

Jalankan kedua endpoint berikut setelah database siap (`bun run db:push`).

---

## 1. Categories Seed

```
POST /api/categories/seed
```

Idempotent — aman dijalankan berulang, duplikat dilewati otomatis.

### Expense (13)

| Nama | Color |
|------|-------|
| Groceries | `#7D9B76` |
| Beverage | `#5F8A8B` |
| Coffee | `#8B6355` |
| Cigarettes | `#8C7B6B` |
| Daily Needs | `#C4A882` |
| E-commerce | `#6B7C8D` |
| Entertainment | `#9B6B8C` |
| Housing | `#B5847A` |
| Meal | `#CC7358` |
| Selfcare | `#A0856C` |
| Subscription | `#7B6D8D` |
| Transport | `#4A7C8C` |
| Other | `#8C8C7B` |

### Income (5)

| Nama | Color |
|------|-------|
| Salary | `#6B8C5F` |
| Freelance | `#5B7A8C` |
| Investment | `#8C7A3D` |
| Bonus | `#8C5B3D` |
| Other Income | `#7A8C6B` |

---

## 2. Salary Periods Seed

```
POST /api/salary-periods/seed
```

Generate ~36 period secara otomatis. Idempotent — period yang sudah ada dilewati.

**Pola:** gajian tiap tanggal **27**, periode berakhir tanggal **26** bulan berikutnya.

| Period | Start | End |
|--------|-------|-----|
| Januari 2025 | 2025-01-27 | 2025-02-26 |
| Februari 2025 | 2025-02-27 | 2025-03-26 |
| ... | ... | ... |
| Desember 2027 | 2027-12-27 | 2028-01-26 |

---

## Urutan Seed

```bash
# 1. Seed categories dulu
POST /api/categories/seed

# 2. Baru seed salary periods
POST /api/salary-periods/seed
```
