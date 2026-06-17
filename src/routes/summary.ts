import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { transactions, categories, salaryPeriods } from "../db/schema.js";
import {
  summaryQuerySchema,
  type SummaryQuery,
} from "../validators/query-filters.js";
import {
  getWeekRange,
  getMonthRange,
  getYearRange,
  generateDateRange,
  type DateRange,
} from "../lib/date-filters.js";

const router = new Hono();

// ─────────────────────────────────────────────
// Helper: Resolve date range + metadata periode
// ─────────────────────────────────────────────
async function resolveSummaryRange(query: SummaryQuery): Promise<{
  range: DateRange | null;
  periodMeta: Record<string, unknown>;
  error?: string;
}> {
  if (query.salary_period_id) {
    const [period] = await db
      .select()
      .from(salaryPeriods)
      .where(eq(salaryPeriods.id, query.salary_period_id))
      .limit(1);

    if (!period) {
      return {
        range: null,
        periodMeta: {},
        error: "Salary period tidak ditemukan",
      };
    }

    return {
      range: { startDate: period.startDate, endDate: period.endDate },
      periodMeta: {
        filter: "salary_period",
        salary_period_id: query.salary_period_id,
        start_date: period.startDate,
        end_date: period.endDate,
      },
    };
  }

  if (query.filter) {
    let range: DateRange;
    switch (query.filter) {
      case "week":
        range = getWeekRange();
        break;
      case "month":
        range = getMonthRange();
        break;
      case "year":
        range = getYearRange();
        break;
      case "custom":
        range = { startDate: query.start_date!, endDate: query.end_date! };
        break;
      default:
        range = getMonthRange();
    }
    return {
      range,
      periodMeta: {
        filter: query.filter,
        start_date: range.startDate,
        end_date: range.endDate,
      },
    };
  }

  return { range: null, periodMeta: { filter: "all" } };
}

