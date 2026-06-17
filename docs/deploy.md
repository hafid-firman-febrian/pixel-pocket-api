# Catatan Deploy — Pixel Pocket API (Vercel)

Ringkas. Stack: Hono + Neon + Drizzle, runtime **Node.js** di Vercel (karena `googleapis`).
Entry point: [api/index.ts](../api/index.ts); routing diatur [vercel.json](../vercel.json).

---

## 1. Checklist sebelum deploy

- [ ] `git push` — pastikan semua commit naik ke `origin/main`
- [ ] Semua env di Vercel sudah diisi (lihat tabel di bawah)
- [ ] OAuth Web client: domain production ditambahkan ke Authorized origins/redirect
- [ ] Email di consent screen masih Test user (atau app sudah Publish)
- [ ] Build hijau lokal: `bunx tsc --noEmit && bun test`

---

## 2. Daftar Environment Variables (Vercel → Settings → Environment Variables)

Set untuk environment **Production** (dan Preview bila perlu). **Tanpa env auth, semua `/api/*` balas 500.**

| Variabel | Wajib | Untuk | Sumber nilai |
|---|---|---|---|
| `DATABASE_URL` | ✅ | Database | Connection string Neon (`postgresql://...neon.tech/neondb?sslmode=require`) |
| `GOOGLE_OAUTH_CLIENT_IDS` | ✅ | Auth | **Web** OAuth Client ID (`...apps.googleusercontent.com`). Pisah koma bila >1. |
| `ALLOWED_GOOGLE_EMAILS` | ✅ | Auth | Email yang diizinkan akses. Pisah koma. |
| `ALLOWED_ORIGINS` | ⬜ | CORS | Origin frontend (pisah koma). Kosong = izinkan semua. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ⬜¹ | Backup Sheets | Field `client_email` dari JSON service account |
| `GOOGLE_PRIVATE_KEY` | ⬜¹ | Backup Sheets | Field `private_key` dari JSON service account (lihat catatan) |
| `GOOGLE_SPREADSHEET_ID` | ⬜¹ | Backup Sheets | ID dari URL spreadsheet (antara `/d/` dan `/edit`) |

¹ Wajib hanya jika fitur backup (`POST /api/backup/spreadsheet`) dipakai. Tanpa ini, endpoint backup error tapi endpoint lain tetap jalan.

> `PORT` **tidak perlu** di Vercel (hanya untuk dev lokal).

### Catatan `GOOGLE_PRIVATE_KEY` di Vercel (gotcha)
- Tempel nilai key **tanpa tanda kutip pembungkus** dan **tanpa koma di akhir**.
- Newline boleh asli (Vercel mendukung multi-line) **atau** bentuk `\n` — kode menangani `\n` via `.replace(/\\n/g, "\n")`.
- Harus diawali `-----BEGIN PRIVATE KEY-----` dan diakhiri `-----END PRIVATE KEY-----`.

---

## 3. Deploy

**Opsi A — GitHub integration (disarankan)**
1. Push ke GitHub (`git push`).
2. [vercel.com](https://vercel.com) → New Project → import repo → Deploy.
3. Isi env (tabel di atas) → Redeploy.

**Opsi B — Vercel CLI**
```bash
bun add -g vercel   # sekali
vercel              # preview
vercel --prod       # production
# tambah env: vercel env add GOOGLE_PRIVATE_KEY   (paste, Enter, Ctrl+D)
```

---

## 4. Smoke test setelah deploy

Ganti `BASE` dengan URL Vercel-mu.
```bash
BASE=https://pixel-pocket-api-xxx.vercel.app

# 1. Health (publik) → 200
curl -i $BASE/

# 2. Terproteksi tanpa token → 401 (BUKAN 500). 500 = env auth belum keisi.
curl -i $BASE/api/categories

# 3. Dengan token Google valid → 200
curl -i $BASE/api/auth/me -H "Authorization: Bearer <id_token>"
```

Hasil benar: `/` → 200, `/api/categories` tanpa token → 401, `/api/auth/me` dengan token allowlisted → 200.

---

## 5. Setelah deploy

- Update `serverClientId` (Flutter) & `@BASE_URL` ([pixel-pocket-api.http](../pixel-pocket-api.http)) ke URL production.
- Seed data di DB production (sekali): `POST /api/categories/seed` dan `POST /api/salary-periods/seed` (perlu token; lihat [auth-setup.md](auth-setup.md)).
- Detail auth lengkap: [auth-setup.md](auth-setup.md).
