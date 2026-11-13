import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loja } from "@/config/loja";
import { calcularTotais } from "@/lib/pricing";
import { VALORES_PADRAO as V } from "@/lib/valores";

const dir = mkdtempSync(join(tmpdir(), "pdr-"));
process.env.TURSO_DATABASE_URL = `file:${join(dir, "teste.db")}`;
process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token";

const { PedidoRecusado, conciliarPagamentoMP, criarPedido, mudarStatus, pedidoPorCodigo, pedidoPorToken, pedidoSchema, listarPedidos } =
  await import("@/lib/orders");
const { salvarValores, valoresDaLoja } = await import("@/lib/valores-servidor");

const item = (qty: number, lang: "en" | "pt" = "en") => ({
  printId: "11111111-1111-4111-8111-111111111111",
  oracleId: "22222222-2222-4222-8222-222222222222",
  name: "Sol Ring",
  printedName: lang === "pt" ? "Anel Solar" : null,
  set: "c21",
  collectorNumber: "263",
  lang,
  image: "https://cards.scryfall.io/normal/front/1/1/11111111.jpg",
  qty,
});

const base = {
  nome: "Marina Albuquerque",
  contato: "marina@exemplo.com",
  entrega: "envio" as const,
  cep: "30000-000",
  endereco: "Rua das Cartas, 100, Cidade Exemplo, EX",
  observacoes: "",
  site: "",
};

function mockPagamento(p: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(p), { status: 200, headers: { "Content-Type": "application/json" } })),
  );
}

beforeAll(async () => {
  const client = createClient({ url: process.env.TURSO_DATABASE_URL! });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  client.close();
});

afterEach(() => vi.unstubAllGlobals());

describe("validação do pedido", () => {
  it("exige CEP e endereço só no envio", () => {
    expect(pedidoSchema.safeParse({ ...base, cep: "", endereco: "", itens: [item(1)] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, entrega: "retirada", cep: "", endereco: "", itens: [item(1)] }).success).toBe(true);
  });

  it("recusa imagem fora do Scryfall, pedido vazio e campo-isca preenchido", () => {
    const fora = { ...item(1), image: "https://exemplo.com/x.jpg" };
    expect(pedidoSchema.safeParse({ ...base, itens: [fora] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, itens: [] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, site: "http://spam", itens: [item(1)] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, itens: [item(loja.maxCopiasPorCarta + 1)] }).success).toBe(false);
  });
});

