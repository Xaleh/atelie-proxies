import { describe, expect, it } from "vitest";
import { loja } from "@/config/loja";
import { COMBOS_PADRAO, comboDoPedido, descontoEmCentavos, descontoPorExtenso, linhasDe, percentualDe, type Combos, type Produto } from "@/lib/acessorios";
import { calcularPedido, calcularTotais, folhas, precoPorCarta, proximaFaixa } from "@/lib/pricing";
import { VALORES_PADRAO as V, centavosDe, reaisDe, valoresSchema, type Valores } from "@/lib/valores";

const [f1, f2] = loja.faixasDePreco;

describe("preço por faixa", () => {
  it("usa a faixa da quantidade total", () => {
    expect(precoPorCarta(V, 1)).toBe(f1.centavos);
    expect(precoPorCarta(V, f2.aPartirDe - 1)).toBe(f1.centavos);
    expect(precoPorCarta(V, f2.aPartirDe)).toBe(f2.centavos);
    expect(precoPorCarta(V, 100000)).toBe(loja.faixasDePreco.at(-1)!.centavos);
  });

  it("diz quanto falta para a próxima faixa", () => {
    expect(proximaFaixa(V, 1)).toEqual({ faltam: f2.aPartirDe - 1, centavos: f2.centavos });
    expect(proximaFaixa(V, 100000)).toBeNull();
  });
});

describe("totais", () => {
  it("soma frete só no envio", () => {
    const envio = calcularTotais(V, 18, "envio");
    const retirada = calcularTotais(V, 18, "retirada");
    expect(envio.subtotal).toBe(18 * precoPorCarta(V, 18));
    expect(envio.total).toBe(envio.subtotal + loja.freteFixoCentavos);
    expect(retirada.frete).toBe(0);
    expect(retirada.total).toBe(retirada.subtotal);
  });

  it("conta as folhas de 8 cartas", () => {
    expect(folhas(0)).toBe(0);
    expect(folhas(8)).toBe(1);
    expect(folhas(18)).toBe(3);
  });
});

describe("valores definidos no painel", () => {
  const outros: Valores = {
    faixasDePreco: [
      { aPartirDe: 1, centavos: 500 },
      { aPartirDe: 10, centavos: 450 },
      { aPartirDe: 50, centavos: 480 },
    ],
    freteFixoCentavos: 0,
    maxCartasPorPedido: 200,
  };

  it("o cálculo segue os valores recebidos, não os do arquivo", () => {
    expect(precoPorCarta(outros, 9)).toBe(500);
    expect(precoPorCarta(outros, 10)).toBe(450);
    expect(calcularTotais(outros, 10, "envio")).toEqual({ unitario: 450, subtotal: 4500, frete: 0, total: 4500 });
  });

  it("só anuncia a próxima faixa quando ela é mais barata", () => {
    expect(proximaFaixa(outros, 3)).toEqual({ faltam: 7, centavos: 450 });
    expect(proximaFaixa(outros, 10)).toBeNull(); // a faixa de 50 é mais cara
  });

  it("recusa faixas fora de ordem, sem começar em 1 ou com preço zero", () => {
    expect(valoresSchema.safeParse(outros).success).toBe(true);
    const com = (faixasDePreco: Valores["faixasDePreco"]) => valoresSchema.safeParse({ ...outros, faixasDePreco }).success;
    expect(com([{ aPartirDe: 2, centavos: 500 }])).toBe(false);
    expect(com([{ aPartirDe: 1, centavos: 500 }, { aPartirDe: 1, centavos: 400 }])).toBe(false);
    expect(com([{ aPartirDe: 1, centavos: 500 }, { aPartirDe: 30, centavos: 400 }, { aPartirDe: 20, centavos: 300 }])).toBe(false);
    expect(com([{ aPartirDe: 1, centavos: 0 }])).toBe(false);
    expect(com([])).toBe(false);
    expect(valoresSchema.safeParse({ ...outros, freteFixoCentavos: -1 }).success).toBe(false);
    expect(valoresSchema.safeParse({ ...outros, freteFixoCentavos: 12.5 }).success).toBe(false);
    expect(valoresSchema.safeParse({ ...outros, maxCartasPorPedido: 0 }).success).toBe(false);
  });

  it("lê e escreve reais do jeito que se digita no Brasil", () => {
    expect(centavosDe("4,50")).toBe(450);
    expect(centavosDe("4.5")).toBe(450);
    expect(centavosDe("R$ 20")).toBe(2000);
    expect(centavosDe("1.234,56")).toBe(123456);
    expect(centavosDe("0")).toBe(0);
    expect(centavosDe("3,999")).toBeNull();
    expect(centavosDe("-1")).toBeNull();
    expect(centavosDe("abc")).toBeNull();
    expect(centavosDe("")).toBeNull();
    expect(reaisDe(450)).toBe("4,50");
    expect(reaisDe(2000)).toBe("20,00");
  });
});

