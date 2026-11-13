/**
 * Configuração da loja. Preços e frete estão em centavos.
 *
 * `faixasDePreco`, `freteFixoCentavos` e `maxCartasPorPedido` são só os
 * valores iniciais: o ateliê muda os três em /admin/valores, e o que for
 * salvo lá fica no banco e passa a valer no lugar destes.
 */
export const loja = {
  nome: "Proxy do Reis",
  descricao: "Ateliê de proxies",
  /** Preço por carta conforme a quantidade total do pedido. */
  faixasDePreco: [
    { aPartirDe: 1, centavos: 400 },
    { aPartirDe: 20, centavos: 350 },
    { aPartirDe: 60, centavos: 300 },
    { aPartirDe: 100, centavos: 250 },
  ],
  /** Frete único para envio pelos Correios. Retirada não paga frete. */
  freteFixoCentavos: 2000,
  /** Limites de um pedido. */
  maxCartasPorPedido: 600,
  maxCopiasPorCarta: 99,
  /** Cartas por folha A4, usado só para informar a cliente. */
  cartasPorFolha: 8,
} as const;

export type FaixaDePreco = (typeof loja.faixasDePreco)[number];
