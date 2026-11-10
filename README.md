# Vitrine Marketplace

Protótipo acadêmico full stack de marketplace para compradores e vendedores, com catálogo, sacola persistida, checkout com atualização atômica de estoque e acompanhamento de pedidos.

## Stack e arquitetura

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Router, Axios e Lucide.
- **Backend:** Node.js, TypeScript, Fastify, API REST, Prisma ORM, Zod, JWT e bcryptjs.
- **Dados:** SQLite local. Valores monetários são armazenados em centavos inteiros.
- `frontend/src` contém a aplicação de compra responsiva; `backend/src/server.ts` expõe os domínios REST; `backend/prisma` contém schema e seed.

O schema define User, Category, Product, Cart, CartItem, Order e OrderItem, com histórico de nome e preço do item no pedido. O checkout usa uma transação Prisma e decremento condicional do estoque para impedir venda concorrente além do disponível.

## Requisitos

Node.js 20.19+ e npm. A aplicação roda localmente e usa SQLite; imagens demonstrativas e fontes são servidas pelo Unsplash e Google Fonts.

## Instalação e execução

Na raiz do repositório:

```bash
npm install
```

Copie `backend/.env.example` para `backend/.env` e altere `JWT_SECRET` para um valor privado. Crie o banco e os dados de demonstração:

```bash
npm run db:migrate
npm run db:seed
```

Inicie a API e o frontend juntos:

```bash
npm run dev
```

Frontend: http://localhost:5173  
API: http://localhost:3333/api  
Health check: http://localhost:3333/api/health

## Contas demonstrativas

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | `admin@marketplace.local` | `Admin123!` |
| Vendedor | `vendedor@marketplace.local` | `Vendedor123!` |
| Vendedor | `vendedor2@marketplace.local` | `Vendedor123!` |
| Comprador | `comprador1@marketplace.local` | `Cliente123!` |
| Comprador | `comprador2@marketplace.local` | `Cliente123!` |
| Comprador | `comprador3@marketplace.local` | `Cliente123!` |

As senhas são salvas com bcrypt no seed. Essas credenciais são apenas para demonstração local.

## Endpoints principais

- Auth: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- Catálogo: `GET /api/products?search=&categoryId=`, `GET /api/products/:id`, `GET /api/categories`
- Produtos de vendedor: `POST/PUT/DELETE /api/products`
- Sacola do comprador: `GET /api/cart`, `POST /api/cart/items`, `PUT/DELETE /api/cart/items/:id`
- Pedidos: `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id`, `PATCH /api/orders/:id/status`
- Admin: `GET /api/admin/users`, `PATCH /api/admin/users/:id/status`, `POST /api/categories`
- Dashboard vendedor: `GET /api/seller/dashboard`

Pedidos só aceitam itens de um vendedor e seguem transições de status controladas. Cadastros públicos aceitam somente BUYER ou SELLER; ADMIN é provisionado no seed.

## Escopo atual

O frontend cobre cadastro/login, catálogo e busca, sacola persistente, checkout e histórico do comprador. A API também expõe operações para produtos e indicadores do vendedor e gestão básica de usuários/categorias pelo administrador. Os painéis de gestão do vendedor e administrador ainda não estão completos na interface. Não há cobrança, envio, recuperação de senha por e-mail, upload de arquivos ou painel completo para editar categorias e inspecionar todos os pedidos no frontend. A atualização de estoque é atômica no checkout; reembolsos e reposição automática em cancelamentos não estão implementados.
