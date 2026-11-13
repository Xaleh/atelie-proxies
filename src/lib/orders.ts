import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { loja } from "@/config/loja";
import { db, schema } from "./db";
import type { Order, OrderAccessory, OrderItem, Payment, Status } from "./db/schema";
import { novoCodigoDePedido, novoToken } from "./ids";
import { consultarPagamento } from "./mercadopago";
import { LIMITES_DE_ACESSORIOS, linhasDe } from "./acessorios";
import { calcularPedido, type Tabela } from "./pricing";
import { HOSTS_DE_IMAGEM } from "./scryfall";

const { orders, orderItems, orderAccessories, payments } = schema;

const texto = (max: number) => z.string().trim().max(max);

// Ids do Scryfall: aceita qualquer UUID bem formado, sem exigir versão.
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "id inválido");

const itemSchema = z.object({
  printId: uuid,
  oracleId: uuid,
  name: texto(200).min(1),
  printedName: texto(200).nullable().optional(),
  set: texto(10).min(1),
  collectorNumber: texto(20).min(1),
  lang: z.enum(["en", "pt"]),
  /** Texto em português escrito sobre a arte em inglês. */
  traduzida: z.boolean().optional().default(false),
  image: z
    .string()
    .url()
    .max(400)
    .refine((u) => {
      try {
        const url = new URL(u);
        return url.protocol === "https:" && HOSTS_DE_IMAGEM.includes(url.hostname);
      } catch {
        return false;
      }
    }, "imagem fora do Scryfall"),
  qty: z.number().int().min(1).max(loja.maxCopiasPorCarta),
}).refine((i) => !i.traduzida || i.lang === "pt", "item traduzido precisa estar em português");

export const pedidoSchema = z
  .object({
    nome: texto(120).min(2, "Informe seu nome"),
    contato: texto(160).min(5, "Informe um e-mail ou telefone"),
    entrega: z.enum(["envio", "retirada"]),
    cep: texto(12).optional().default(""),
    endereco: texto(300).optional().default(""),
    observacoes: texto(1000).optional().default(""),
    /** Total que a cliente viu na tela, em centavos, para conferir com o preço em vigor. */
    totalEsperado: z.number().int().min(0).optional(),
    /** Campo-isca: gente não preenche, robô costuma preencher. */
    site: z.string().max(0).optional().default(""),
    itens: z.array(itemSchema).min(1, "O pedido está vazio").max(300),
    /** Sleeves e deckbox escolhidos: o produto do catálogo e quantas unidades. */
    acessorios: z
      .array(z.object({ id: z.number().int().positive(), qty: z.number().int().min(1).max(LIMITES_DE_ACESSORIOS.porProduto) }))
      .max(LIMITES_DE_ACESSORIOS.produtos)
      .optional()
      .default([])
      .refine((lista) => new Set(lista.map((a) => a.id)).size === lista.length, "acessório repetido"),
  })
  .superRefine((p, ctx) => {
    if (p.entrega === "envio") {
      if (!/^\d{5}-?\d{3}$/.test(p.cep)) ctx.addIssue({ code: "custom", path: ["cep"], message: "Informe um CEP válido" });
      if (p.endereco.length < 8) ctx.addIssue({ code: "custom", path: ["endereco"], message: "Informe o endereço completo" });
    }
  });

export type PedidoInput = z.infer<typeof pedidoSchema>;

/** O pedido não pode ser fechado como veio: passou do limite de cartas ou o preço mudou. */
export class PedidoRecusado extends Error {
  constructor(
    public motivo: "limite" | "preco" | "acessorio",
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/**
 * Cria o pedido. O preço é sempre recalculado aqui, com os valores em vigor,
 * e nunca vem do navegador. Se a cliente viu outro total (os valores mudaram
 * enquanto ela montava o pedido), o pedido é recusado para ela conferir.
 */
export async function criarPedido(input: PedidoInput, tabela: Tabela): Promise<Order> {
  const { valores } = tabela;
  const quantidade = input.itens.reduce((n, i) => n + i.qty, 0);
  if (quantidade > valores.maxCartasPorPedido) {
    throw new PedidoRecusado("limite", `O limite é de ${valores.maxCartasPorPedido} cartas por pedido`);
  }
  // Acessório que saiu da loja enquanto a cliente montava o pedido não entra calado nem some calado.
  const linhas = linhasDe(input.acessorios, tabela.produtos);
  if (linhas.length !== input.acessorios.length) {
    throw new PedidoRecusado("acessorio", "Um acessório que você escolheu não está mais disponível. Confira o pedido e confirme de novo.");
  }
  const totais = calcularPedido(tabela, quantidade, input.entrega, linhas);
  if (input.totalEsperado != null && input.totalEsperado !== totais.total) {
    throw new PedidoRecusado("preco", "Os valores foram atualizados enquanto você montava o pedido. Confira o novo total e confirme de novo.");
  }

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const code = novoCodigoDePedido();
    try {
      return await db().transaction(async (tx) => {
        const [order] = await tx
          .insert(orders)
          .values({
            code,
            token: novoToken(),
            customerName: input.nome,
            customerContact: input.contato,
            delivery: input.entrega,
            cep: input.entrega === "envio" ? input.cep : null,
            address: input.entrega === "envio" ? input.endereco : null,
            notes: input.observacoes || null,
            quantity: quantidade,
            unitCents: totais.unitario,
            subtotalCents: totais.subtotal,
            shippingCents: totais.frete,
            totalCents: totais.total,
            accessoriesCents: totais.acessorios,
            discountCents: totais.desconto,
            combo: totais.combo,
          })
          .returning();
        await tx.insert(orderItems).values(
          input.itens.map((i) => ({
            orderId: order.id,
            printId: i.printId,
            oracleId: i.oracleId,
            name: i.name,
            printedName: i.printedName ?? null,
            setCode: i.set,
            collectorNumber: i.collectorNumber,
            lang: i.lang,
            translated: i.traduzida,
            image: i.image,
            quantity: i.qty,
          })),
        );
        if (linhas.length) {
          await tx.insert(orderAccessories).values(
            linhas.map((l) => ({
              orderId: order.id,
              productId: l.produto.id,
              kind: l.produto.tipo,
              name: l.produto.nome,
              description: l.produto.descricao,
              unitCents: l.produto.centavos,
              quantity: l.qty,
            })),
          );
        }
        return order;
      });
    } catch (err) {
      // Código repetido (raríssimo): sorteia outro.
      if (String(err).includes("UNIQUE") && tentativa < 4) continue;
      throw err;
    }
  }
  throw new Error("Não foi possível gerar um código de pedido");
}

export type PedidoCompleto = { order: Order; items: OrderItem[]; accessories: OrderAccessory[]; payments: Payment[] };

async function completar(order: Order | undefined): Promise<PedidoCompleto | null> {
  if (!order) return null;
  const [items, accessories, pays] = await Promise.all([
    db().select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(orderItems.id),
    db().select().from(orderAccessories).where(eq(orderAccessories.orderId, order.id)).orderBy(orderAccessories.id),
    db().select().from(payments).where(eq(payments.orderId, order.id)).orderBy(payments.id),
  ]);
  return { order, items, accessories, payments: pays };
}

export async function pedidoPorToken(token: string): Promise<PedidoCompleto | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [order] = await db().select().from(orders).where(eq(orders.token, token)).limit(1);
  return completar(order);
}

