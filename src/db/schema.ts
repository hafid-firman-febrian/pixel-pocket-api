import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color"),
  type: text("type", { enum: ["income", "expense", "both"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    transactionDate: date("transaction_date").notNull(),
    transactionType: text("transaction_type", {
      enum: ["income", "expense"],
    }).notNull(),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Index untuk query filtering yang sering digunakan
    index("idx_transactions_date").on(table.transactionDate),
    index("idx_transactions_type").on(table.transactionType),
    index("idx_transactions_category").on(table.categoryId),
  ],
);

export const salaryPeriods = pgTable("salary_periods", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),

  // nullable — tidak semua orang tahu atau mau mencatat nominal gaji
  salaryAmount: numeric("salary_amount", { precision: 15, scale: 2 }),

  createdAt: timestamp("created_at").defaultNow(),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type SalaryPeriod = typeof salaryPeriods.$inferSelect;
export type NewSalaryPeriod = typeof salaryPeriods.$inferInsert;
