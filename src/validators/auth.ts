// src/validators/auth.ts
import { z } from "zod";

export const googleAuthSchema = z.object({
  idToken: z.string().min(1, { error: "idToken wajib diisi" }),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, { error: "refreshToken wajib diisi" }),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, { error: "refreshToken wajib diisi" }),
});
