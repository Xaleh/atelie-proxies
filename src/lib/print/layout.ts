/**
 * Geometria da folha de impressão. Portada do site de produção original sem
 * mudar nenhuma medida: A4 em paisagem, 8 cartas (4 × 2) e marcas de registro
 * no mesmo lugar dos PDFs do Proxxied, para o gabarito da Silhouette Portrait 4
 * continuar valendo. Tudo em milímetros, com origem no canto de cima à esquerda.
 */

export const CARD_W = 63;
export const CARD_H = 88;
export const FOLHA = { w: 297, h: 210 } as const;
export const COLUNAS = 4;
export const LINHAS = 2;
export const POR_FOLHA = COLUNAS * LINHAS;

/** Marcas medidas no PDF do Proxxied para a Portrait 4, a partir das bordas da folha. */
export const MARCA = {
  left: 9.653,
  right: 9.39,
  top: 9.66,
  bottom: 9.371,
  len: 9.385,
  thick: 0.99,
  square: 5.99,
} as const;

export type Ajustes = {
  /** Sangria em volta de cada carta. */
  bleed: number;
  /** Deslocamento da impressão; positivo move para a direita e para baixo. */
  offX: number;
  offY: number;
  /** Desenha as marcas de registro da Silhouette. */
  marks: boolean;
  /** Raio do canto no gabarito de corte. */
  radius: number;
  /** Desenha marcas de corte para guilhotina. */
  crop: boolean;
  /** Resolução para a qual a imagem é ampliada antes de entrar no PDF. */
  dpi: number;
  /** Qualidade do JPEG, de 0 a 1. */
  qual: number;
  /** Imprime também o verso das cartas de duas faces, como carta separada. */
  versos: boolean;
};

export const AJUSTES_PADRAO: Ajustes = {
  bleed: 0.5,
  offX: 0,
  offY: 0,
  marks: true,
  radius: 3.2,
  crop: false,
  dpi: 1200,
  qual: 0.92,
  versos: true,
};

export type Retangulo = { x: number; y: number; w: number; h: number };
export type Posicao = { x: number; y: number; linha: number; coluna: number };

export type Layout = {
  W: number;
  H: number;
  slots: Posicao[];
  marks: Retangulo[];
  x0: number;
  y0: number;
  gw: number;
  gh: number;
  gap: number;
};

const arredondar = (n: number) => +n.toFixed(3);

export function computeLayout(s: Pick<Ajustes, "bleed" | "offX" | "offY" | "marks">): Layout {
  const W = FOLHA.w;
  const H = FOLHA.h;
  const b = Math.max(0, Number(s.bleed) || 0);
  const gap = 2 * b; // sangrias encostadas, como no Proxxied
  const gw = COLUNAS * CARD_W + (COLUNAS - 1) * gap;
  const gh = LINHAS * CARD_H + (LINHAS - 1) * gap;
  const x0 = (W - gw) / 2 + (Number(s.offX) || 0);
  const y0 = (H - gh) / 2 + (Number(s.offY) || 0);

  const slots: Posicao[] = [];
  for (let linha = 0; linha < LINHAS; linha++) {
    for (let coluna = 0; coluna < COLUNAS; coluna++) {
      slots.push({
        x: arredondar(x0 + coluna * (CARD_W + gap)),
        y: arredondar(y0 + linha * (CARD_H + gap)),
        linha,
        coluna,
      });
    }
  }

  const M = MARCA;
  const marks: Retangulo[] = s.marks
    ? [
        // quadrado: embaixo à esquerda
        { x: M.left, y: H - M.bottom - M.square, w: M.square, h: M.square },
        // L: em cima à esquerda
        { x: M.left, y: M.top, w: M.len, h: M.thick },
        { x: M.left, y: M.top, w: M.thick, h: M.len },
        // L: embaixo à direita
        { x: W - M.right - M.len, y: H - M.bottom - M.thick, w: M.len, h: M.thick },
        { x: W - M.right - M.thick, y: H - M.bottom - M.len, w: M.thick, h: M.len },
      ]
    : [];

  return { W, H, slots, marks, x0, y0, gw, gh, gap };
}

export type Aviso = { tipo: "erro" | "aviso"; texto: string };

/** Problemas do ajuste atual que estragariam a impressão ou a leitura das marcas. */
export function avisosDoLayout(s: Pick<Ajustes, "bleed" | "offX" | "offY" | "marks">): Aviso[] {
  const L = computeLayout(s);
  const b = Math.max(0, Number(s.bleed) || 0);
  if (L.x0 - b < 0 || L.y0 - b < 0 || L.x0 + L.gw + b > L.W || L.y0 + L.gh + b > L.H) {
    return [
      {
        tipo: "erro",
        texto: "As cartas passam da borda da folha. Diminua a sangria ou o ajuste horizontal/vertical.",
      },
    ];
  }
  const folga = 0.2;
  const encosta = L.slots.some((sl) => {
    const a = { x: sl.x - b, y: sl.y - b, w: CARD_W + 2 * b, h: CARD_H + 2 * b };
    return L.marks.some(
      (m) => a.x < m.x + m.w + folga && a.x + a.w > m.x - folga && a.y < m.y + m.h + folga && a.y + a.h > m.y - folga,
    );
  });
  if (encosta) {
    return [
      {
        tipo: "aviso",
        texto:
          "Alguma carta encosta numa marca de registro e a máquina pode não reconhecer as marcas. Volte o ajuste horizontal/vertical para perto de 0 ou diminua a sangria.",
      },
    ];
  }
  return [];
}

export function folhasPara(cartas: number): number {
  return Math.max(1, Math.ceil(cartas / POR_FOLHA));
}
