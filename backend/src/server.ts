import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { PrismaClient, Role, OrderStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z, ZodError } from 'zod';
import { canTransitionOrder, lineSubtotal } from './services/orderRules.js';

const app = Fastify({ logger: true });
const db = new PrismaClient();
await app.register(cors, { origin: true });
await app.register(jwt, { secret: process.env.JWT_SECRET || 'development-secret-change-me' });
declare module '@fastify/jwt' { interface FastifyJWT { payload: { id: string; role: Role }; user: { id: string; role: Role } } }

const registerSchema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), phone: z.string().optional(), role: z.enum(['BUYER', 'SELLER']).default('BUYER') });
const productSchema = z.object({ name: z.string().min(2), description: z.string().min(2), price: z.number().int().positive(), stock: z.number().int().min(0), imageUrl: z.string().url().optional().or(z.literal('')), categoryId: z.string() });
async function auth(req: any, reply: any) { try { await req.jwtVerify(); const u = await db.user.findUnique({ where: { id: req.user.id } }); if (!u?.active) return reply.code(401).send({ error: 'Conta inativa' }); req.user.role = u.role; } catch { return reply.code(401).send({ error: 'Autenticação necessária' }); } }
function role(...roles: Role[]) { return async (req: any, reply: any) => { await auth(req, reply); if (!reply.sent && !roles.includes(req.user.role)) return reply.code(403).send({ error: 'Acesso negado' }); }; }

app.setErrorHandler((error, _req, reply) => { if (error instanceof ZodError) return reply.code(400).send({ error: 'Dados inválidos', details: error.flatten() }); app.log.error(error); return reply.code(500).send({ error: 'Erro interno do servidor' }); });
app.get('/api/health', async () => ({ status: 'ok' }));

app.post('/api/auth/register', async (req, reply) => {
  const data = registerSchema.parse(req.body);
  if (await db.user.findUnique({ where: { email: data.email } })) return reply.code(409).send({ error: 'E-mail já cadastrado' });
  const user = await db.user.create({ data: { ...data, password: await bcrypt.hash(data.password, 12) }, select: { id: true, name: true, email: true, role: true } });
  if (user.role === 'BUYER') await db.cart.create({ data: { buyerId: user.id } });
  const token = app.jwt.sign({ id: user.id, role: user.role }); return reply.code(201).send({ user, token });
});
app.post('/api/auth/login', async (req: any, reply) => {
  const data = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const user = await db.user.findUnique({ where: { email: data.email } });
  if (!user || !user.active || !(await bcrypt.compare(data.password, user.password))) return reply.code(401).send({ error: 'E-mail ou senha inválidos' });
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, token: app.jwt.sign({ id: user.id, role: user.role }) };
});
app.get('/api/auth/me', { preHandler: auth }, async (req: any) => db.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true, phone: true, role: true } }));

