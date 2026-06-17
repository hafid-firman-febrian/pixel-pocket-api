import { z } from "zod";

export const createTransactionSchema = z.object({
  transaction_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
    .refine((d) => !isNaN(new Date(d).getTime()), "Tanggal tidak valid"),
  transaction_type: z.enum(["income", "expense"], {
    error: "Tipe transaksi harus income atau expense",
  }),
  amount: z
    .number({ error: "Nominal harus berupa angka" })
    .positive("Nominal harus lebih dari 0"),
  category_id: z.number().int().positive().optional().nullable(),
  description: z
    .string()
    .max(500, "Deskripsi maksimal 500 karakter")
    .optional()
    .nullable(),
});

// .partial() membuat semua field menjadi opsional untuk update
export const updateTransactionSchema = createTransactionSchema.partial();

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
