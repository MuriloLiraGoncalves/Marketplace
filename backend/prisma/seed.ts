import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
const db = new PrismaClient();
const users = [
  { name: 'Admin Marketplace', email: 'admin@marketplace.local', password: 'Admin123!', role: Role.ADMIN },
  { name: 'Loja Horizonte', email: 'vendedor@marketplace.local', password: 'Vendedor123!', role: Role.SELLER },
  { name: 'Casa Aurora', email: 'vendedor2@marketplace.local', password: 'Vendedor123!', role: Role.SELLER },
  ...['Ana Compradora', 'Bruno Cliente', 'Carla Cliente'].map((name, i) => ({ name, email: `comprador${i + 1}@marketplace.local`, password: 'Cliente123!', role: Role.BUYER }))
];
for (const u of users) { const password = await bcrypt.hash(u.password, 12); await db.user.upsert({ where: { email: u.email }, update: { name: u.name, password, role: u.role }, create: { ...u, password } }); }
for (const b of await db.user.findMany({ where: { role: Role.BUYER } })) await db.cart.upsert({ where: { buyerId: b.id }, update: {}, create: { buyerId: b.id } });
const categoryNames = ['Eletrônicos', 'Informática', 'Vestuário', 'Livros', 'Casa e decoração', 'Acessórios'];
for (const name of categoryNames) await db.category.upsert({ where: { name }, update: {}, create: { name } });
const sellers = await db.user.findMany({ where: { role: Role.SELLER } }); const cats = await db.category.findMany();
const names = ['Fone Bluetooth', 'Luminária de mesa', 'Teclado mecânico', 'Mochila urbana', 'Livro de fotografia', 'Garrafa térmica', 'Mouse sem fio', 'Camiseta essencial', 'Vaso cerâmico', 'Webcam HD', 'Caderno pontilhado', 'Relógio minimalista', 'Suporte para notebook', 'Manta decorativa', 'Carregador USB-C', 'Óculos de sol', 'Livro de receitas', 'Caixa organizadora'];
for (let i = 0; i < names.length; i++) { const seller = sellers[i % sellers.length]; const name = names[i]; await db.product.upsert({ where: { id: `demo-product-${i + 1}` }, update: {}, create: { id: `demo-product-${i + 1}`, name, description: `${name} selecionado pela curadoria do Marketplace. Qualidade e praticidade para o seu dia a dia.`, price: (3990 + i * 1740), stock: 8 + (i % 15), sellerId: seller.id, categoryId: cats[i % cats.length].id, imageUrl: `https://images.unsplash.com/photo-${['1505740420928-5e560c06d30e','1496181133206-80ce9b88a853','1523275335684-37898b6baf30','1526170375885-4d8ecf77b99f','1542291026-7eec264c27ff','1503602642458-232111445657'][i % 6]}?auto=format&fit=crop&w=800&q=80` } }); }
console.log('Seed concluído'); await db.$disconnect();
