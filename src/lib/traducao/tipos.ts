import { z } from "zod";

/**
 * Tipos e regras da tradução que valem no servidor e no navegador.
 * O texto em português é escrito sobre a arte em inglês por um "molde": o
 * automático, para as molduras de 2015 e de 1993, ou um manual, marcado no painel
 * para uma impressão específica.
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

const TIPOS_SEM_MOLDE = /Planeswalker|Saga|Battle|Class|Case|Siege/i;

/**
 * Molduras que o molde automático sabe reescrever: a moderna (2015) e a antiga
 * (1993, de Alpha a Mirage e 30th Edition), só em cartas de layout comum.
 */
export function aceitaMoldeAutomatico(meta: MetaDeImpressao | undefined | null): boolean {
  if (!meta || TIPOS_SEM_MOLDE.test(meta.tipo)) return false;
  if (meta.frame === "2015") return ["normal", "transform", "modal_dfc"].includes(meta.layout);
  if (meta.frame === "1993") return meta.layout === "normal";
  return false;
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