describe("pedido", () => {
  it("grava com o preço calculado no servidor e aparece pelos dois links", async () => {
    const input = pedidoSchema.parse({ ...base, itens: [item(4, "pt"), { ...item(20), oracleId: "33333333-3333-4333-8333-333333333333" }] });
    const order = await criarPedido(input, V);
    const esperado = calcularTotais(V, 24, "envio");

    expect(order.code).toMatch(/^PX-[0-9A-Z]{4}$/);
    expect(order.status).toBe("recebido");
    expect(order.totalCents).toBe(esperado.total);
    expect(order.unitCents).toBe(esperado.unitario);

    const porToken = await pedidoPorToken(order.token);
    const porCodigo = await pedidoPorCodigo(order.code);
    expect(porToken?.items).toHaveLength(2);
    expect(porCodigo?.order.id).toBe(order.id);
    expect(await pedidoPorToken("token-que-nao-existe-000000")).toBeNull();

    const lista = await listarPedidos("abertos");
    expect(lista.find((l) => l.order.id === order.id)?.emPortugues).toBe(4);
  });

  it("usa os valores em vigor no painel e guarda o preço no pedido", async () => {
    const caro = { faixasDePreco: [{ aPartirDe: 1, centavos: 700 }], freteFixoCentavos: 1500, maxCartasPorPedido: 10 };
    await salvarValores(caro);
    const { valores, salvoEm } = await valoresDaLoja();
    expect(valores).toEqual(caro);
    expect(salvoEm).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    const order = await criarPedido(pedidoSchema.parse({ ...base, itens: [item(3)], totalEsperado: 3 * 700 + 1500 }), valores);
    expect(order.unitCents).toBe(700);
    expect(order.shippingCents).toBe(1500);
    expect(order.totalCents).toBe(3600);

    // o painel muda o preço depois: o pedido feito continua com o valor antigo
    await salvarValores({ ...caro, faixasDePreco: [{ aPartirDe: 1, centavos: 100 }] });
    expect((await pedidoPorCodigo(order.code))?.order.totalCents).toBe(3600);
    expect((await valoresDaLoja()).valores.faixasDePreco[0].centavos).toBe(100);
  });

  it("recusa o pedido se a cliente viu outro total ou passou do limite", async () => {
    const valores = { faixasDePreco: [{ aPartirDe: 1, centavos: 700 }], freteFixoCentavos: 1500, maxCartasPorPedido: 10 };
    const comTotalAntigo = pedidoSchema.parse({ ...base, itens: [item(3)], totalEsperado: 3 * 400 + 2000 });
    await expect(criarPedido(comTotalAntigo, valores)).rejects.toMatchObject({ motivo: "preco" });
    const demais = pedidoSchema.parse({ ...base, itens: [item(11)] });
    await expect(criarPedido(demais, valores)).rejects.toBeInstanceOf(PedidoRecusado);
    await expect(criarPedido(demais, valores)).rejects.toMatchObject({ motivo: "limite" });
  });

  it("recusa gravar valores inválidos", async () => {
    await expect(salvarValores({ faixasDePreco: [], freteFixoCentavos: 0, maxCartasPorPedido: 10 })).rejects.toThrow();
  });

  it("segue recebido → pago → enviado pelo painel, registrando o Pix", async () => {
    const order = await criarPedido(pedidoSchema.parse({ ...base, entrega: "retirada", itens: [item(2)] }), V);
    await mudarStatus(order.code, "pago");
    let p = await pedidoPorCodigo(order.code);
    expect(p?.order.status).toBe("pago");
    expect(p?.order.paymentMethod).toBe("pix");
    expect(p?.payments).toHaveLength(1);

    await mudarStatus(order.code, "enviado", " AB123456789BR ");
    p = await pedidoPorCodigo(order.code);
    expect(p?.order.status).toBe("enviado");
    expect(p?.order.tracking).toBe("AB123456789BR");
    expect((await listarPedidos("enviados")).some((l) => l.order.id === order.id)).toBe(true);
  });
});

describe("conciliação do Mercado Pago", () => {
  it("marca como pago uma vez só, mesmo com o aviso repetido", async () => {
    const order = await criarPedido(pedidoSchema.parse({ ...base, itens: [item(3)] }), V);
    mockPagamento({ id: 9001, status: "approved", external_reference: order.code, transaction_amount: order.totalCents / 100, currency_id: "BRL" });

    expect(await conciliarPagamentoMP("9001")).toBe("pago");
    expect(await conciliarPagamentoMP("9001")).toBe("ja-registrado");

    const p = await pedidoPorCodigo(order.code);
    expect(p?.order.status).toBe("pago");
    expect(p?.order.paymentMethod).toBe("mercadopago");
    expect(p?.payments).toHaveLength(1);
  });

  it("não marca pagamento pendente, de valor menor ou de pedido desconhecido", async () => {
    const order = await criarPedido(pedidoSchema.parse({ ...base, itens: [item(3)] }), V);

    mockPagamento({ id: 9002, status: "pending", external_reference: order.code, transaction_amount: order.totalCents / 100, currency_id: "BRL" });
    expect(await conciliarPagamentoMP("9002")).toBe("nao-aprovado");

    mockPagamento({ id: 9003, status: "approved", external_reference: order.code, transaction_amount: 0.01, currency_id: "BRL" });
    expect(await conciliarPagamentoMP("9003")).toBe("nao-confere");

    mockPagamento({ id: 9004, status: "approved", external_reference: "PX-ZZZZ", transaction_amount: 999, currency_id: "BRL" });
    expect(await conciliarPagamentoMP("9004")).toBe("desconhecido");

    expect(await conciliarPagamentoMP("não-é-número")).toBe("desconhecido");
    expect((await pedidoPorCodigo(order.code))?.order.status).toBe("recebido");
  });
});
