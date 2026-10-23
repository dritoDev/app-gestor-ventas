import express, { type ErrorRequestHandler, type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { ZodError, z } from 'zod';
import { db, users, products, sales, saleItems, inventoryMovements } from '@gestor/db';
import { calculateTotal, inventoryInput, loginInput, productInput, productUpdate, saleInput } from '@gestor/shared';
import { openApiDocument } from './openapi';
import { createMcpRouter } from './mcp';
import { verifyRestToken } from './mcp-auth';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(createMcpRouter());
app.use((req, res, next) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && req.headers.origin) {
    const allowed = (process.env.WEB_ORIGIN || 'http://localhost:3001').split(',').map(origin => origin.trim());
    let sameOrigin = false;
    try {
      const origin = new URL(req.headers.origin);
      sameOrigin = origin.host === req.get('host') && origin.protocol === `${req.protocol}:`;
    } catch { /* Un Origin mal formado no se considera fiable. */ }
    if (!sameOrigin && !allowed.includes(req.headers.origin)) { res.status(403).json({ error: 'Origen no permitido' }); return; }
  }
  next();
});
const cookieName = 'gestor_session';
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const asyncRoute = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res)).catch(next); };
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const validId = (id: string | undefined) => z.string().uuid().parse(id);
const publicProduct = (product: typeof products.$inferSelect) => ({ ...product, active: product.active === 1 });

app.get('/openapi.json', (_req, res) => res.json(openApiDocument));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, {
  customSiteTitle: 'Mercato · Documentación API',
  swaggerOptions: { withCredentials: true },
}));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = loginInput.parse(req.body);
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user) throw new HttpError(401, 'Credenciales incorrectas');
  const [salt, stored] = user.passwordHash.split(':');
  const calculated = scryptSync(password, salt!, 64);
  const storedBuffer = Buffer.from(stored!, 'hex');
  if (storedBuffer.length !== calculated.length || !timingSafeEqual(calculated, storedBuffer)) throw new HttpError(401, 'Credenciales incorrectas');
  const token = await new SignJWT({ role: user.role }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime('7d').sign(secret);
  res.cookie(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));
app.post('/auth/logout', (_req, res) => { res.clearCookie(cookieName, { path: '/' }); res.json({ ok: true }); });

app.use((req, _res, next) => { Promise.resolve((async () => {
  const authorization = req.get('authorization');
  const token = authorization ? /^Bearer (\S+)$/i.exec(authorization)?.[1] : req.cookies?.[cookieName];
  if (!token) throw new HttpError(401, 'Inicia sesión para continuar');
  let userId: string;
  try {
    if (authorization) {
      const identity = await verifyRestToken(token, process.env.JWT_SECRET || '');
      const requiredScope = ['GET', 'HEAD'].includes(req.method) ? 'mcp:read' : 'mcp:write';
      if (!identity.scopes.includes(requiredScope)) throw new HttpError(403, `Se requiere el scope ${requiredScope}`);
      userId = identity.userId;
    } else {
      const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
      if (!payload.sub) throw new Error('Sin usuario');
      userId = payload.sub;
    }
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error('Usuario inexistente');
    resUser.set(req, user);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, 'Sesión caducada o token inválido. Vuelve a iniciar sesión');
  }
})()).then(() => next(), next); });
const resUser = new WeakMap<Request, { id: string; name: string; email: string; role: 'admin' | 'operator' }>();
const adminOnly = (req: Request, _res: Response, next: NextFunction) => { if (resUser.get(req)?.role !== 'admin') next(new HttpError(403, 'Solo los administradores pueden realizar esta acción')); else next(); };
app.get('/auth/me', (req, res) => res.json({ user: resUser.get(req) }));

