import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createSalaryPeriodSchema = z
  .object({
    name: z
      .string()
      .min(1, "Nama periode tidak boleh kosong")
      .max(100, "Nama periode maksimal 100 karakter"),
    start_date: z
      .string()
      .regex(dateRegex, "Format tanggal mulai harus YYYY-MM-DD"),
    end_date: z
      .string()
      .regex(dateRegex, "Format tanggal akhir harus YYYY-MM-DD"),
    salary_amount: z
      .number()
      .positive("Nominal gaji harus lebih dari 0")
      .optional()
      .nullable(),
  })
  // .refine() menerima fungsi validator yang melihat seluruh objek
  // Berguna untuk validasi yang melibatkan lebih dari satu field
  .refine((data) => data.end_date > data.start_date, {
    message: "Tanggal akhir harus setelah tanggal mulai",
    path: ["end_date"],
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
      message: "Tanggal akhir harus setelah tanggal mulai",
      path: ["end_date"],
    },
  );

export type CreateSalaryPeriodInput = z.infer<typeof createSalaryPeriodSchema>;
export type UpdateSalaryPeriodInput = z.infer<typeof updateSalaryPeriodSchema>;
