import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

// neon() membuat HTTP client yang mengirim query ke Neon via HTTPS
// Ini beda dengan koneksi PostgreSQL biasa yang pakai TCP
const sql = neon(process.env.DATABASE_URL!);

// drizzle() membungkus client tersebut dengan query builder type-safe
// schema diberikan agar Drizzle tahu relasi antar tabel untuk query dengan relasi
export const db = drizzle(sql, { schema });
