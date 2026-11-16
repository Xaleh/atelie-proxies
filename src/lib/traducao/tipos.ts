import { z } from "zod";

/**
 * Tipos e regras da tradução que valem no servidor e no navegador.
 * O texto em português é escrito sobre a arte em inglês por um "molde": o
 * automático, para a moldura de 2015 e as antigas (1993, 1997 e 2003), ou um
 * manual, marcado no painel para uma impressão específica.
 */

export type FonteDaTraducao = "manual" | "arena" | "oficial";

export type Traducao = {
  nome: string;
  tipo: string;
  texto: string;
  sabor: string;
  fonte: FonteDaTraducao;
};

/** O que o renderizador precisa saber de cada face da impressão em inglês. */
export type MetaDeFace = {
  nome: string;
  tipo: string;
  texto: string;
  /** A arte original tem texto de ambientação. */
  sabor: boolean;
  mana: string;
  /** A carta tem caixa de poder/resistência. */
  temPT: boolean;
};

export type MetaDeImpressao = {
  frame: string;
  layout: string;
  borda: string;
  fullArt: boolean;
  tipo: string;
  /** `frame_effects` do Scryfall ("showcase", "extendedart"…). Falta nas impressões guardadas antes de o campo existir. */
  efeitos?: string[];
  faces: MetaDeFace[];
};

const LAYOUTS_DE_DUAS_FACES = ["transform", "modal_dfc", "double_faced_token", "reversible_card"];

/**
 * Quantas cartas físicas a impressão ocupa na folha: o verso das cartas de
 * duas faces é impresso como uma carta a mais.
 */
export function facesFisicas(meta: MetaDeImpressao | undefined | null): number {
  if (!meta || !LAYOUTS_DE_DUAS_FACES.includes(meta.layout)) return 1;
  return Math.max(1, meta.faces.length);
}

/** Retângulo em fração da largura e da altura da imagem (0 a 1). */
export type Ret = { x: number; y: number; w: number; h: number };

export type MoldeManual = {
  modo: "manual";
  nome: Ret | null;
  tipo: Ret | null;
  texto: Ret | null;
  /** "limpar" apaga só as letras; "cor" pinta a caixa de uma cor; "desfoque" borra e escurece a arte. */
  fundo: "limpar" | "cor" | "desfoque";
  corTexto: "auto" | "claro" | "escuro";
};

/** "bloqueado" marca uma arte que não deve receber tradução. */
export type Molde = MoldeManual | { modo: "bloqueado" };

const ret = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0.01).max(1),
    h: z.number().min(0.01).max(1),
  })
  .refine((r) => r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001, "retângulo fora da carta");

export const moldeSchema = z.discriminatedUnion("modo", [
  z.object({
    modo: z.literal("manual"),
    nome: ret.nullable(),
    tipo: ret.nullable(),
    texto: ret.nullable(),
    fundo: z.enum(["limpar", "cor", "desfoque"]),
    corTexto: z.enum(["auto", "claro", "escuro"]),
  }),
  z.object({ modo: z.literal("bloqueado") }),
]);

export const traducaoSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  tipo: z.string().trim().max(200),
  texto: z.string().trim().max(2000),
  sabor: z.string().trim().max(600).default(""),
});

/** Chave de uma face pelo nome em inglês, como o extrator do Arena grava. */
export function chaveDoNome(nome: string): string {
  return nome.trim().toLowerCase();
}

/** Chave da ambientação, que muda de edição para edição. */
export function chaveDoSabor(nome: string, set: string, num: string): string {
  return `${chaveDoNome(nome)}|${set.toLowerCase()}|${num}`;
}

const TIPOS_SEM_MOLDE = /Planeswalker|Battle|Class|Case|Siege/i;

const MOLDURAS_ANTIGAS = ["1993", "1997", "2003"];

/**
 * Carta de aventura: uma imagem só, com dois textos. A parte 0 é a criatura
 * (ou outra permanente) e a parte 1 é a aventura, na página esquerda do livro.
 */
export function ehAventura(meta: MetaDeImpressao | undefined | null): boolean {
  return meta?.layout === "adventure" && meta.faces.length > 1;
}

/**
 * Nomes em inglês dos textos que uma face física leva. Quase sempre é um só;
 * na aventura são dois, e os dois precisam de tradução para a carta sair em
 * português.
 */
export function nomesDaFace(meta: MetaDeImpressao | undefined | null, face: number, padrao: string): string[] {
  if (meta && ehAventura(meta)) return [meta.faces[0].nome, meta.faces[1].nome];
  return [meta?.faces[face]?.nome ?? padrao];
}

/**
 * Molduras que o molde automático sabe reescrever: a moderna (2015, inclusive
 * as aventuras e as sagas que transformam; a saga comum tem layout próprio e
 * fica de fora) e as antigas (1993, 1997 e 2003, inclusive as reimpressões
 * "retrô"), estas só em cartas de layout comum. A moldura certa não basta: na hora de desenhar, o
 * renderizador ainda confere a diagramação da imagem (arte que ocupa a carta
 * toda, por exemplo, fica de fora).
 */
export function aceitaMoldeAutomatico(meta: MetaDeImpressao | undefined | null): boolean {
  if (!meta || TIPOS_SEM_MOLDE.test(meta.tipo)) return false;
  if (/Saga/i.test(meta.tipo) && meta.frame !== "2015") return false; // sagas: só a moldura moderna
  if (meta.frame === "2015") return ["normal", "transform", "modal_dfc", "adventure"].includes(meta.layout);
  if (MOLDURAS_ANTIGAS.includes(meta.frame)) return meta.layout === "normal";
  return false;
}

/** Terreno básico de arte inteira: o nome fica em cima e o tipo numa barra embaixo, sem caixa de texto. */
export function basicoDeArteInteira(meta: MetaDeImpressao): boolean {
  return meta.fullArt && /\bBasic\b.*\bLand\b/i.test(meta.tipo);
}

/**
 * Qual molde usar numa face: o manual, se existir; o automático, se a moldura
 * permitir; ou nenhum (a arte não recebe tradução).
 */
export function moldeParaUsar(
  meta: MetaDeImpressao | undefined | null,
  manual: Molde | null | undefined,
): MoldeManual | "auto" | null {
  if (manual?.modo === "bloqueado") return null;
  if (manual?.modo === "manual") return manual;
  return aceitaMoldeAutomatico(meta) ? "auto" : null;
}

export function chaveDoMolde(printId: string, face: number): string {
  return `${printId}#${face}`;
}

export const ROTULO_DA_FONTE: Record<FonteDaTraducao, string> = {
  manual: "Revisada no ateliê",
  arena: "Oficial (MTG Arena)",
  oficial: "Oficial (carta impressa)",
};

/**
 * Os símbolos (custos, {T}, mana) do texto traduzido têm de ser exatamente os
 * do original, na mesma ordem. Com a mesma quantidade e algum trocado, devolve
 * o texto com os símbolos do original (`corrigido`). Com quantidade diferente
 * não dá para saber qual falta: o texto volta como veio e `ok` é falso.
 */
export function conferirSimbolos(pt: string, en: string): { texto: string; ok: boolean; corrigido?: boolean } {
  const re = /\{[^}]+\}/g, a = String(pt || "").match(re) || [], b = String(en || "").match(re) || [];
  if (a.length !== b.length || a.every((x, i) => x.toUpperCase() === b[i].toUpperCase())) return { texto: pt, ok: a.length === b.length };
  let i = 0;
  return { texto: String(pt).replace(re, () => b[i++]), ok: true, corrigido: true };
}
