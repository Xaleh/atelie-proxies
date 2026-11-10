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
};

/** Resultado de busca: a carta em inglês e, se existir, a impressão em português. */
export type CatalogEntry = {
  oracleId: string;
  name: string;
  en: CardPrint;
  pt: CardPrint | null;
};

export type Lang = "en" | "pt";

export type CartItem = {
  oracleId: string;
  name: string;
  en: CardPrint;
  pt: CardPrint | null;
  lang: Lang;
  qty: number;
};

/** Impressão que vai para o pedido, conforme o idioma escolhido. */
export function impressaoEscolhida(item: Pick<CartItem, "en" | "pt" | "lang">): CardPrint {
  return item.lang === "pt" && item.pt ? item.pt : item.en;
}
