/**
 * Letras das cartas traduzidas. O renderizador tem quatro encaixes; cada um usa
 * o arquivo que o ateliê enviou pelo painel ou, sem arquivo, a fonte livre de
 * reserva. Os arquivos ficam no banco e não entram no repositório.
 *
 * No código, "fonte" já é a origem de uma tradução (manual, arena, oficial);
 * por isso aqui o nome é "letra" e "encaixe".
 */

export const ENCAIXES = ["titulo", "regras", "regras-italico", "rodape"] as const;
export type Encaixe = (typeof ENCAIXES)[number];

export const ehEncaixe = (v: unknown): v is Encaixe => typeof v === "string" && (ENCAIXES as readonly string[]).includes(v);

/**
 * Como cada encaixe vira um `@font-face`. O itálico é a mesma família das
 * regras, no estilo itálico: sem ele, o navegador inclina a letra das regras.
 */
export const ENCAIXE: Record<Encaixe, { rotulo: string; onde: string; familia: string; italico: boolean; reserva: string; amostra: string }> = {
  titulo: {
    rotulo: "Nome e linha de tipo",
    onde: "O nome da carta e a linha de tipo.",
    familia: "PdR Titulo",
    italico: false,
    reserva: "Crimson Pro em negrito",
    amostra: "Elfos de Llanowar · Criatura — Elfo Druida",
  },
  regras: {
    rotulo: "Texto de regras",
    onde: "O texto da caixa da carta.",
    familia: "PdR Regras",
    italico: false,
    reserva: "Crimson Pro",
    amostra: "Voar, ímpeto. Quando esta criatura entrar, compre um card.",
  },
  "regras-italico": {
    rotulo: "Ambientação e lembretes",
    onde: "O texto de ambientação e os lembretes entre parênteses.",
    familia: "PdR Regras",
    italico: true,
    reserva: "Crimson Pro em itálico",
    amostra: "“A floresta não esquece quem a ajudou a crescer.”",
  },
  rodape: {
    rotulo: "Rodapé",
    onde: "A sigla do idioma no rodapé (EN vira PT). É opcional.",
    familia: "PdR Rodape",
    italico: false,
    reserva: "Inter",
    amostra: "DOM • PT",
  },
};

/** Maior arquivo aceito. Uma fonte de texto costuma ter de 50 a 300 KB. */
export const TAMANHO_MAXIMO = 2 * 1024 * 1024;
export const EXTENSOES = ".ttf,.otf,.woff,.woff2";

export type FormatoDeLetra = { formato: "truetype" | "opentype" | "woff" | "woff2"; mime: string };

/** Reconhece o arquivo pelos primeiros bytes; a extensão e o tipo que o navegador informa não contam. */
export function formatoDaLetra(bytes: Uint8Array): FormatoDeLetra | null {
  if (bytes.length < 12) return null;
  const marca = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (marca === "\x00\x01\x00\x00" || marca === "true") return { formato: "truetype", mime: "font/ttf" };
  if (marca === "OTTO") return { formato: "opentype", mime: "font/otf" };
  if (marca === "wOFF") return { formato: "woff", mime: "font/woff" };
  if (marca === "wOF2") return { formato: "woff2", mime: "font/woff2" };
  return null;
}

/** Uma letra enviada, como a loja e o painel a enxergam (sem os bytes). */
export type LetraEnviada = {
  encaixe: Encaixe;
  /** Nome do arquivo enviado, só para o painel mostrar. */
  arquivo: string;
  bytes: number;
  formato: FormatoDeLetra["formato"];
  hash: string;
  enviadaEm: string;
  url: string;
};

/** O `v` muda quando o arquivo muda, então o navegador pode guardar a letra por um ano. */
export const enderecoDaLetra = (encaixe: Encaixe, hash: string) => `/api/fontes/${encaixe}?v=${hash}`;

export function tamanhoLegivel(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
