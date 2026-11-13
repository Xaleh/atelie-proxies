import { z } from "zod";
import { loja } from "@/config/loja";

/**
 * Valores que o ateliê muda pelo painel: preço por carta, frete e limite do
 * pedido. Ficam no banco; enquanto ninguém salvar nada, valem os de
 * `src/config/loja.ts`. Tudo em centavos.
 */
export type Faixa = { aPartirDe: number; centavos: number };

export type Valores = {
  /** Preço por carta conforme a quantidade total do pedido, em ordem crescente. */
  faixasDePreco: Faixa[];
  /** Frete único do envio. Retirada não paga frete. */
  freteFixoCentavos: number;
  maxCartasPorPedido: number;
};

export const VALORES_PADRAO: Valores = {
  faixasDePreco: loja.faixasDePreco.map((f) => ({ ...f })),
  freteFixoCentavos: loja.freteFixoCentavos,
  maxCartasPorPedido: loja.maxCartasPorPedido,
};

/** Teto que o painel não deixa passar, para um erro de digitação não virar preço. */
export const LIMITES = { centavos: 100_000, faixas: 8, cartasPorPedido: 2000 } as const;

export const valoresSchema = z
  .object({
    faixasDePreco: z
      .array(
        z.object({
          aPartirDe: z.number().int().min(1).max(LIMITES.cartasPorPedido),
          centavos: z.number().int().min(1, "O preço por carta precisa ser maior que zero").max(LIMITES.centavos),
        }),
      )
      .min(1)
      .max(LIMITES.faixas),
    freteFixoCentavos: z.number().int().min(0).max(LIMITES.centavos),
    maxCartasPorPedido: z.number().int().min(1).max(LIMITES.cartasPorPedido),
  })
  .superRefine((v, ctx) => {
    if (!v.faixasDePreco.length) return;
    if (v.faixasDePreco[0].aPartirDe !== 1) {
      ctx.addIssue({ code: "custom", path: ["faixasDePreco"], message: "A primeira faixa precisa começar em 1 carta" });
    }
    for (let i = 1; i < v.faixasDePreco.length; i++) {
      if (v.faixasDePreco[i].aPartirDe <= v.faixasDePreco[i - 1].aPartirDe) {
        ctx.addIssue({ code: "custom", path: ["faixasDePreco"], message: "Cada faixa precisa começar numa quantidade maior que a anterior" });
        break;
      }
    }
  });

/** "4,50" ou "4.5" viram 450. Devolve null se não for um valor em reais. */
export function centavosDe(texto: string): number | null {
  let t = texto.trim().replace(/^R\$\s*/i, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

/** 450 vira "4,50", para os campos do painel. */
export function reaisDe(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}
