/**
 * Configuração da loja. Preços e frete estão em centavos.
 *
 * ATENÇÃO: os valores de `faixasDePreco` e `freteFixoCentavos` são
 * provisórios. Ajuste antes de divulgar o site.
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
