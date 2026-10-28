import { db, sales, saleItems } from './src/index';
import { desc } from 'drizzle-orm';

async function querySales() {
  const rows = await db.select().from(sales).orderBy(desc(sales.createdAt));
  const items = rows.length ? await db.select().from(saleItems).where(saleItems.saleId.in(rows.map(r => r.id))) : [];
  const result = rows.map(row => ({ ...row, items: items.filter(item => item.saleId === row.id) }));
  console.log(JSON.stringify(result, null, 2));
  await db.$client.end();
}

querySales();