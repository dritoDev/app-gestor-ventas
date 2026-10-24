import { db, products } from './index';

async function main() {
  const allProducts = await db.select().from(products).orderBy(products.name);
  console.log('Productos en la base de datos:');
  console.table(allProducts.map(p => ({
    id: p.id,
    nombre: p.name,
    sku: p.sku,
    categoria: p.category,
    precio: (p.priceCents / 100).toFixed(2) + ' €',
    stock: p.stock,
    minStock: p.minStock,
    activo: p.active === 1
  })));
  process.exit(0);
}

main().catch(console.error);