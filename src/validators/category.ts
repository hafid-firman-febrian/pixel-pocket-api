import { z } from "zod";

export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, "Nama kategori tidak boleh kosong")
    .max(100, "Nama kategori maksimal 100 karakter"),
  color: z
    .string()
    .regex(
      /^#[0-9A-Fa-f]{6}$/,
      "Warna harus dalam format hex (#RRGGBB), contoh: #FF6B6B",
    )
    .optional()
    .nullable(),
  type: z.enum(["income", "expense", "both"], {
    error: "Tipe harus income, expense, atau both",
  }),
});

export const updateCategorySchema = createCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
