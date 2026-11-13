import { describe, expect, it } from "vitest";
import { loja } from "@/config/loja";
import { calcularTotais, folhas, precoPorCarta, proximaFaixa } from "@/lib/pricing";
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
