import { loja } from "@/config/loja";

export type Entrega = "envio" | "retirada";

/** Preço por carta, em centavos, para um pedido com `quantidade` cartas. */
export function precoPorCarta(quantidade: number): number {
  let preco: number = loja.faixasDePreco[0].centavos;
  for (const faixa of loja.faixasDePreco) {
    if (quantidade >= faixa.aPartirDe) preco = faixa.centavos;
  }
  return preco;
}

/** Próxima faixa de preço acima de `quantidade`, ou null se já é a última. */
export function proximaFaixa(quantidade: number) {
  const proxima = loja.faixasDePreco.find((f) => f.aPartirDe > quantidade);
  if (!proxima) return null;
  return { faltam: proxima.aPartirDe - quantidade, centavos: proxima.centavos };
}

export function calcularTotais(quantidade: number, entrega: Entrega) {
  const unitario = precoPorCarta(quantidade);
  const subtotal = unitario * quantidade;
  const frete = entrega === "envio" && quantidade > 0 ? loja.freteFixoCentavos : 0;
  return { unitario, subtotal, frete, total: subtotal + frete };
}

export function folhas(quantidade: number): number {
  return Math.ceil(quantidade / loja.cartasPorFolha);
}
