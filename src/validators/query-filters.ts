import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const transactionQuerySchema = z
  .object({
    // filter waktu: week | month | year | custom
    filter: z.enum(["week", "month", "year", "custom"]).optional(),

    // Alternatif filter: gunakan rentang tanggal dari salary period
    // z.coerce.number() otomatis mengkonversi string '1' ke number 1
    salary_period_id: z.coerce.number().int().positive().optional(),

    // Wajib jika filter=custom
    start_date: z
      .string()
      .regex(dateRegex, "Format tanggal harus YYYY-MM-DD")
      .optional(),
    end_date: z
      .string()
      .regex(dateRegex, "Format tanggal harus YYYY-MM-DD")
      .optional(),

    category_id: z.coerce.number().int().positive().optional(),
    transaction_type: z.enum(["income", "expense"]).optional(),

    // Pagination dengan nilai default
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) => {
      if (data.filter === "custom") {
        return Boolean(data.start_date && data.end_date);
      }
      return true;
    },
    {
      message: "start_date dan end_date wajib diisi jika filter=custom",
      path: ["start_date"],
    },
  );

// Schema untuk summary endpoints — sama tapi tanpa page, limit, category_id
export const summaryQuerySchema = z
  .object({
    filter: z.enum(["week", "month", "year", "custom"]).optional(),
    salary_period_id: z.coerce.number().int().positive().optional(),
    start_date: z
      .string()
      .regex(dateRegex, "Format tanggal harus YYYY-MM-DD")
      .optional(),
    end_date: z
      .string()
      .regex(dateRegex, "Format tanggal harus YYYY-MM-DD")
      .optional(),
    transaction_type: z.enum(["income", "expense"]).optional(),
  })
  .refine(
    (data) => {
      if (data.filter === "custom") {
        return Boolean(data.start_date && data.end_date);
      }
      return true;
    },
    {
      message: "start_date dan end_date wajib diisi jika filter=custom",
      path: ["start_date"],
    },
  );

export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
