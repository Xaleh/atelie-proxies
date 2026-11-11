/**
 * Cartas reais mostradas na página inicial. As imagens vêm do Scryfall
 * (cards.scryfall.io), as mesmas que a loja usa, com a carta inteira à vista:
 * o Scryfall pede que o crédito do artista e o copyright não sejam cortados.
 *
 * As URLs têm o id da impressão e são estáveis. Para trocar uma carta, pegue
 * outra impressão em https://api.scryfall.com/cards/<set>/<número>/<idioma>.
 */

export type CartaVitrine = {
  nome: string;
  /** Edição e número de coleção, só para referência. */
  impressao: string;
  imagem: string;
};

const IMG = "https://cards.scryfall.io/normal/front";

/** Folha da primeira dobra: duas em português oficial e uma em inglês. */
export const FOLHA_EXEMPLO: Array<CartaVitrine & { idioma: "pt" | "en" }> = [
  {
    nome: "Anel Solar",
    impressao: "Commander Masters #410 (PT)",
    imagem: `${IMG}/b/e/be683141-ac97-4990-9ceb-c721c29335f8.jpg?1782816763`,
    idioma: "pt",
  },
  {
    nome: "Counterspell",
    impressao: "Commander Masters #81 (EN)",
    imagem: `${IMG}/8/4/8493131c-0a7b-4be6-a8a2-0b425f4f67fb.jpg?1783915703`,
    idioma: "en",
  },
  {
    nome: "Elfos de Llanowar",
    impressao: "Dominaria #168 (PT)",
    imagem: `${IMG}/3/1/312f9385-11bb-4f9c-915b-1d992e0de63d.jpg?1782932784`,
    idioma: "pt",
  },
];

/** Mesma impressão de Lightning Bolt (Battle for Baldur's Gate #187) nos dois idiomas. */
export const COMPARACAO_IDIOMA: { en: CartaVitrine; pt: CartaVitrine } = {
  en: {
    nome: "Lightning Bolt",
    impressao: "Battle for Baldur's Gate #187 (EN)",
    imagem: `${IMG}/a/e/ae5f9fb1-5a55-4db3-98a1-2628e3598c18.jpg?1783922736`,
  },
  pt: {
    nome: "Raio",
    impressao: "Battle for Baldur's Gate #187 (PT)",
    imagem: `${IMG}/3/e/3e055d35-9a1a-4c05-9736-1d2aed2098ef.jpg?1782852503`,
  },
};
