import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loja } from "@/config/loja";
import { calcularTotais } from "@/lib/pricing";
import { COMBOS_PADRAO, acessoriosParaSalvarSchema } from "@/lib/acessorios";
import { VALORES_PADRAO } from "@/lib/valores";
import type { Valores } from "@/lib/valores";

/** Tabela de preços sem acessórios, como a loja começa. */
const tabelaCom = (valores: Valores) => ({ valores, produtos: [], combos: COMBOS_PADRAO });
const V = tabelaCom(VALORES_PADRAO);

const dir = mkdtempSync(join(tmpdir(), "pdr-"));
process.env.TURSO_DATABASE_URL = `file:${join(dir, "teste.db")}`;
process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token";

const { PedidoRecusado, conciliarPagamentoMP, criarPedido, mudarStatus, pedidoPorCodigo, pedidoPorToken, pedidoSchema, listarPedidos } =
  await import("@/lib/orders");
const { salvarValores, valoresDaLoja } = await import("@/lib/valores-servidor");
const { FotoRecusada, fotoDoProduto, listarProdutos, salvarAcessorios, tabelaDaLoja } = await import("@/lib/acessorios-servidor");

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
    const esperado = calcularTotais(VALORES_PADRAO, 24, "envio");

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

    const order = await criarPedido(pedidoSchema.parse({ ...base, itens: [item(3)], totalEsperado: 3 * 700 + 1500 }), tabelaCom(valores));
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
    await expect(criarPedido(comTotalAntigo, tabelaCom(valores))).rejects.toMatchObject({ motivo: "preco" });
    const demais = pedidoSchema.parse({ ...base, itens: [item(11)] });
    await expect(criarPedido(demais, tabelaCom(valores))).rejects.toBeInstanceOf(PedidoRecusado);
    await expect(criarPedido(demais, tabelaCom(valores))).rejects.toMatchObject({ motivo: "limite" });
  });

  it("leva acessórios, aplica o combo e guarda nome e preço no pedido", async () => {
    await salvarAcessorios({
      produtos: [
        { tipo: "sleeve", nome: "Sleeves pretos", descricao: "100 unidades", centavos: 3000, disponivel: true },
        { tipo: "deckbox", nome: "Deckbox 100+", descricao: "", centavos: 4500, disponivel: true },
        { tipo: "deckbox", nome: "Deckbox esgotado", descricao: "", centavos: 5000, disponivel: false },
      ],
      combos: { sleeves: { tipo: "percentual", valor: 500 }, deckbox: { tipo: "fixo", valor: 300 }, completo: { tipo: "percentual", valor: 1000 } },
    });
    await salvarValores(VALORES_PADRAO);
    const tabela = await tabelaDaLoja();
    expect(tabela.produtos.map((p) => p.nome)).toEqual(["Sleeves pretos", "Deckbox 100+"]); // o indisponível não vai para a loja
    const [sleeve, deckbox] = tabela.produtos;

    // 20 cartas × 3,50 = 70,00; + 2 sleeves (60,00) + 1 deckbox (45,00) = 175,00; combo completo 10% = 17,50; + frete 20,00
    const input = pedidoSchema.parse({ ...base, itens: [item(20)], acessorios: [{ id: sleeve.id, qty: 2 }, { id: deckbox.id, qty: 1 }], totalEsperado: 17750 });
    const order = await criarPedido(input, tabela);
    expect(order).toMatchObject({ subtotalCents: 7000, accessoriesCents: 10500, discountCents: 1750, combo: "completo", shippingCents: 2000, totalCents: 17750 });
    const completo = await pedidoPorCodigo(order.code);
    expect(completo?.accessories.map((a) => [a.kind, a.name, a.unitCents, a.quantity])).toEqual([
      ["sleeve", "Sleeves pretos", 3000, 2],
      ["deckbox", "Deckbox 100+", 4500, 1],
    ]);

    // o painel muda o preço, renomeia e depois apaga: o pedido feito não muda
    const todos = await listarProdutos();
    await salvarAcessorios({ produtos: [{ ...todos[0], imagem: { acao: "manter" }, nome: "Sleeves azuis", centavos: 9900 }], combos: tabela.combos });
    const depois = await listarProdutos();
    expect(depois).toHaveLength(1);
    expect(depois[0]).toMatchObject({ id: sleeve.id, nome: "Sleeves azuis", centavos: 9900 }); // mesmo produto, atualizado
    expect((await pedidoPorCodigo(order.code))?.accessories[0]).toMatchObject({ name: "Sleeves pretos", unitCents: 3000 });
    expect((await pedidoPorCodigo(order.code))?.order.totalCents).toBe(17750);
  });

  it("recusa acessório que saiu da loja e total que não bate com o combo", async () => {
    const tabela = await tabelaDaLoja();
    const sumiu = pedidoSchema.parse({ ...base, itens: [item(1)], acessorios: [{ id: 99999, qty: 1 }] });
    await expect(criarPedido(sumiu, tabela)).rejects.toMatchObject({ motivo: "acessorio" });
    const semDesconto = pedidoSchema.parse({ ...base, entrega: "retirada", itens: [item(1)], acessorios: [{ id: tabela.produtos[0].id, qty: 1 }], totalEsperado: 400 + 9900 });
    await expect(criarPedido(semDesconto, tabela)).rejects.toMatchObject({ motivo: "preco" }); // faltou o desconto de 5%
    expect(pedidoSchema.safeParse({ ...base, itens: [item(1)], acessorios: [{ id: 1, qty: 1 }, { id: 1, qty: 2 }] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, itens: [item(1)], acessorios: [{ id: 1, qty: 0 }] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, itens: [], acessorios: [{ id: 1, qty: 1 }] }).success).toBe(false); // acessório sem carta não fecha
  });

  it("guarda, troca e tira a foto do acessório, e recusa o que não é JPEG", async () => {
    const jpeg = (enchimento: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, enchimento), Buffer.from([0xff, 0xd9])]);
    const combos = (await tabelaDaLoja()).combos;
    const [atual] = await listarProdutos();
    expect(atual.imagem).toBeNull();
    const base = { id: atual.id, tipo: atual.tipo, nome: atual.nome, descricao: atual.descricao, centavos: atual.centavos, disponivel: true };

    await salvarAcessorios({ produtos: [{ ...base, imagem: { acao: "nova", dados: jpeg(1).toString("base64") } }], combos });
    const [comFoto] = await listarProdutos();
    expect(comFoto.imagem).toMatch(new RegExp(`^/api/acessorios/${atual.id}/imagem\\?v=[0-9a-f]{16}$`));
    expect((await fotoDoProduto(atual.id))?.data.equals(jpeg(1))).toBe(true);

    // salvar sem mexer na foto mantém a mesma; trocar muda o endereço (para o cache do navegador não segurar a antiga)
    await salvarAcessorios({ produtos: [{ ...base, nome: "Outro nome" }], combos });
    expect((await listarProdutos())[0].imagem).toBe(comFoto.imagem);
    await salvarAcessorios({ produtos: [{ ...base, imagem: { acao: "nova", dados: jpeg(2).toString("base64") } }], combos });
    expect((await listarProdutos())[0].imagem).not.toBe(comFoto.imagem);

    // arquivo que não é JPEG (aqui, um SVG com script) é recusado e nada muda
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64");
    await expect(salvarAcessorios({ produtos: [{ ...base, nome: "Não grava", imagem: { acao: "nova", dados: svg } }], combos })).rejects.toBeInstanceOf(FotoRecusada);
    expect((await listarProdutos())[0].nome).toBe(base.nome);
    const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(400_001)]).toString("base64");
    expect(acessoriosParaSalvarSchema.safeParse({ produtos: [{ ...base, imagem: { acao: "nova", dados: grande } }], combos }).success).toBe(false);

    await salvarAcessorios({ produtos: [{ ...base, imagem: { acao: "remover" } }], combos });
    expect((await listarProdutos())[0].imagem).toBeNull();
    expect(await fotoDoProduto(atual.id)).toBeNull();

    // apagar o produto leva a foto junto
    await salvarAcessorios({ produtos: [{ ...base, imagem: { acao: "nova", dados: jpeg(3).toString("base64") } }], combos });
    await salvarAcessorios({ produtos: [], combos });
    expect(await fotoDoProduto(atual.id)).toBeNull();
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
