/**
 * Rotinas que leem e corrigem os pixels da arte antes de o texto em português
 * ser escrito: achar onde estão as letras, apagar só elas e medir o fundo.
 * Portadas do site de produção do ateliê sem mudar os limiares; todos os
 * tamanhos são frações da altura da imagem, então valem da prévia ao PDF.
 */

export type Ctx = CanvasRenderingContext2D;
export type RGB = [number, number, number];
export type Quadro = [x: number, y: number, w: number, h: number];

export function mediana(g: Ctx, x: number, y: number, w: number, h: number): RGB {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const d = g.getImageData(x, y, w, h).data;
  const R: number[] = [], G: number[] = [], B: number[] = [];
  for (let i = 0; i < d.length; i += 12) {
    R.push(d[i]);
    G.push(d[i + 1]);
    B.push(d[i + 2]);
  }
  const m = (a: number[]) => {
    a.sort((p, q) => p - q);
    return a[a.length >> 1] ?? 0;
  };
  return [m(R), m(G), m(B)];
}

export const lum = (c: RGB) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
export const rgb = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
const distancia = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Reduz até cada linha de texto virar menos de 1 pixel e amplia de volta: sobra só o degradê do fundo. */
export function blurRegion(g: Ctx, x: number, y: number, w: number, h: number, fator?: number) {
  const f = fator || Math.max(18, g.canvas.height * 0.03);
  const sm = document.createElement("canvas");
  sm.width = Math.max(2, Math.round(w / f));
  sm.height = Math.max(2, Math.round(h / f));
  const sg = sm.getContext("2d")!;
  sg.imageSmoothingQuality = "high";
  sg.drawImage(g.canvas, x, y, w, h, 0, 0, sm.width, sm.height);
  g.save();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(sm, 0, 0, sm.width, sm.height, x, y, w, h);
  g.restore();
  sm.width = sm.height = 0;
}

/**
 * Cobre uma área com fundo limpo. Caixa clara: desfoque forte + cor da caixa
 * quase opaca. Escura: desfoque + preto. Devolve a cor do texto novo.
 */
export function cobrir(g: Ctx, rects: Quadro[], ref?: RGB): string {
  const col = ref || mediana(g, ...rects[0]);
  const claro = lum(col) > 0.5;
  rects.forEach((r) => {
    blurRegion(g, ...r);
    g.fillStyle = claro ? `rgba(${col[0]},${col[1]},${col[2]},.86)` : "rgba(0,0,0,.66)";
    g.fillRect(...r);
  });
  return claro ? "#111" : "#fff";
}

/** Topo da caixa de P/R: desce pela coluna da caixa até a cor mudar (a mediana ignora as letras do texto). */
export function acharTopoPR(g: Ctx, W: number, H: number, corDaCaixa: RGB, padrao: number): number {
  try {
    const x = Math.round(0.8 * W), w = Math.round(0.1 * W);
    let seguidas = 0;
    for (let y = Math.round(0.855 * H); y < 0.92 * H; y++) {
      if (distancia(mediana(g, x, y, w, 1), corDaCaixa) > 70) {
        if (++seguidas >= 3) {
          const topo = y - 3 - Math.round(0.004 * H);
          return topo >= 0.855 * H ? topo : padrao;
        }
      } else seguidas = 0;
    }
  } catch {
    // imagem fora do padrão: fica a posição da moldura
  }
  return padrao;
}

export type Tinta = { x: number; y: number; x2: number; y2: number; base: number; cap: number };

