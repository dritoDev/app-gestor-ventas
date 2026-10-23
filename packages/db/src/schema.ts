import { pgTable, uuid, varchar, text, integer, timestamp, pgEnum, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const roleEnum = pgEnum('user_role', ['admin', 'operator']);
export const saleStatusEnum = pgEnum('sale_status', ['completed', 'cancelled']);
export const movementReasonEnum = pgEnum('movement_reason', ['initial', 'adjustment', 'sale', 'cancellation']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 200 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('operator'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 160 }).notNull(),
  sku: varchar('sku', { length: 60 }).notNull(),
  category: varchar('category', { length: 80 }).notNull(),
  description: text('description').notNull().default(''),
  priceCents: integer('price_cents').notNull(),
  stock: integer('stock').notNull().default(0),
  minStock: integer('min_stock').notNull().default(5),
  active: integer('active').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('products_sku_unique').on(table.sku), index('products_name_idx').on(table.name), check('products_stock_positive', sql`${table.stock} >= 0`), check('products_price_positive', sql`${table.priceCents} >= 0`), check('products_min_stock_positive', sql`${table.minStock} >= 0`), check('products_active_boolean', sql`${table.active} in (0, 1)`)]);
export const sales = pgTable('sales', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: varchar('number', { length: 32 }).notNull().unique(),
  customerName: varchar('customer_name', { length: 120 }).notNull(),
  customerEmail: varchar('customer_email', { length: 200 }).notNull().default(''),
  totalCents: integer('total_cents').notNull(),
  status: saleStatusEnum('status').notNull().default('completed'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('sales_created_at_idx').on(table.createdAt), check('sales_total_positive', sql`${table.totalCents} >= 0`)]);
export const saleItems = pgTable('sale_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id').notNull().references(() => sales.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  productName: varchar('product_name', { length: 160 }).notNull(),
  sku: varchar('sku', { length: 60 }).notNull(),
  quantity: integer('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
}, table => [index('sale_items_sale_idx').on(table.saleId), check('sale_items_quantity_positive', sql`${table.quantity} > 0`)]);
export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id),
  delta: integer('delta').notNull(),
  reason: movementReasonEnum('reason').notNull(),
  note: varchar('note', { length: 250 }).notNull(),
  saleId: uuid('sale_id').references(() => sales.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('movements_created_at_idx').on(table.createdAt), check('movements_delta_not_zero', sql`${table.delta} <> 0`)]);
