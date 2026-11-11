import type { MetaDeImpressao } from "./traducao/tipos";

/** Uma impressão de carta, já reduzida ao que o site usa. */
export type CardPrint = {
  /** Id da impressão no Scryfall. */
  id: string;
  oracleId: string;
  /** Nome oficial em inglês. */
  name: string;
  /** Nome impresso, quando a impressão não é em inglês. */
  printedName: string | null;
  lang: string;
  set: string;
  setName: string;
  collectorNumber: string;
  /** Imagem para exibir no site (cerca de 488 × 680 px). */
  image: string;
  /** Moldura e textos da impressão; ausente em carrinhos antigos. */
  meta?: MetaDeImpressao;
};

/** Resultado de busca: a carta em inglês e, se existir, a impressão em português. */
export type CatalogEntry = {
  oracleId: string;
  name: string;
  en: CardPrint;
  pt: CardPrint | null;
};

export type Lang = "en" | "pt";

/**
 * Qual arte a cliente escolheu: "padrao" (nenhuma, o site decide), uma arte
 * em inglês ou uma impressão em português.
 */
export type Arte = "padrao" | "en" | "pt";

export type CartItem = {
  oracleId: string;
  name: string;
  /** Arte em inglês (a padrão ou a escolhida). */
  en: CardPrint;
  /** Impressão oficial em português (a padrão ou a escolhida), se existir. */
  pt: CardPrint | null;
  /** Idioma do texto. */
  lang: Lang;
  arte: Arte;
  qty: number;
};

/**
 * Impressão que vai para o pedido. Sem arte escolhida, o texto em português
 * usa a impressão oficial em português quando ela existe.
 */
export function impressaoEscolhida(item: Pick<CartItem, "en" | "pt" | "lang" | "arte">): CardPrint {
  if (item.arte === "pt" && item.pt) return item.pt;
  if (item.arte === "en") return item.en;
  return item.lang === "pt" && item.pt ? item.pt : item.en;
}

/** Como o texto da carta sai impresso. */
export type ModoDoTexto = "en" | "oficial" | "traduzida" | "indisponivel";

/**
 * `podeTraduzir`: existe tradução e molde para escrever o português sobre a
 * arte em inglês deste item.
 */
export function modoDoTexto(item: Pick<CartItem, "en" | "pt" | "lang" | "arte">, podeTraduzir: boolean): ModoDoTexto {
  if (item.lang === "en") return "en";
  if (impressaoEscolhida(item).lang === "pt") return "oficial";
  return podeTraduzir ? "traduzida" : "indisponivel";
}