/** Letras dentro de uma faixa: devolve a caixa das letras, a linha de base e a altura da maiúscula. */
export function acharTinta(g: Ctx, x0: number, y0: number, x1: number, y1: number): Tinta | null {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const w = x1 - x0, h = y1 - y0;
  if (w < 8 || h < 8) return null;
  const d = g.getImageData(x0, y0, w, h).data;
  const L = new Float32Array(w * h);
  const amostra: number[] = [];
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    L[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    if (j % 7 === 0) amostra.push(L[j]);
  }
  amostra.sort((a, b) => a - b);
  const fundo = amostra[amostra.length >> 1];
  const linhas = new Array<number>(h).fill(0);
  let minx = w, maxx = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (Math.abs(L[y * w + x] - fundo) > 0.32) {
        linhas[y]++;
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
      }
    }
  for (let y = 0; y < h; y++) if (linhas[y] > w * 0.6) linhas[y] = 0; // borda da carta ou da arte, não é letra
  let pico = 0;
  for (const v of linhas) if (v > pico) pico = v;
  if (pico < 3) return null;
  const topo = linhas.findIndex((v) => v > pico * 0.15);
  let base = h - 1;
  while (base > 0 && linhas[base] < pico * 0.3) base--;
  let fim = h - 1;
  while (fim > 0 && linhas[fim] < pico * 0.05) fim--;
  // colunas com letra: tinta concentrada na altura da linha (a textura da moldura fica espalhada e é ignorada)
  const alt = Math.max(1, base - topo);
  const cols: boolean[] = [];
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = topo; y <= base; y++) if (Math.abs(L[y * w + x] - fundo) > 0.32) n++;
    cols.push(n >= Math.max(2, alt * 0.18));
  }
  const blocos: Array<[number, number]> = [];
  let ini = -1;
  for (let x = 0; x <= w; x++) {
    if (x < w && cols[x]) {
      if (ini < 0) ini = x;
    } else if (ini >= 0) {
      blocos.push([ini, x - 1]);
      ini = -1;
    }
  }
  if (blocos.length) {
    // parte do maior bloco de letras e junta os vizinhos próximos dos dois lados
    let k = 0;
    blocos.forEach((bl, i) => {
      if (bl[1] - bl[0] > blocos[k][1] - blocos[k][0]) k = i;
    });
    let ia = k, ib = k;
    while (ia > 0 && blocos[ia][0] - blocos[ia - 1][1] < w * 0.05) ia--;
    while (ib < blocos.length - 1 && blocos[ib + 1][0] - blocos[ib][1] < w * 0.1) ib++;
    minx = blocos[ia][0];
    maxx = blocos[ib][1];
  }
  return { x: x0 + minx, y: y0 + topo, x2: x0 + maxx, y2: y0 + fim, base: y0 + base + 1, cap: base + 1 - topo };
}

/** Soma de qualquer retângulo em tempo constante (imagem integral). */
function integral(w: number, h: number, f: (j: number) => number): Float64Array {
  const W1 = w + 1, S = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let lin = 0;
    for (let x = 0; x < w; x++) {
      lin += f(y * w + x);
      S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + lin;
    }
  }
  return S;
}
function somador(w: number, h: number) {
  const W1 = w + 1;
  return (S: Float64Array, xa: number, ya: number, xb: number, yb: number) => {
    if (xa < 0) xa = 0;
    if (ya < 0) ya = 0;
    if (xb > w) xb = w;
    if (yb > h) yb = h;
    return S[yb * W1 + xb] - S[ya * W1 + xb] - S[yb * W1 + xa] + S[ya * W1 + xa];
  };
}

export type OpcoesDeLimpeza = {
  /** Decisão sobre a marca d'água, que vale para a caixa toda (preenchida na primeira área). */
  marca?: boolean;
  /** Área que não é apagada nem serve de fundo (o selo holográfico). */
  protegido?: (x: number, y: number) => boolean;
};

/**
 * Apaga só as letras de uma área e preenche cada pixel apagado com o que está
 * em volta. O resto (arte vista através da caixa translúcida, textura,
 * desenhos, marca d'água pequena) fica como estava. Devolve a cor do fundo que
 * sobrou, para escolher a cor do texto novo.
 */
