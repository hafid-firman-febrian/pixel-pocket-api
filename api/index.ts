import { handle } from "hono/vercel";
import app from "../src/index.js";

// Menggunakan Node.js runtime karena package 'googleapis' membutuhkan Node.js API
// (tidak kompatibel dengan Edge Runtime yang hanya memiliki Web Standard API)
// Jika fitur backup tidak diperlukan dan kamu ingin Edge Runtime, ganti ke 'edge'
export const runtime = "nodejs";

export default handle(app);
