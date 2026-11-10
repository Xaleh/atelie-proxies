# Proxy do Reis

Site do ateliê de proxies: a cliente monta o pedido de cartas de Magic, escolhe
arte e idioma (inglês ou português) carta por carta, paga por Pix direto ou
Mercado Pago e acompanha o pedido por um link. O ateliê cuida de tudo pelo
painel em `/admin`.

## O que já funciona

- **Loja:** página inicial e montador com busca por nome (inglês ou português),
  colagem de lista de deck, troca de arte e seletor EN/PT por carta.
- **Pedido:** fechamento sem cadastro, preço por faixa de quantidade calculado
  no servidor, página de acompanhamento em `/pedido/<token>`.
- **Pagamento:** Pix copia-e-cola com QR (confirmado à mão no painel) e
  Mercado Pago pelo Checkout Pro (confirmado sozinho pelo webhook).
- **Painel:** login por senha, lista de pedidos, detalhe com as cartas, a lista
  para a produção e a mudança de status com código de rastreio.

## O que ainda não entrou

- PDF de impressão e gabarito DXF dentro do painel. Por enquanto o painel
  entrega a lista do pedido para colar na tela de produção atual.
- Texto traduzido sobre a carta em inglês. Hoje o português vale só para cartas
  com impressão oficial em PT; as outras aparecem como "PT indisponível".
- Envio de arte própria, fichas (tokens), One Piece e Pokémon.
- Catálogo local de cartas: a busca usa a API do Scryfall, com cache de 24 h.

## Rodar no computador

Precisa do Node.js 22 ou mais novo.

```bash
npm install
cp .env.example .env.local   # preencha ADMIN_PASSWORD e SESSION_SECRET
npm run db:migrate           # cria o arquivo local.db
npm run dev                  # http://localhost:3000
```

Outros comandos: `npm test` (testes), `npm run typecheck`, `npm run lint`,
`npm run build`.

## Publicar no Netlify

1. Crie um banco no [Turso](https://turso.tech) e copie a URL (`libsql://...`)
   e um token de acesso.
2. No Netlify, crie o site a partir deste repositório. O `netlify.toml` já
   define o comando de build, que aplica as migrações do banco antes de
   compilar.
3. Em **Site configuration > Environment variables**, cadastre as variáveis do
   `.env.example`. As obrigatórias são `TURSO_DATABASE_URL`,
   `TURSO_AUTH_TOKEN`, `ADMIN_PASSWORD` e `SESSION_SECRET`.
4. No Mercado Pago, em **Suas integrações > Webhooks**, cadastre
   `https://SEU-SITE/api/webhooks/mercadopago` para o evento **Pagamentos** e
   copie a assinatura secreta para `MERCADOPAGO_WEBHOOK_SECRET`.

No plano gratuito do Netlify cada deploy de produção gasta créditos, e os
deploys de pré-visualização (branches e pull requests) não gastam. Vale juntar
mudanças antes de enviar para a `main`.

## Preços e frete

Ficam em `src/config/loja.ts`. Os valores atuais são provisórios.

## Como o código está organizado

| Pasta | O que tem |
| --- | --- |
| `src/app` | Páginas e rotas de API (Next.js App Router) |
| `src/app/api/cards` | Busca de cartas, sempre pelo servidor |
| `src/app/api/orders` | Criação de pedido e início do pagamento pelo Mercado Pago |
| `src/app/api/webhooks/mercadopago` | Aviso de pagamento do Mercado Pago |
| `src/app/admin` | Painel do ateliê |
| `src/lib` | Regras: preço, Pix, Mercado Pago, Scryfall, pedidos, sessão |
| `src/lib/db` | Tabelas (Drizzle ORM) e conexão |
| `drizzle` | Migrações do banco |
| `tests` | Testes das regras |
| `design/brand` | Arquivos originais da logo |

## Mudança para a VPS

O banco usa o protocolo libSQL, que também abre arquivos SQLite. Na VPS basta
trocar `TURSO_DATABASE_URL` para `file:/caminho/app.db`, copiar os dados e rodar
`npm run build && npm start` atrás de um proxy com HTTPS.

## Aviso

As imagens e os dados das cartas vêm do [Scryfall](https://scryfall.com). As
cartas, artes e marcas pertencem aos seus donos; este projeto não é afiliado à
Wizards of the Coast.