export function limparTexto(
  g: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  H: number,
  op: OpcoesDeLimpeza = {},
): RGB | null {
  x0 = Math.max(0, Math.round(x0));
  y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(g.canvas.width, Math.round(x1));
  y1 = Math.min(g.canvas.height, Math.round(y1));
  const w = x1 - x0, h = y1 - y0;
  if (w < 8 || h < 8) return null;
  const img = g.getImageData(x0, y0, w, h), d = img.data, N = w * h;
  const L = new Float32Array(N);
  const amostra: number[] = [];
  for (let j = 0; j < N; j++) {
    L[j] = (0.299 * d[j * 4] + 0.587 * d[j * 4 + 1] + 0.114 * d[j * 4 + 2]) / 255;
    if (j % 9 === 0) amostra.push(L[j]);
  }
  amostra.sort((a, b) => a - b);
  const Lm = amostra[amostra.length >> 1];
  let claras = 0, escuras = 0;
  for (let j = 0; j < N; j += 3) {
    if (L[j] > Lm + 0.3) claras++;
    else if (L[j] < Lm - 0.3) escuras++;
  }
  const dir = claras > escuras ? 1 : -1; // letra clara em fundo escuro, ou o contrário
  // tom da tinta das letras: só o que chega perto dele é letra (marca d'água e textura são meio-tom e ficam)
  const tinta = dir > 0 ? amostra[Math.floor(amostra.length * 0.985)] : amostra[Math.floor(amostra.length * 0.015)];
  const croma = (r: number, g2: number, b2: number) => Math.max(r, g2, b2) - Math.min(r, g2, b2);
  const soma = somador(w, h);

  // 1) fundo local estimado sem as letras (duas passadas) e máscara das letras
  const M = new Float32Array(N).fill(1), mask = new Uint8Array(N);
  const Rb = Math.max(4, Math.round(H * 0.018));
  for (let passo = 0; passo < 2; passo++) {
    const SM = integral(w, h, (j) => M[j]), SL = integral(w, h, (j) => L[j] * M[j]);
    const SR = integral(w, h, (j) => d[j * 4] * M[j]);
    const SG = integral(w, h, (j) => d[j * 4 + 1] * M[j]);
    const SB = integral(w, h, (j) => d[j * 4 + 2] * M[j]);
    const limiarCor = passo ? 55 : 70, limiarLuz = passo ? 0.11 : 0.16;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const j = y * w + x, xa = x - Rb, ya = y - Rb, xb = x + Rb + 1, yb = y + Rb + 1;
        const m = soma(SM, xa, ya, xb, yb);
        if (m < 1) {
          mask[j] = 1;
          continue;
        }
        const bl = soma(SL, xa, ya, xb, yb) / m;
        const br = soma(SR, xa, ya, xb, yb) / m, bg = soma(SG, xa, ya, xb, yb) / m, bb = soma(SB, xa, ya, xb, yb) / m;
        const r = d[j * 4], gg = d[j * 4 + 1], b = d[j * 4 + 2];
        const cor = Math.hypot(r - br, gg - bg, b - bb);
        // caixa clara: só o que chega perto da tinta é letra (a marca d'água é meio-tom); caixa escura: critério amplo
        const pertoDaTinta = dir > 0 || Math.abs(L[j] - tinta) < 0.55 * Math.abs(bl - tinta);
        // círculo cinza dos símbolos de mana
        const simbolo = cor > limiarCor && (dir > 0 || croma(r, gg, b) < croma(br, bg, bb) - 15);
        mask[j] = (dir * (L[j] - bl) > limiarLuz && pertoDaTinta) || simbolo ? 1 : 0;
      }
    for (let j = 0; j < N; j++) M[j] = mask[j] ? 0 : 1;
  }

  // marca d'água grande atrás do texto (símbolo de facção, de guilda…): não dá para reconstruir o que as
  // letras cobriam sem inventar, então ela sai inteira e fica só o papel da caixa
  if (dir < 0) {
    const cr: number[] = [], cg: number[] = [], cb: number[] = [];
    for (let j = 0; j < N; j += 7) {
      cr.push(d[j * 4]);
      cg.push(d[j * 4 + 1]);
      cb.push(d[j * 4 + 2]);
    }
    const med = [cr, cg, cb].map((a) => (a.sort((p, q) => p - q), a[a.length >> 1]));
    const meio = new Uint8Array(N);
    let nMeio = 0;
    for (let j = 0; j < N; j++) {
      if (mask[j] && Math.abs(L[j] - tinta) < 0.55 * Math.abs(Lm - tinta)) continue;
      if (Math.hypot(d[j * 4] - med[0], d[j * 4 + 1] - med[1], d[j * 4 + 2] - med[2]) > 40) {
        meio[j] = 1;
        nMeio++;
      }
    }
    if (op.marca ?? nMeio / N > 0.14) {
      op.marca = true;
      for (let j = 0; j < N; j++) if (meio[j]) mask[j] = 1;
    }
  }

  // 2) folga em volta das letras (bordas suavizadas do texto antigo)
  const Sk = integral(w, h, (j) => mask[j]), r = Math.max(1, Math.round(H * 0.0022));
  const apagar = new Uint8Array(N);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) apagar[y * w + x] = soma(Sk, x - r, y - r, x + r + 1, y + r + 1) > 0 ? 1 : 0;
  // área protegida (selo holográfico): não é apagada nem serve de fundo
  const fora = new Uint8Array(N);
  if (op.protegido)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (op.protegido(x0 + x, y0 + y)) {
          fora[y * w + x] = 1;
          apagar[y * w + x] = 0;
        }

  // 3) preenche cada pixel apagado com a média dos pixels de fundo mais próximos (o raio cresce até achar)
  const SM = integral(w, h, (j) => (apagar[j] || fora[j] ? 0 : 1));
  const canais = [0, 1, 2].map((c) => integral(w, h, (j) => (apagar[j] || fora[j] ? 0 : d[j * 4 + c])));
  const R0 = Math.max(2, Math.round(H * 0.004));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (!apagar[j]) continue;
      let rr = R0, m = 0;
      while ((m = soma(SM, x - rr, y - rr, x + rr + 1, y + rr + 1)) < rr * rr * 0.6 && rr < R0 * 80) rr = Math.round(rr * 1.6);
      if (m < 1) continue;
      for (let c = 0; c < 3; c++) d[j * 4 + c] = soma(canais[c], x - rr, y - rr, x + rr + 1, y + rr + 1) / m;
    }
  g.putImageData(img, x0, y0);
  return mediana(g, x0, y0, w, h);
}

