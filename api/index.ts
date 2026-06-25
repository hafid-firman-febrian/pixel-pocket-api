import { handle } from "hono/vercel";
import app from "../src/index.js";

// Menggunakan Node.js runtime karena package 'googleapis' membutuhkan Node.js API
// (tidak kompatibel dengan Edge Runtime yang hanya memiliki Web Standard API)
// Jika fitur backup tidak diperlukan dan kamu ingin Edge Runtime, ganti ke 'edge'
export const runtime = "nodejs";

// Runtime Node Vercel memanggil `export default` dengan signature klasik (req, res)
// sehingga Request Web tidak tersedia. Untuk dapat Request/Response Web standar
// (yang dibutuhkan hono/vercel & mencegah POST body hang), ekspor sebagai
// named HTTP method handler.
const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