app.get('/api/categories', async () => db.category.findMany({ where: { active: true }, orderBy: { name: 'asc' } }));
app.get('/api/products', async (req: any) => {
  const q = z.object({ search: z.string().optional(), categoryId: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(40), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
  const where = { active: true, stock: { gt: 0 }, ...(q.categoryId ? { categoryId: q.categoryId } : {}), ...(q.search ? { name: { contains: q.search } } : {}) };
  const [items, total] = await Promise.all([db.product.findMany({ where, include: { category: true, seller: { select: { id: true, name: true } } }, take: q.limit, skip: (q.page - 1) * q.limit, orderBy: { createdAt: 'desc' } }), db.product.count({ where })]); return { items, total, page: q.page, pages: Math.ceil(total / q.limit) };
});
app.get('/api/products/:id', async (req: any, reply) => { const item = await db.product.findFirst({ where: { id: req.params.id, active: true }, include: { category: true, seller: { select: { id: true, name: true } } } }); return item ?? reply.code(404).send({ error: 'Produto não encontrado' }); });
app.post('/api/products', { preHandler: role('SELLER', 'ADMIN') }, async (req: any, reply) => { const d = productSchema.parse(req.body); const p = await db.product.create({ data: { ...d, imageUrl: d.imageUrl || null, sellerId: req.user.id } }); return reply.code(201).send(p); });
app.put('/api/products/:id', { preHandler: role('SELLER', 'ADMIN') }, async (req: any, reply) => { const d = productSchema.partial().parse(req.body); const p = await db.product.findUnique({ where: { id: req.params.id } }); if (!p) return reply.code(404).send({ error: 'Produto não encontrado' }); if (req.user.role !== 'ADMIN' && p.sellerId !== req.user.id) return reply.code(403).send({ error: 'Produto de outro vendedor' }); return db.product.update({ where: { id: p.id }, data: d }); });
app.delete('/api/products/:id', { preHandler: role('SELLER', 'ADMIN') }, async (req: any, reply) => { const p = await db.product.findUnique({ where: { id: req.params.id } }); if (!p) return reply.code(404).send(); if (req.user.role !== 'ADMIN' && p.sellerId !== req.user.id) return reply.code(403).send(); await db.product.update({ where: { id: p.id }, data: { active: false } }); return reply.code(204).send(); });

app.get('/api/cart', { preHandler: role('BUYER') }, async (req: any) => db.cart.findUnique({ where: { buyerId: req.user.id }, include: { items: { include: { product: { include: { seller: { select: { name: true } } } } } } } }));
app.post('/api/cart/items', { preHandler: role('BUYER') }, async (req: any, reply) => {
  const { productId, quantity } = z.object({ productId: z.string(), quantity: z.number().int().positive() }).parse(req.body);
  const product = await db.product.findFirst({ where: { id: productId, active: true, stock: { gt: 0 } } }); if (!product) return reply.code(404).send({ error: 'Produto indisponível' }); if (product.stock < quantity) return reply.code(400).send({ error: 'Estoque insuficiente' });
  const cart = await db.cart.findUnique({ where: { buyerId: req.user.id }, include: { items: { include: { product: true } } } }); if (!cart) return reply.code(404).send({ error: 'Carrinho não encontrado' });
  if (cart.items.length && cart.items.some(i => i.product.sellerId !== product.sellerId)) return reply.code(400).send({ error: 'Finalize ou esvazie o carrinho antes de comprar de outro vendedor.' });
  const old = cart.items.find(i => i.productId === productId); const next = (old?.quantity || 0) + quantity; if (next > product.stock) return reply.code(400).send({ error: 'Estoque insuficiente' });
  if (old) await db.cartItem.update({ where: { id: old.id }, data: { quantity: next, unitPrice: product.price } }); else await db.cartItem.create({ data: { cartId: cart.id, productId, quantity, unitPrice: product.price } }); return reply.code(201).send({ ok: true });
});
app.put('/api/cart/items/:id', { preHandler: role('BUYER') }, async (req: any, reply) => { const { quantity } = z.object({ quantity: z.number().int().positive() }).parse(req.body); const i = await db.cartItem.findFirst({ where: { id: req.params.id, cart: { buyerId: req.user.id } }, include: { product: true } }); if (!i) return reply.code(404).send(); if (quantity > i.product.stock) return reply.code(400).send({ error: 'Estoque insuficiente' }); return db.cartItem.update({ where: { id: i.id }, data: { quantity, unitPrice: i.product.price } }); });
app.delete('/api/cart/items/:id', { preHandler: role('BUYER') }, async (req: any, reply) => { const i = await db.cartItem.findFirst({ where: { id: req.params.id, cart: { buyerId: req.user.id } } }); if (!i) return reply.code(404).send(); await db.cartItem.delete({ where: { id: i.id } }); return reply.code(204).send(); });

app.post('/api/orders', { preHandler: role('BUYER') }, async (req: any, reply) => {
  try {
    const order = await db.$transaction(async tx => {
      const cart = await tx.cart.findUnique({ where: { buyerId: req.user.id }, include: { items: { include: { product: true } } } });
      if (!cart?.items.length) throw new Error('Carrinho vazio'); const sellerId = cart.items[0].product.sellerId;
      if (cart.items.some(i => i.product.sellerId !== sellerId)) throw new Error('O carrinho deve conter itens de um único vendedor');
      let total = 0; const lines = [] as { productId: string; productName: string; quantity: number; unitPrice: number; subtotal: number }[];
      for (const i of cart.items) { const changed = await tx.product.updateMany({ where: { id: i.productId, active: true, stock: { gte: i.quantity } }, data: { stock: { decrement: i.quantity } } }); if (changed.count !== 1) throw new Error(`Estoque insuficiente para ${i.product.name}`); const p = await tx.product.findUniqueOrThrow({ where: { id: i.productId } }); const sub = lineSubtotal(p.price, i.quantity); total += sub; lines.push({ productId: p.id, productName: p.name, quantity: i.quantity, unitPrice: p.price, subtotal: sub }); }
      const created = await tx.order.create({ data: { buyerId: req.user.id, sellerId, total, items: { create: lines } }, include: { items: true } }); await tx.cartItem.deleteMany({ where: { cartId: cart.id } }); return created;
    }); return reply.code(201).send(order);
  } catch (e: any) { return reply.code(400).send({ error: e.message }); }
});
app.get('/api/orders', { preHandler: auth }, async (req: any) => db.order.findMany({ where: req.user.role === 'ADMIN' ? {} : req.user.role === 'SELLER' ? { sellerId: req.user.id } : { buyerId: req.user.id }, include: { buyer: { select: { name: true } }, seller: { select: { name: true } }, items: true }, orderBy: { createdAt: 'desc' } }));
app.get('/api/orders/:id', { preHandler: auth }, async (req: any, reply) => { const o = await db.order.findUnique({ where: { id: req.params.id }, include: { items: true, buyer: { select: { name: true } }, seller: { select: { name: true } } } }); if (!o) return reply.code(404).send(); if (req.user.role !== 'ADMIN' && o.buyerId !== req.user.id && o.sellerId !== req.user.id) return reply.code(403).send(); return o; });
app.patch('/api/orders/:id/status', { preHandler: role('SELLER', 'ADMIN') }, async (req: any, reply) => { const { status } = z.object({ status: z.nativeEnum(OrderStatus) }).parse(req.body); const o = await db.order.findUnique({ where: { id: req.params.id } }); if (!o) return reply.code(404).send(); if (req.user.role !== 'ADMIN' && o.sellerId !== req.user.id) return reply.code(403).send(); if (!canTransitionOrder(o.status, status)) return reply.code(400).send({ error: 'Transição de status inválida' }); return db.order.update({ where: { id: o.id }, data: { status } }); });
app.post('/api/categories', { preHandler: role('ADMIN') }, async (req: any, reply) => { const d = z.object({ name: z.string().min(2), description: z.string().optional() }).parse(req.body); return reply.code(201).send(await db.category.create({ data: d })); });
app.get('/api/admin/users', { preHandler: role('ADMIN') }, async () => db.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true, createdAt: true } }));
app.patch('/api/admin/users/:id/status', { preHandler: role('ADMIN') }, async (req: any) => { const { active } = z.object({ active: z.boolean() }).parse(req.body); return db.user.update({ where: { id: req.params.id }, data: { active }, select: { id: true, active: true } }); });
app.get('/api/seller/dashboard', { preHandler: role('SELLER') }, async (req: any) => { const [products, orders, lowStock, revenue] = await Promise.all([db.product.count({ where: { sellerId: req.user.id, active: true } }), db.order.count({ where: { sellerId: req.user.id } }), db.product.count({ where: { sellerId: req.user.id, stock: { lte: 5 }, active: true } }), db.order.aggregate({ where: { sellerId: req.user.id, status: { not: 'CANCELADO' } }, _sum: { total: true } })]); return { products, orders, lowStock, revenue: revenue._sum.total || 0 }; });

const port = Number(process.env.PORT || 3333); await app.listen({ port, host: '0.0.0.0' });
