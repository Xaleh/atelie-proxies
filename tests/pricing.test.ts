import { describe, expect, it } from "vitest";
import { loja } from "@/config/loja";
import { calcularTotais, folhas, precoPorCarta, proximaFaixa } from "@/lib/pricing";

const [f1, f2] = loja.faixasDePreco;

describe("preço por faixa", () => {
  it("usa a faixa da quantidade total", () => {
    expect(precoPorCarta(1)).toBe(f1.centavos);
    expect(precoPorCarta(f2.aPartirDe - 1)).toBe(f1.centavos);
    expect(precoPorCarta(f2.aPartirDe)).toBe(f2.centavos);
    expect(precoPorCarta(100000)).toBe(loja.faixasDePreco.at(-1)!.centavos);
  });

  it("diz quanto falta para a próxima faixa", () => {
    expect(proximaFaixa(1)).toEqual({ faltam: f2.aPartirDe - 1, centavos: f2.centavos });
    expect(proximaFaixa(100000)).toBeNull();
  });
});

describe("totais", () => {
  it("soma frete só no envio", () => {
    const envio = calcularTotais(18, "envio");
    const retirada = calcularTotais(18, "retirada");
    expect(envio.subtotal).toBe(18 * precoPorCarta(18));
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