describe("acessórios e combos", () => {
  const sleeve: Produto = { id: 1, tipo: "sleeve", nome: "Sleeves", descricao: "", centavos: 3000, disponivel: true, imagem: null };
  const deckbox: Produto = { id: 2, tipo: "deckbox", nome: "Deckbox", descricao: "", centavos: 4500, disponivel: true, imagem: null };
  const esgotado: Produto = { id: 3, tipo: "deckbox", nome: "Esgotado", descricao: "", centavos: 100, disponivel: false, imagem: null };
  const produtos = [sleeve, deckbox, esgotado];
  const combos: Combos = { sleeves: { tipo: "percentual", valor: 500 }, deckbox: { tipo: "fixo", valor: 300 }, completo: { tipo: "percentual", valor: 1250 } };
  const tabela = { valores: V, produtos, combos };

  it("junta as escolhas com o catálogo e ignora o que não está disponível", () => {
    const linhas = linhasDe([{ id: 1, qty: 2 }, { id: 3, qty: 1 }, { id: 77, qty: 1 }, { id: 2, qty: 999 }], produtos);
    expect(linhas.map((l) => [l.produto.id, l.qty])).toEqual([[1, 2], [2, 20]]);
  });

  it("identifica o combo pelo que vai no pedido", () => {
    const s = linhasDe([{ id: 1, qty: 1 }], produtos), d = linhasDe([{ id: 2, qty: 1 }], produtos);
    expect(comboDoPedido(10, [])).toBeNull();
    expect(comboDoPedido(10, s)).toBe("sleeves");
    expect(comboDoPedido(10, d)).toBe("deckbox");
    expect(comboDoPedido(10, [...s, ...d])).toBe("completo");
    expect(comboDoPedido(0, [...s, ...d])).toBeNull(); // sem cartas não há combo
  });

  it("desconta sobre cartas + acessórios e deixa o frete de fora", () => {
    // 10 cartas × 4,00 = 40,00
    expect(calcularPedido(tabela, 10, "envio", [])).toMatchObject({ subtotal: 4000, acessorios: 0, combo: null, desconto: 0, frete: 2000, total: 6000 });
    const s = linhasDe([{ id: 1, qty: 2 }], produtos); // + 60,00 → 5% de 100,00
    expect(calcularPedido(tabela, 10, "envio", s)).toMatchObject({ acessorios: 6000, combo: "sleeves", desconto: 500, total: 4000 + 6000 - 500 + 2000 });
    const d = linhasDe([{ id: 2, qty: 1 }], produtos); // + 45,00 → R$ 3,00 fixo
    expect(calcularPedido(tabela, 10, "retirada", d)).toMatchObject({ combo: "deckbox", desconto: 300, frete: 0, total: 4000 + 4500 - 300 });
    const tudo = linhasDe([{ id: 1, qty: 1 }, { id: 2, qty: 1 }], produtos); // 115,00 → 12,5% = 14,375 → 14,38
    expect(calcularPedido(tabela, 10, "retirada", tudo)).toMatchObject({ combo: "completo", desconto: 1438, total: 11500 - 1438 });
  });

  it("combo sem desconto não aparece, e o desconto fixo nunca passa do valor do pedido", () => {
    const s = linhasDe([{ id: 1, qty: 1 }], produtos);
    expect(calcularPedido({ ...tabela, combos: COMBOS_PADRAO }, 10, "retirada", s)).toMatchObject({ combo: null, desconto: 0, total: 7000 });
    expect(descontoEmCentavos({ tipo: "fixo", valor: 99999 }, 3400)).toBe(3400);
    expect(descontoEmCentavos({ tipo: "percentual", valor: 10000 }, 3400)).toBe(3400);
  });

  it("lê e escreve percentuais", () => {
    expect(percentualDe("10")).toBe(1000);
    expect(percentualDe("7,5")).toBe(750);
    expect(percentualDe("12.25%")).toBe(1225);
    expect(percentualDe("0")).toBe(0);
    expect(percentualDe("101")).toBeNull();
    expect(percentualDe("-5")).toBeNull();
    expect(percentualDe("dez")).toBeNull();
    expect(descontoPorExtenso({ tipo: "percentual", valor: 750 })).toBe("7,5%");
    expect(descontoPorExtenso({ tipo: "fixo", valor: 500 }).replace(/\s/g, " ")).toBe("R$ 5,00");
  });
});
