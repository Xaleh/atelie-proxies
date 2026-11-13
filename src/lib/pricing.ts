import { loja } from "@/config/loja";
import { comboDoPedido, descontoEmCentavos, type Combo, type Combos, type Linha, type Produto } from "./acessorios";
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

/** Tudo o que define o preço de um pedido, como está em vigor no painel. */
export type Tabela = {
  valores: Valores;
  /** Acessórios disponíveis na loja. */
  produtos: Produto[];
  combos: Combos;
};

export type TotaisDoPedido = {
  unitario: number;
  /** Só as cartas. */
  subtotal: number;
  acessorios: number;
  combo: Combo | null;
  desconto: number;
  frete: number;
  total: number;
};

/**
 * Conta completa do pedido: cartas, acessórios, desconto do combo e frete.
 * O desconto vale sobre cartas + acessórios; o frete fica de fora.
 */
export function calcularPedido(tabela: Tabela, quantidade: number, entrega: Entrega, linhas: Linha[]): TotaisDoPedido {
  const cartas = calcularTotais(tabela.valores, quantidade, entrega);
  const acessorios = linhas.reduce((n, l) => n + l.produto.centavos * l.qty, 0);
  const formado = comboDoPedido(quantidade, linhas);
  const desconto = formado ? descontoEmCentavos(tabela.combos[formado], cartas.subtotal + acessorios) : 0;
  return {
    unitario: cartas.unitario,
    subtotal: cartas.subtotal,
    acessorios,
    combo: desconto > 0 ? formado : null,
    desconto,
    frete: cartas.frete,
    total: cartas.subtotal + acessorios - desconto + cartas.frete,
  };
}

export function folhas(quantidade: number): number {
  return Math.ceil(quantidade / loja.cartasPorFolha);
}