// ─────────────────────────────────────────────
// GET / — Total income, expense, balance
// ─────────────────────────────────────────────
router.get(
  "/",
  zValidator("query", summaryQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Parameter tidak valid",
          details: z.flattenError(result.error).fieldErrors,
        },
        400,
      );
    }
  }),
  async (c) => {
    try {
      const query = c.req.valid("query");
      const { range, periodMeta, error } = await resolveSummaryRange(query);
      if (error) return c.json({ error }, 404);

      const conditions = [];
      if (range) {
        conditions.push(gte(transactions.transactionDate, range.startDate));
        conditions.push(lte(transactions.transactionDate, range.endDate));
      }
      if (query.transaction_type) {
        conditions.push(
          eq(transactions.transactionType, query.transaction_type),
        );
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Query agregasi dengan GROUP BY transaction_type
      // sql`coalesce(sum(...), 0)` mengembalikan 0 jika tidak ada transaksi
      const results = await db
        .select({
          transactionType: transactions.transactionType,
          total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(transactions)
        .where(whereClause)
        .groupBy(transactions.transactionType);

      let totalIncome = 0;
      let totalExpense = 0;
      let transactionCount = 0;

      results.forEach((row) => {
        const amount = parseFloat(row.total);
        if (row.transactionType === "income") {
          totalIncome = amount;
        } else {
          totalExpense = amount;
        }
        transactionCount += row.count;
      });

      return c.json({
        data: {
          total_income: totalIncome,
          total_expense: totalExpense,
          balance: totalIncome - totalExpense,
          transaction_count: transactionCount,
        },
        period: periodMeta,
      });
    } catch (error) {
      console.error("[GET /summary]", error);
      return c.json({ error: "Gagal mengambil ringkasan" }, 500);
    }
  },
);

// ─────────────────────────────────────────────
// GET /by-category — Breakdown per kategori
// ─────────────────────────────────────────────
router.get(
  "/by-category",
  zValidator("query", summaryQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Parameter tidak valid",
          details: z.flattenError(result.error).fieldErrors,
        },
        400,
      );
    }
  }),
  async (c) => {
    try {
      const query = c.req.valid("query");
      const { range, periodMeta, error } = await resolveSummaryRange(query);
      if (error) return c.json({ error }, 404);

      const conditions = [];
      if (range) {
        conditions.push(gte(transactions.transactionDate, range.startDate));
        conditions.push(lte(transactions.transactionDate, range.endDate));
      }
      if (query.transaction_type) {
        conditions.push(
          eq(transactions.transactionType, query.transaction_type),
        );
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // GROUP BY multi-kolom: kategori + tipe transaksi
      // Ini menghasilkan satu baris per kombinasi kategori-tipe
      const results = await db
        .select({
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          categoryColor: categories.color,
          transactionType: transactions.transactionType,
          total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(whereClause)
        .groupBy(
          transactions.categoryId,
          categories.name,
          categories.color,
          transactions.transactionType,
        )
        .orderBy(desc(sql`sum(${transactions.amount})`));

      // Hitung total per tipe untuk menghitung persentase
      const incomeTotals = results
        .filter((r) => r.transactionType === "income")
        .reduce((sum, r) => sum + parseFloat(r.total), 0);
      const expenseTotals = results
        .filter((r) => r.transactionType === "expense")
        .reduce((sum, r) => sum + parseFloat(r.total), 0);

      const data = results.map((row) => {
        const total = parseFloat(row.total);
        const typeTotal =
          row.transactionType === "income" ? incomeTotals : expenseTotals;
        const percentage = typeTotal > 0 ? (total / typeTotal) * 100 : 0;

        return {
          category_id: row.categoryId,
          category_name: row.categoryName,
          category_color: row.categoryColor,
          transaction_type: row.transactionType,
          total,
          percentage: Math.round(percentage * 10) / 10, // 1 desimal
          count: row.count,
        };
      });

      return c.json({ data, period: periodMeta });
    } catch (error) {
      console.error("[GET /summary/by-category]", error);
      return c.json({ error: "Gagal mengambil ringkasan per kategori" }, 500);
    }
  },
);

// ─────────────────────────────────────────────
// GET /chart — Data time-series harian untuk chart
// ─────────────────────────────────────────────
router.get(
  "/chart",
  zValidator("query", summaryQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Parameter tidak valid",
          details: z.flattenError(result.error).fieldErrors,
        },
        400,
      );
    }
  }),
  async (c) => {
    try {
      const query = c.req.valid("query");

      // Chart selalu butuh date range — default ke bulan berjalan
      let range: DateRange;
      let periodMeta: Record<string, unknown>;

      if (query.salary_period_id) {
        const [period] = await db
          .select()
          .from(salaryPeriods)
          .where(eq(salaryPeriods.id, query.salary_period_id))
          .limit(1);

        if (!period)
          return c.json({ error: "Salary period tidak ditemukan" }, 404);

        range = { startDate: period.startDate, endDate: period.endDate };
        periodMeta = { start_date: period.startDate, end_date: period.endDate };
      } else if (query.filter === "custom") {
        range = { startDate: query.start_date!, endDate: query.end_date! };
        periodMeta = { start_date: query.start_date, end_date: query.end_date };
      } else if (query.filter === "week") {
        range = getWeekRange();
        periodMeta = { start_date: range.startDate, end_date: range.endDate };
      } else if (query.filter === "year") {
        range = getYearRange();
        periodMeta = { start_date: range.startDate, end_date: range.endDate };
      } else {
        range = getMonthRange();
        periodMeta = { start_date: range.startDate, end_date: range.endDate };
      }

      // Query: total per hari per tipe transaksi
      const rawData = await db
        .select({
          date: transactions.transactionDate,
          transactionType: transactions.transactionType,
          total: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.transactionDate, range.startDate),
            lte(transactions.transactionDate, range.endDate),
          ),
        )
        .groupBy(transactions.transactionDate, transactions.transactionType)
        .orderBy(asc(transactions.transactionDate));

      // Generate semua label tanggal dalam rentang (termasuk hari tanpa transaksi)
      const labels = generateDateRange(range.startDate, range.endDate);

      // Buat Map untuk lookup O(1) saat mengisi array
      const incomeMap = new Map<string, number>();
      const expenseMap = new Map<string, number>();

      rawData.forEach((row) => {
        // Drizzle date type → string 'YYYY-MM-DD'
        const date = row.date as string;
        const amount = parseFloat(row.total);

        if (row.transactionType === "income") {
          incomeMap.set(date, (incomeMap.get(date) ?? 0) + amount);
        } else {
          expenseMap.set(date, (expenseMap.get(date) ?? 0) + amount);
        }
      });

      // Map setiap label ke nilai income/expense (0 jika tidak ada transaksi)
      return c.json({
        data: {
          labels,
          income: labels.map((d) => incomeMap.get(d) ?? 0),
          expense: labels.map((d) => expenseMap.get(d) ?? 0),
        },
        period: periodMeta,
      });
    } catch (error) {
      console.error("[GET /summary/chart]", error);
      return c.json({ error: "Gagal mengambil data chart" }, 500);
    }
  },
);

export default router;
