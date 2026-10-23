import { z } from 'zod';

export const productInput = z.object({
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(2).max(60).regex(/^[a-zA-Z0-9._-]+$/, 'Usa letras, números, puntos, guiones o guiones bajos'),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).default(''),
  priceCents: z.number().int().min(0).max(100_000_000),
  minStock: z.number().int().min(0).max(1_000_000).default(5),
  active: z.boolean().default(true),
});
export const productUpdate = productInput.partial().refine(value => Object.keys(value).length > 0);
export const inventoryInput = z.object({
  delta: z.number().int().min(-1_000_000).max(1_000_000).refine(value => value !== 0, 'El cambio no puede ser cero'),
  note: z.string().trim().min(3).max(250),
});
export const saleInput = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerEmail: z.union([z.string().trim().email().max(200), z.literal('')]).default(''),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(100_000) })).min(1).max(100)
    .refine(items => new Set(items.map(item => item.productId)).size === items.length, 'No repitas productos'),
});
export const loginInput = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

export type ProductInput = z.infer<typeof productInput>;
export type SaleInput = z.infer<typeof saleInput>;
export type Product = ProductInput & { id: string; stock: number; createdAt: string; updatedAt: string };
export type Sale = { id: string; number: string; customerName: string; customerEmail: string; totalCents: number; status: 'completed' | 'cancelled'; createdAt: string; items?: SaleItem[] };
export type SaleItem = { id: string; productId: string; productName: string; sku: string; quantity: number; unitPriceCents: number };
export type Movement = { id: string; productId: string; productName: string; sku: string; delta: number; reason: 'initial' | 'adjustment' | 'sale' | 'cancellation'; note: string; createdAt: string };
export type Dashboard = { revenueCents: number; salesCount: number; productCount: number; lowStockCount: number; revenueChange: number | null; recentSales: Sale[]; lowStock: Product[]; topProducts: { name: string; quantity: number }[]; salesByDay: { day: string; totalCents: number }[] };
export type User = { id: string; name: string; email: string; role: 'admin' | 'operator' };

export function formatMoney(cents: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
export function calculateTotal(items: { quantity: number; unitPriceCents: number }[]) {
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Total de venta demasiado grande');
  return total;
}