/**
 * Apaga as letras de uma linha escrita direto na moldura (nome e tipo da
 * moldura antiga), preenchendo com a textura em volta.
 */
export function apagarTinta(g: Ctx, x0: number, y0: number, x1: number, y1: number, H: number) {
  x0 = Math.max(0, Math.round(x0));
  y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(g.canvas.width, Math.round(x1));
  y1 = Math.min(g.canvas.height, Math.round(y1));
  const w = x1 - x0, h = y1 - y0;
  if (w < 4 || h < 4) return;
  const img = g.getImageData(x0, y0, w, h), d = img.data, N = w * h;
  const L = new Float32Array(N);
  const vals: number[] = [];
  for (let j = 0; j < N; j++) {
    L[j] = (0.299 * d[j * 4] + 0.587 * d[j * 4 + 1] + 0.114 * d[j * 4 + 2]) / 255;
    if (j % 5 === 0) vals.push(L[j]);
  }
  vals.sort((a, b) => a - b);
  const fundo = vals[vals.length >> 1];
  const soma = somador(w, h);
  const St = integral(w, h, (j) => (Math.abs(L[j] - fundo) > 0.2 ? 1 : 0));
  const r = Math.max(2, Math.round(H * 0.003));
  const mask = new Uint8Array(N); // 1 = letra (com folga em volta)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) mask[y * w + x] = soma(St, x - r, y - r, x + r + 1, y + r + 1) > 0 ? 1 : 0;
  const Sm = integral(w, h, (j) => (mask[j] ? 0 : 1));
  const R2 = Math.max(4, Math.round(H * 0.014));
  const canais = [0, 1, 2].map((c) => integral(w, h, (j) => (mask[j] ? 0 : d[j * 4 + c])));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (!mask[j]) continue;
      let rr = R2, m = 0;
      while ((m = soma(Sm, x - rr, y - rr, x + rr + 1, y + rr + 1)) < 1 && rr < R2 * 6) rr *= 2;
      if (m < 1) continue;
      for (let c = 0; c < 3; c++) d[j * 4 + c] = soma(canais[c], x - rr, y - rr, x + rr + 1, y + rr + 1) / m;
    }
  g.putImageData(img, x0, y0);
}

/**
 * Topo e base da ilustração na moldura antiga: parte de dentro da ilustração
 * e anda até encontrar a cor da moldura (o nome e o tipo nunca atrapalham).
 */
export function acharArte(g: Ctx, W: number, H: number): { y0: number; y1: number } {
  // moldura ao lado da linha de tipo (nunca é a borda branca)
  const moldura = mediana(g, 0.74 * W, 0.565 * H, 0.08 * W, 0.02 * H);
  const perto = (y: number) => distancia(mediana(g, 0.5 * W, y, 0.22 * W, 1), moldura) < 45;
  let y0: number | null = null, y1: number | null = null, s = 0;
  for (let y = Math.round(0.2 * H); y > 0.02 * H; y--) {
    if (perto(y)) {
      if (++s >= 3) {
        y0 = y + 3;
        break;
      }
    } else s = 0;
  }
  s = 0;
  for (let y = Math.round(0.42 * H); y < 0.62 * H; y++) {
    if (perto(y)) {
      if (++s >= 3) {
        y1 = y - 3;
        break;
      }
    } else s = 0;
  }
  if (y0 == null || y0 < 0.045 * H || y0 > 0.14 * H) y0 = 0.097 * H;
  if (y1 == null || y1 < 0.47 * H || y1 > 0.585 * H) y1 = 0.555 * H;
  return { y0, y1 };
}
