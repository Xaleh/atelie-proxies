import { z } from "zod";

/**
 * Acessórios que a cliente pode levar junto com as cartas (sleeves e deckbox)
 * e os combos que dão desconto. O catálogo e os descontos são definidos no
 * painel e ficam no banco. Preços em centavos.
 */
export const TIPOS = ["sleeve", "deckbox"] as const;
export type Tipo = (typeof TIPOS)[number];

export const NOME_DO_TIPO: Record<Tipo, { um: string; varios: string }> = {
  sleeve: { um: "Sleeves", varios: "Sleeves" },
  deckbox: { um: "Deckbox", varios: "Deckboxes" },
};

export type Produto = {
  id: number;
  tipo: Tipo;
  nome: string;
  /** Detalhe curto: quantidade no pacote, cor, tamanho. */
  descricao: string;
  centavos: number;
  /** Falso tira o produto da loja sem apagar do painel. */
  disponivel: boolean;
};

/**
 * Desconto de um combo. "percentual": `valor` em centésimos de 1% (750 = 7,5%).
 * "fixo": `valor` em centavos. Zero quer dizer que o combo não dá desconto.
 */
export type Desconto = { tipo: "percentual" | "fixo"; valor: number };

/** Os três combos: cartas + sleeves, cartas + deckbox, e cartas + os dois. */
export type Combos = { sleeves: Desconto; deckbox: Desconto; completo: Desconto };
export type Combo = keyof Combos;

export const COMBOS: Combo[] = ["sleeves", "deckbox", "completo"];
export const ROTULO_DO_COMBO: Record<Combo, string> = {
  sleeves: "cartas + sleeves",
  deckbox: "cartas + deckbox",
  completo: "cartas + sleeves + deckbox",
};

const SEM_DESCONTO: Desconto = { tipo: "percentual", valor: 0 };
export const COMBOS_PADRAO: Combos = { sleeves: SEM_DESCONTO, deckbox: SEM_DESCONTO, completo: SEM_DESCONTO };

export const LIMITES_DE_ACESSORIOS = { centavos: 100_000, produtos: 60, porProduto: 20, percentual: 10_000 } as const;

/** O que a cliente escolheu: o produto e quantas unidades. */
export type Escolha = { id: number; qty: number };
export type Linha = { produto: Produto; qty: number };

/** Junta as escolhas com o catálogo em vigor. Produto que saiu da loja é deixado de fora. */
export function linhasDe(escolhas: Escolha[], produtos: Produto[]): Linha[] {
  const linhas: Linha[] = [];
  for (const e of escolhas) {
    const produto = produtos.find((p) => p.id === e.id && p.disponivel);
    if (produto && e.qty > 0) linhas.push({ produto, qty: Math.min(e.qty, LIMITES_DE_ACESSORIOS.porProduto) });
  }
  return linhas;
}

/** Qual combo o pedido forma. Sem cartas não há combo. */
export function comboDoPedido(cartas: number, linhas: Linha[]): Combo | null {
  if (cartas < 1) return null;
  const sleeves = linhas.some((l) => l.produto.tipo === "sleeve");
  const deckbox = linhas.some((l) => l.produto.tipo === "deckbox");
  if (sleeves && deckbox) return "completo";
  if (sleeves) return "sleeves";
  if (deckbox) return "deckbox";
  return null;
}

/** Desconto em centavos sobre `base` (cartas + acessórios). Nunca passa da base. */
export function descontoEmCentavos(desconto: Desconto, base: number): number {
  const bruto = desconto.tipo === "percentual" ? Math.round((base * desconto.valor) / 10_000) : desconto.valor;
  return Math.max(0, Math.min(base, bruto));
}

/** "10%" ou "R$ 5,00", para mostrar na loja e no painel. */
export function descontoPorExtenso(desconto: Desconto): string {
  if (desconto.tipo === "percentual") return `${(desconto.valor / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  return (desconto.valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const descontoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("percentual"), valor: z.number().int().min(0).max(LIMITES_DE_ACESSORIOS.percentual) }),
  z.object({ tipo: z.literal("fixo"), valor: z.number().int().min(0).max(LIMITES_DE_ACESSORIOS.centavos) }),
]);

export const combosSchema = z.object({ sleeves: descontoSchema, deckbox: descontoSchema, completo: descontoSchema });

/** Um produto como o painel manda gravar; sem `id`, é um produto novo. */
export const produtoParaSalvarSchema = z.object({
  id: z.number().int().positive().optional(),
  tipo: z.enum(TIPOS),
  nome: z.string().trim().min(2, "Dê um nome ao acessório").max(80),
  descricao: z.string().trim().max(160).default(""),
  centavos: z.number().int().min(1, "O preço do acessório precisa ser maior que zero").max(LIMITES_DE_ACESSORIOS.centavos),
  disponivel: z.boolean(),
});
export type ProdutoParaSalvar = z.infer<typeof produtoParaSalvarSchema>;

export const acessoriosParaSalvarSchema = z.object({
  produtos: z.array(produtoParaSalvarSchema).max(LIMITES_DE_ACESSORIOS.produtos),
  combos: combosSchema,
});

/** "7,5" vira 750 (centésimos de 1%). Devolve null se não for um percentual de 0 a 100. */
export function percentualDe(texto: string): number | null {
  const t = texto.trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const v = Math.round(parseFloat(t) * 100);
  return v <= LIMITES_DE_ACESSORIOS.percentual ? v : null;
}
