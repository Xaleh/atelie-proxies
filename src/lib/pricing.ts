import { loja } from "@/config/loja";
import type { Valores } from "./valores";

export type Entrega = "envio" | "retirada";

/** Preço por carta, em centavos, para um pedido com `quantidade` cartas. */
export function precoPorCarta(valores: Valores, quantidade: number): number {
  let preco = valores.faixasDePreco[0].centavos;
  for (const faixa of valores.faixasDePreco) {
    if (quantidade >= faixa.aPartirDe) preco = faixa.centavos;
  }
  return preco;
}

/** Próxima faixa mais barata acima de `quantidade`, ou null se não há. */
export function proximaFaixa(valores: Valores, quantidade: number) {
  const atual = precoPorCarta(valores, quantidade);
  const proxima = valores.faixasDePreco.find((f) => f.aPartirDe > quantidade && f.centavos < atual);
  if (!proxima) return null;
  return { faltam: proxima.aPartirDe - quantidade, centavos: proxima.centavos };
}

export function calcularTotais(valores: Valores, quantidade: number, entrega: Entrega) {
  const unitario = precoPorCarta(valores, quantidade);
  const subtotal = unitario * quantidade;
  const frete = entrega === "envio" && quantidade > 0 ? valores.freteFixoCentavos : 0;
  return { unitario, subtotal, frete, total: subtotal + frete };
}

export function folhas(quantidade: number): number {
  return Math.ceil(quantidade / loja.cartasPorFolha);
}