app.get('/products', asyncRoute(async (_req, res) => {
  const rows = await db.select().from(products).orderBy(desc(products.createdAt)).limit(500);
  res.json({ products: rows.map(publicProduct) });
}));
app.post('/products', adminOnly, asyncRoute(async (req, res) => {
  const input = productInput.parse(req.body);
  const [created] = await db.insert(products).values({ ...input, active: input.active ? 1 : 0 }).returning();
  res.status(201).json({ product: publicProduct(created!) });
}));
app.patch('/products/:id', adminOnly, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  const input = productUpdate.parse(req.body);
  const [updated] = await db.update(products).set({ ...input, active: input.active === undefined ? undefined : input.active ? 1 : 0, updatedAt: new Date() }).where(eq(products.id, id)).returning();
  if (!updated) throw new HttpError(404, 'Producto no encontrado');
  res.json({ product: publicProduct(updated) });
}));
app.post('/products/:id/stock', adminOnly, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  const { delta, note } = inventoryInput.parse(req.body);
  const updated = await db.transaction(async tx => {
    const [product] = await tx.select().from(products).where(eq(products.id, id)).for('update');
    if (!product) throw new HttpError(404, 'Producto no encontrado');
    if (product.stock + delta < 0) throw new HttpError(409, 'El stock no puede quedar en negativo');
    const [row] = await tx.update(products).set({ stock: product.stock + delta, updatedAt: new Date() }).where(eq(products.id, id)).returning();
    await tx.insert(inventoryMovements).values({ productId: id, delta, note, reason: 'adjustment' });
    return row!;
  });
  res.json({ product: publicProduct(updated) });
}));
app.get('/inventory', asyncRoute(async (_req, res) => {
  const movements = await db.select({ id: inventoryMovements.id, productId: inventoryMovements.productId, productName: products.name, sku: products.sku, delta: inventoryMovements.delta, reason: inventoryMovements.reason, note: inventoryMovements.note, createdAt: inventoryMovements.createdAt })
    .from(inventoryMovements).innerJoin(products, eq(inventoryMovements.productId, products.id)).orderBy(desc(inventoryMovements.createdAt)).limit(200);
  res.json({ movements });
}));
app.get('/sales', asyncRoute(async (_req, res) => {
  const rows = await db.select().from(sales).orderBy(desc(sales.createdAt)).limit(200);
  const items = rows.length ? await db.select().from(saleItems).where(inArray(saleItems.saleId, rows.map(row => row.id))) : [];
  res.json({ sales: rows.map(row => ({ ...row, items: items.filter(item => item.saleId === row.id) })) });
}));
app.post('/sales', asyncRoute(async (req, res) => {
  const input = saleInput.parse(req.body);
  const created = await db.transaction(async tx => {
    // Bloqueo en orden estable para evitar carreras y reducir interbloqueos.
    const ids = input.items.map(item => item.productId).sort();
    const locked = await tx.select().from(products).where(inArray(products.id, ids)).orderBy(products.id).for('update');
    if (locked.length !== ids.length) throw new HttpError(404, 'Uno de los productos ya no existe');
    const lines = input.items.map(item => {
      const product = locked.find(row => row.id === item.productId)!;
      if (!product.active) throw new HttpError(409, `${product.name} está inactivo`);
      if (product.stock < item.quantity) throw new HttpError(409, `Stock insuficiente para ${product.name} (disponible: ${product.stock})`);
      return { productId: product.id, productName: product.name, sku: product.sku, quantity: item.quantity, unitPriceCents: product.priceCents };
    });
    const totalCents = calculateTotal(lines);
    if (totalCents > 2_147_483_647) throw new HttpError(400, 'El total supera el máximo permitido');
    const number = `V-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const [sale] = await tx.insert(sales).values({ number, customerName: input.customerName, customerEmail: input.customerEmail, totalCents, createdBy: resUser.get(req)!.id }).returning();
    await tx.insert(saleItems).values(lines.map(line => ({ ...line, saleId: sale!.id })));
    for (const line of lines) {
      await tx.update(products).set({ stock: sql`${products.stock} - ${line.quantity}`, updatedAt: new Date() }).where(eq(products.id, line.productId));
      await tx.insert(inventoryMovements).values({ productId: line.productId, delta: -line.quantity, reason: 'sale', note: `Venta ${number}`, saleId: sale!.id });
    }
    return { ...sale!, items: lines };
  });
  res.status(201).json({ sale: created });
}));
app.post('/sales/:id/cancel', adminOnly, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  const cancelled = await db.transaction(async tx => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).for('update');
    if (!sale) throw new HttpError(404, 'Venta no encontrada');
    if (sale.status === 'cancelled') throw new HttpError(409, 'La venta ya está cancelada');
    const lines = await tx.select().from(saleItems).where(eq(saleItems.saleId, id)).orderBy(saleItems.productId);
    for (const line of lines) {
      await tx.update(products).set({ stock: sql`${products.stock} + ${line.quantity}`, updatedAt: new Date() }).where(eq(products.id, line.productId));
      await tx.insert(inventoryMovements).values({ productId: line.productId, delta: line.quantity, reason: 'cancellation', note: `Cancelación ${sale.number}`, saleId: id });
    }
    const [updated] = await tx.update(sales).set({ status: 'cancelled' }).where(eq(sales.id, id)).returning();
    return updated!;
  });
  res.json({ sale: cancelled });
}));
app.get('/dashboard', asyncRoute(async (_req, res) => {
  const today = new Date();
  const start = new Date(today); start.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(start); thirtyDaysAgo.setDate(start.getDate() - 29);
  const sixtyDaysAgo = new Date(start); sixtyDaysAgo.setDate(start.getDate() - 59);
  const sevenDaysAgo = new Date(start); sevenDaysAgo.setDate(start.getDate() - 6);
  const [allProducts, periodSales, recentSales, leaders] = await Promise.all([
    db.select().from(products),
    db.select().from(sales).where(gte(sales.createdAt, sixtyDaysAgo)),
    db.select().from(sales).orderBy(desc(sales.createdAt)).limit(5),
    db.select({ name: products.name, quantity: sql<number>`cast(sum(${saleItems.quantity}) as int)` })
      .from(saleItems).innerJoin(sales, eq(saleItems.saleId, sales.id)).innerJoin(products, eq(saleItems.productId, products.id))
      .where(and(eq(sales.status, 'completed'), gte(sales.createdAt, thirtyDaysAgo)))
      .groupBy(products.id, products.name).orderBy(desc(sql`sum(${saleItems.quantity})`)).limit(5),
  ]);
  const completed = periodSales.filter(sale => sale.status === 'completed');
  const current = completed.filter(sale => sale.createdAt >= thirtyDaysAgo);
  const previous = completed.filter(sale => sale.createdAt < thirtyDaysAgo);
  const revenueCents = current.reduce((sum, sale) => sum + sale.totalCents, 0);
  const previousCents = previous.reduce((sum, sale) => sum + sale.totalCents, 0);
  const salesByDay = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(sevenDaysAgo); day.setDate(sevenDaysAgo.getDate() + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    return { day: key, totalCents: completed.filter(sale => { const date = sale.createdAt; return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate(); }).reduce((sum, sale) => sum + sale.totalCents, 0) };
  });
  res.json({ revenueCents, salesCount: current.length, productCount: allProducts.length, lowStockCount: allProducts.filter(p => p.active && p.stock <= p.minStock).length,
    revenueChange: previousCents ? Math.round((revenueCents / previousCents - 1) * 100) : null, recentSales, lowStock: allProducts.filter(p => p.active && p.stock <= p.minStock).slice(0, 5).map(publicProduct), topProducts: leaders, salesByDay });
}));

const handleError: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof ZodError) { res.status(400).json({ error: err.issues[0]?.message || 'Datos incorrectos' }); return; }
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
  if (typeof err === 'object' && err && 'code' in err && err.code === '23505') { res.status(409).json({ error: 'Ya existe un registro con ese identificador (SKU o email)' }); return; }
  console.error(err);
  res.status(500).json({ error: 'Ha ocurrido un error inesperado' });
};
app.use(handleError);
export { app };
