import { config } from 'dotenv';
import { randomBytes, scryptSync } from 'node:crypto';

config({ path: '../../.env' });
const { db, pool, users, products, inventoryMovements } = await import('./index');

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email) throw new Error('Falta ADMIN_EMAIL en .env');
if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD en .env debe tener al menos 12 caracteres. Elige una contraseña más larga y vuelve a ejecutar db:seed.');
const salt = randomBytes(16).toString('hex');
const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;

try {
  await db.insert(users).values({ name: 'Administrador', email, passwordHash, role: 'admin' }).onConflictDoNothing();
  const demo = [
    { name: 'Auriculares Studio Wireless', sku: 'AUD-ST-001', category: 'Audio', description: 'Sonido envolvente para el día a día.', priceCents: 8990, stock: 28, minStock: 8 },
    { name: 'Lámpara de escritorio Noma', sku: 'HOG-NO-002', category: 'Hogar', description: 'Luz cálida de intensidad regulable.', priceCents: 6450, stock: 14, minStock: 6 },
    { name: 'Mochila urbana Canvas', sku: 'ACC-CA-003', category: 'Accesorios', description: 'Diseñada para moverse con libertad.', priceCents: 7900, stock: 21, minStock: 5 },
    { name: 'Botella térmica Terra', sku: 'LIF-TE-004', category: 'Lifestyle', description: 'Acero inoxidable, 750 ml.', priceCents: 3290, stock: 4, minStock: 8 },
    { name: 'Teclado mecánico Forma', sku: 'TEC-FO-005', category: 'Tecnología', description: 'Compacto, preciso y silencioso.', priceCents: 11900, stock: 17, minStock: 5 },
    { name: 'Organizador de viaje Fold', sku: 'ACC-FO-006', category: 'Accesorios', description: 'Todo en su sitio, estés donde estés.', priceCents: 2490, stock: 3, minStock: 6 },
  ];
  await db.transaction(async tx => {
    for (const item of demo) {
      const [created] = await tx.insert(products).values(item).onConflictDoNothing().returning();
      if (created) await tx.insert(inventoryMovements).values({ productId: created.id, delta: item.stock, reason: 'initial', note: 'Stock inicial de demostración' });
    }
  });
  console.log(`Datos listos. Accede con ${email}.`);
} finally {
  await pool.end();
}
