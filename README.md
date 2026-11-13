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
- **Painel:** login por senha, lista de pedidos, detalhe com as cartas e a
  mudança de status com código de rastreio. Em **Valores**, o preço por carta,
  o frete e o limite de cartas por pedido. Em **Acessórios**, o catálogo de
  sleeves e deckboxes e o desconto dos combos.
- **Produção:** em `/admin/producao`, um ou vários pedidos viram folhas A4 em
  paisagem com 8 cartas. Dá para reordenar, duplicar, tirar e completar as
  vagas com cartas avulsas, e baixar o PDF de impressão e o gabarito de corte
  em DXF. O verso das cartas de duas faces é sempre impresso, como uma carta a
  mais, e anda junto com a frente ao mover, duplicar ou tirar. A geometria e as marcas de registro são as mesmas do site de
  produção anterior, então o gabarito da Silhouette Portrait 4 continua valendo.
- **Texto em português sobre a arte em inglês:** quando a cliente escolhe PT
  numa arte que só existe em inglês, o site escreve nome, tipo e texto em
  português por cima da arte (selo "PT traduzida"), com prévia na loja e no PDF.
  O texto vem, nesta ordem, da revisão feita no painel, do MTG Arena e da carta
  impressa em português. As fontes são livres (Crimson Pro e Inter). O site
  apaga só as letras em inglês, sem cobrir a caixa, e usa os símbolos de mana
  oficiais que o Scryfall publica (`svgs.scryfall.io`); sem acesso a eles, cai
  num desenho simples.
- **Traduções no painel:** em `/admin/traducoes`, importar o
  `traducoes-arena.json` do agente do Arena (a importação substitui a anterior)
  e revisar o texto de qualquer carta.
- **Moldes:** artes com a moldura moderna (2015) ou a antiga (1993, de Alpha a
  Mirage) recebem o texto sozinhas. Na moldura antiga o resultado depende do
  scan: cartas brancas e as de Alpha e Beta podem sair com o nome fora do
  lugar, e aí vale o molde manual. Para essas e para as outras artes (sem
  borda, vitrine, arte estendida), em `/admin/moldes/<id>` o
  Augusto marca onde ficam nome, tipo e texto, ou desliga o português naquela
  arte. Na produção, o botão "Molde" de cada carta abre essa tela.

## O que ainda não entrou

- Planeswalkers, sagas, batalhas e classes só recebem português com molde
  manual; o texto delas não cabe no molde automático.
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

Marque como "Contains secret values" só o que é segredo de verdade: os tokens,
a senha do painel, o segredo da sessão e a assinatura do webhook. O Netlify
procura o valor de cada variável secreta nos arquivos do site e derruba o build
se achar. `PIX_RECEBEDOR`, `PIX_CIDADE` e `SITE_URL` são públicos e podem
coincidir com textos do site, então ficam sem essa marca.

No plano gratuito do Netlify cada deploy de produção gasta créditos, e os
deploys de pré-visualização (branches e pull requests) não gastam. Vale juntar
mudanças antes de enviar para a `main`.

## Preços e frete

O ateliê define em `/admin/valores`: preço por carta por faixa de quantidade,
frete do envio e limite de cartas por pedido. O que for salvo fica no banco e
vale para os próximos pedidos na hora; pedidos já feitos guardam o valor de
quando foram fechados. Enquanto ninguém salvar nada, valem os valores iniciais
de `src/config/loja.ts`.

### Acessórios e combos

Em `/admin/acessorios` o ateliê cadastra sleeves e deckboxes (nome, detalhe,
preço e se está disponível) e define o desconto de cada combo: cartas +
sleeves, cartas + deckbox e cartas + sleeves + deckbox. O desconto pode ser
percentual ou um valor fixo em reais, e incide sobre cartas + acessórios; o
frete fica de fora. Só aparece na loja o que estiver marcado como disponível;
sem nenhum item disponível, a seção de acessórios some. Acessório só é vendido
junto com cartas. Cada item pode ter uma foto: o painel reduz a imagem no
navegador (JPEG de até 800 px e 400 KB) e ela fica guardada no banco, servida
por `/api/acessorios/<id>/imagem` com cache longo. O pedido guarda o nome e o preço de cada acessório na hora da
compra, então mudar ou remover um item do catálogo não altera pedidos feitos.

Se os valores mudarem enquanto uma cliente está com a página de fechamento
aberta (preço, frete, desconto ou um acessório que ficou indisponível), o site
recusa a confirmação, mostra o total novo e pede para ela confirmar de novo.

## Como o código está organizado

| Pasta | O que tem |
| --- | --- |
| `src/app` | Páginas e rotas de API (Next.js App Router) |
| `src/app/api/cards` | Busca de cartas, sempre pelo servidor |
| `src/app/api/orders` | Criação de pedido e início do pagamento pelo Mercado Pago |
| `src/app/api/webhooks/mercadopago` | Aviso de pagamento do Mercado Pago |
| `src/app/admin` | Painel do ateliê |
| `src/lib` | Regras: preço, Pix, Mercado Pago, Scryfall, pedidos, sessão |
| `src/lib/traducao` | Traduções: ordem das fontes, moldes e o desenho do texto sobre a arte |
| `src/lib/print` | Folha de impressão: geometria, lote, PDF e gabarito DXF |
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