export async function pedidoPorCodigo(code: string): Promise<PedidoCompleto | null> {
  if (!/^PX-[0-9A-Z]{4}$/.test(code)) return null;
  const [order] = await db().select().from(orders).where(eq(orders.code, code)).limit(1);
  return completar(order);
}

export type Filtro = "abertos" | "enviados" | "todos";

export async function listarPedidos(filtro: Filtro) {
  const where =
    filtro === "abertos"
      ? inArray(orders.status, ["recebido", "pago", "producao"])
      : filtro === "enviados"
        ? eq(orders.status, "enviado")
        : undefined;
  const ptCount = sql<number>`(
    select coalesce(sum(${orderItems.quantity}), 0) from ${orderItems}
    where ${orderItems.orderId} = ${orders.id} and ${orderItems.lang} = 'pt'
  )`;
  return db()
    .select({ order: orders, emPortugues: ptCount })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.id))
    .limit(200);
}

export async function contarNovos(): Promise<number> {
  const [r] = await db()
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.status, "recebido"));
  return Number(r?.n ?? 0);
}

const AGORA = sql`(CURRENT_TIMESTAMP)`;

/** Mudança de status feita pelo painel. */
export async function mudarStatus(code: string, status: Status, tracking?: string): Promise<void> {
  const atual = await pedidoPorCodigo(code);
  if (!atual) throw new Error("Pedido não encontrado");

  if (status === "pago" && atual.order.status === "recebido") {
    await db().transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ status: "pago", paidAt: AGORA, paymentMethod: atual.order.paymentMethod ?? "pix" })
        .where(eq(orders.id, atual.order.id));
      await tx.insert(payments).values({
        orderId: atual.order.id,
        provider: "pix",
        status: "confirmado no painel",
        amountCents: atual.order.totalCents,
      });
    });
    return;
  }

  await db()
    .update(orders)
    .set({
      status,
      ...(status === "enviado" ? { shippedAt: AGORA, tracking: tracking?.trim() || null } : {}),
    })
    .where(eq(orders.id, atual.order.id));
}

export type Conciliacao = "pago" | "ja-registrado" | "nao-aprovado" | "nao-confere" | "desconhecido";

/**
 * Confere um pagamento do Mercado Pago e, se estiver aprovado no valor certo,
 * marca o pedido como pago. Pode ser chamada várias vezes para o mesmo
 * pagamento (o webhook é reenviado): só a primeira altera o pedido.
 */
export async function conciliarPagamentoMP(paymentId: string): Promise<Conciliacao> {
  const pagamento = await consultarPagamento(paymentId);
  if (!pagamento || !pagamento.externalReference) return "desconhecido";

  const pedido = await pedidoPorCodigo(pagamento.externalReference);
  if (!pedido) return "desconhecido";
  if (pagamento.status !== "approved") return "nao-aprovado";
  if (pagamento.moeda !== "BRL" || pagamento.centavos < pedido.order.totalCents) return "nao-confere";

  const inseridos = await db()
    .insert(payments)
    .values({
      orderId: pedido.order.id,
      provider: "mercadopago",
      providerPaymentId: pagamento.id,
      status: pagamento.status,
      amountCents: pagamento.centavos,
    })
    .onConflictDoNothing()
    .returning({ id: payments.id });
  if (inseridos.length === 0) return "ja-registrado";

  await db()
    .update(orders)
    .set({ status: "pago", paidAt: AGORA, paymentMethod: "mercadopago" })
    .where(and(eq(orders.id, pedido.order.id), eq(orders.status, "recebido")));
  return "pago";
}
