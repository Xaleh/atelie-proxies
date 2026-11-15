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

export type Tinta = {
  x: number;
  y: number;
  x2: number;
  y2: number;
  base: number;
  cap: number;
  /** Cor das letras, ou null se não deu para medir. */
  cor: RGB | null;
  /** As letras são mais claras que o fundo. */
  claras: boolean;
};

/**
 * Letras dentro de uma faixa: devolve a caixa das letras, a linha de base, a
 * altura da maiúscula e a cor da tinta.
 */
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
  // limiar pelo contraste das letras desta carta (nome cinza-claro em moldura cinza tem pouco contraste)
  const dist = amostra.map((v) => Math.abs(v - fundo)).sort((a, b) => a - b);
  const forte = dist[Math.floor(dist.length * 0.99)];
  const lim = Math.min(0.32, Math.max(0.14, forte * 0.65)), limCor = Math.min(0.45, lim * 1.4);
  const tinta = (j: number) => Math.abs(L[j] - fundo) > lim;
  const linhas = new Array<number>(h).fill(0);
  let minx = w, maxx = 0, R = 0, G = 0, B = 0, n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (!tinta(j)) continue;
      linhas[y]++;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (Math.abs(L[j] - fundo) > limCor) {
        R += d[j * 4];
        G += d[j * 4 + 1];
        B += d[j * 4 + 2];
        n++;
      }
    }
  for (let y = 0; y < h; y++) if (linhas[y] > w * 0.6) linhas[y] = 0; // borda da carta ou da arte, não é letra
  const maior = (v: number[]) => v.reduce((m, x) => (x > m ? x : m), 0);
  const pico = maior(linhas);
  if (pico < 3) return null;
  let topo = linhas.findIndex((v) => v > pico * 0.15);
  let base = h - 1;
  while (base > 0 && linhas[base] < pico * 0.3) base--;
  let fim = h - 1;
  while (fim > 0 && linhas[fim] < pico * 0.05) fim--;
  // colunas com letra: tinta concentrada na altura da linha (a textura da moldura fica espalhada e é ignorada)
  const alt = Math.max(1, base - topo);
  const cols: boolean[] = [];
  for (let x = 0; x < w; x++) {
    let nc = 0;
    for (let y = topo; y <= base; y++) if (tinta(y * w + x)) nc++;
    cols.push(nc >= Math.max(2, alt * 0.18));
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
    // o espaço entre palavras (e em volta do travessão) é menor que ~2 alturas de letra
    while (ia > 0 && blocos[ia][0] - blocos[ia - 1][1] < Math.max(w * 0.05, alt * 3.5)) ia--;
    while (ib < blocos.length - 1 && blocos[ib + 1][0] - blocos[ib][1] < Math.max(w * 0.1, alt * 3.5)) ib++;
    minx = blocos[ia][0];
    maxx = blocos[ib][1];
    // altura das letras medida só nas colunas das letras (a borda de uma barra não entra)
    const lw = maxx - minx + 1, l2 = new Array<number>(h).fill(0);
    for (let y = 0; y < h; y++) for (let x = minx; x <= maxx; x++) if (tinta(y * w + x)) l2[y]++;
    for (let y = 0; y < h; y++) if (linhas[y] === 0 && l2[y] > lw * 0.6) l2[y] = 0; // só as bordas que já cruzavam a faixa toda
    const p2 = maior(l2);
    if (p2 >= 3) {
      // a linha de letras é o maior trecho contínuo de linhas com tinta (bordas soltas acima ou abaixo ficam de fora)
      let melhor: { a: number; b: number; s: number } | null = null;
      let ini2 = -1, soma2 = 0;
      for (let y = 0; y <= h; y++) {
        if (y < h && l2[y] > p2 * 0.08) {
          if (ini2 < 0) {
            ini2 = y;
            soma2 = 0;
          }
          soma2 += l2[y];
        } else if (ini2 >= 0) {
          if (!melhor || soma2 > melhor.s) melhor = { a: ini2, b: y - 1, s: soma2 };
          ini2 = -1;
        }
      }
      if (melhor) {
        const pk = maior(l2.slice(melhor.a, melhor.b + 1));
        let t2 = melhor.a;
        while (t2 < melhor.b && l2[t2] < pk * 0.15) t2++;
        let b2 = melhor.b;
        while (b2 > t2 && l2[b2] < pk * 0.3) b2--;
        if (b2 > t2) {
          topo = t2;
          base = b2;
          fim = melhor.b;
        }
      }
    }
  }
  // cor das letras: a média só dos pixels do lado da maioria (a sombra das letras claras não entra na conta)
  let claras = 0, escuras = 0;
  const sc = [0, 0, 0], se = [0, 0, 0];
  for (let y = topo; y <= base; y++)
    for (let x = minx; x <= maxx; x++) {
      const j = y * w + x, v = L[j] - fundo;
      if (v > limCor) {
        claras++;
        for (let c = 0; c < 3; c++) sc[c] += d[j * 4 + c];
      } else if (v < -limCor) {
        escuras++;
        for (let c = 0; c < 3; c++) se[c] += d[j * 4 + c];
      }
    }
  const [somaDoLado, nDoLado] = claras > escuras ? [sc, claras] : [se, escuras];
  const cor: RGB | null = nDoLado
    ? [(somaDoLado[0] / nDoLado) | 0, (somaDoLado[1] / nDoLado) | 0, (somaDoLado[2] / nDoLado) | 0]
    : n
      ? [(R / n) | 0, (G / n) | 0, (B / n) | 0]
      : null;
  return { x: x0 + minx, y: y0 + topo, x2: x0 + maxx, y2: y0 + fim, base: y0 + base + 1, cap: base + 1 - topo, cor, claras: claras > escuras };
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
        const pertoDaTinta = dir > 0 || Math.abs(L[j] - tinta) < 0.62 * Math.abs(bl - tinta);
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

const luzes = (d: Uint8ClampedArray, n: number): Float32Array => {
  const L = new Float32Array(n);
  for (let j = 0; j < n; j++) L[j] = (0.299 * d[j * 4] + 0.587 * d[j * 4 + 1] + 0.114 * d[j * 4 + 2]) / 255;
  return L;
};

/** Uma linha de texto achada na imagem, em fração da largura (x) e da altura (y) da carta. */
export type LinhaAchada = { y0: number; y1: number; xa: number; xb: number; xbTodo: number; n: number };

/**
 * Linhas de texto "contornado" numa área (molduras de quadrinho): pixels
 * claros com um pixel escuro bem perto, que é a borda da letra.
 */
export function linhasContornadas(g: Ctx, W: number, H: number, xa: number, ya: number, xb: number, yb: number): LinhaAchada[] {
  const x0 = Math.round(xa * W), y0 = Math.round(ya * H), w = Math.round((xb - xa) * W), h = Math.round((yb - ya) * H);
  const L = luzes(g.getImageData(x0, y0, w, h).data, w * h);
  const S = integral(w, h, (j) => (L[j] < 0.25 ? 1 : 0)), soma = somador(w, h);
  const r = Math.max(1, Math.round(0.003 * H));
  const letra = (x: number, y: number) => L[y * w + x] > 0.78 && soma(S, x - r, y - r, x + r + 1, y + r + 1) > 0;
  const rows: Array<{ n: number; a: number; b: number }> = [];
  for (let y = 0; y < h; y++) {
    let n = 0, a = -1, b = -1;
    for (let x = 0; x < w; x++)
      if (letra(x, y)) {
        n++;
        if (a < 0) a = x;
        b = x;
      }
    rows.push({ n, a, b });
  }
  type Linha = { y0: number; y1: number; a: number; b: number; n: number; bTodo: number };
  const linhas: Linha[] = [];
  let cur: Linha | null = null, vazio = 0;
  const minN = Math.max(3, w * 0.012);
  for (let y = 0; y <= h; y++) {
    const rw = y < h ? rows[y] : { n: 0, a: -1, b: -1 };
    if (rw.n >= minN) {
      if (!cur) {
        cur = { y0: y, y1: y, a: rw.a, b: rw.b, n: 0, bTodo: rw.b };
        linhas.push(cur);
      }
      cur.y1 = y;
      cur.a = Math.min(cur.a, rw.a);
      cur.b = Math.max(cur.b, rw.b);
      cur.n += rw.n;
      vazio = 0;
    } else if (cur && ++vazio > r) cur = null;
  }
  for (const l of linhas) {
    // as pontas de cima e de baixo das letras têm poucos pixels: estende a linha enquanto ainda houver alguns
    const alt0 = l.y1 - l.y0, fraco = Math.max(2, minN * 0.2);
    for (let k = 0; k < alt0 * 0.6 && l.y0 > 0 && rows[l.y0 - 1].n >= fraco; k++) l.y0--;
    for (let k = 0; k < alt0 * 0.4 && l.y1 < h - 1 && rows[l.y1 + 1].n >= fraco; k++) l.y1++;
  }
  for (const l of linhas) {
    // a linha termina onde as letras param: um vão maior que ~2,5 alturas de letra é arte, não texto
    const alt = l.y1 - l.y0 + 1;
    let fim = 0, vao = 0;
    for (let x = l.a; x <= l.b; x++) {
      let tem = false;
      for (let y = l.y0; y <= l.y1 && !tem; y++) tem = letra(x, y);
      if (tem) {
        fim = x - l.a;
        vao = 0;
      } else if (++vao > alt * 2.5) break;
    }
    l.bTodo = l.b;
    l.b = l.a + fim;
  }
  return linhas
    .map((l) => ({ y0: (y0 + l.y0) / H, y1: (y0 + l.y1) / H, xa: (x0 + l.a) / W, xb: (x0 + l.b) / W, xbTodo: (x0 + l.bTodo) / W, n: l.n }))
    .filter((l) => l.y1 - l.y0 >= 0.008 && l.y1 - l.y0 <= 0.04 && l.xb - l.xa > 0.06);
}

/**
 * Apaga as letras contornadas (branco com borda preta) e refaz o fundo com a
 * arte em volta. Com `espelho`, em vez de borrar, usa a própria arte logo acima
 * e logo abaixo, espelhada: o traço e as cores continuam nítidos.
 */
export function apagarContornado(g: Ctx, x0: number, y0: number, x1: number, y1: number, H: number, acrom = true, espelho = false) {
  x0 = Math.max(0, Math.round(x0));
  y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(g.canvas.width, Math.round(x1));
  y1 = Math.min(g.canvas.height, Math.round(y1));
  const w = x1 - x0, h = y1 - y0;
  if (w < 4 || h < 4) return;
  const img = g.getImageData(x0, y0, w, h), d = img.data, N = w * h, L = luzes(d, N);
  const soma = somador(w, h);
  // letra = branco com escuro perto, ou escuro (inclusive o cinza da borda suavizada) com branco perto
  const Sc = integral(w, h, (j) => (L[j] > 0.72 ? 1 : 0)), Se = integral(w, h, (j) => (L[j] < 0.3 ? 1 : 0));
  const r = Math.max(1, Math.round(0.004 * H));
  const letra = new Uint8Array(N);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (L[j] > 0.72 && soma(Se, x - r, y - r, x + r + 1, y + r + 1) > 0) letra[j] = 1;
      else if (L[j] < 0.45 && soma(Sc, x - r, y - r, x + r + 1, y + r + 1) > 0) letra[j] = 1;
    }
  // a borda suavizada das letras é cinza (sem cor); a arte de quadrinho é colorida: o cinza perto das letras também sai
  if (acrom) {
    const S0 = integral(w, h, (j) => letra[j]), r2 = r * 2;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const j = y * w + x;
        if (letra[j]) continue;
        const cr = Math.max(d[j * 4], d[j * 4 + 1], d[j * 4 + 2]) - Math.min(d[j * 4], d[j * 4 + 1], d[j * 4 + 2]);
        if (cr < 40 && soma(S0, x - r2, y - r2, x + r2 + 1, y + r2 + 1) > 0) letra[j] = 1;
      }
  }
  const Sl = integral(w, h, (j) => letra[j]), rd = Math.max(1, Math.round((espelho ? 0.009 : 0.003) * H));
  const apagar = new Uint8Array(N);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) apagar[y * w + x] = soma(Sl, x - rd, y - rd, x + rd + 1, y + rd + 1) > 0 ? 1 : 0;
  if (espelho) {
    // a metade de cima vem de cima e a de baixo vem de baixo, com uma costura curta no meio
    const CH = g.canvas.height, ya = Math.max(0, y0 - h), yb = Math.min(CH, y1 + h);
    const ext = g.getImageData(x0, ya, w, yb - ya).data;
    const px = (x: number, yAbs: number, c: number) => ext[((Math.max(ya, Math.min(yb - 1, yAbs)) - ya) * w + x) * 4 + c];
    const Sa = integral(w, h, (j) => apagar[j]), rf = Math.max(1, Math.round(rd * 0.6));
    for (let y = 0; y < h; y++) {
      const t = h > 1 ? y / (h - 1) : 0.5, wb = t < 0.4 ? 0 : t > 0.6 ? 1 : (t - 0.4) / 0.2;
      const yCima = y0 - 1 - y, yBaixo = y1 + (h - 1 - y);
      for (let x = 0; x < w; x++) {
        const j = y * w + x;
        if (!apagar[j]) continue;
        const a = soma(Sa, x - rf, y - rf, x + rf + 1, y + rf + 1) / (2 * rf + 1) ** 2; // borda suave com a arte original
        for (let c = 0; c < 3; c++) {
          const v = (1 - wb) * px(x, yCima, c) + wb * px(x, yBaixo, c);
          d[j * 4 + c] = a * v + (1 - a) * d[j * 4 + c];
        }
      }
    }
    g.putImageData(img, x0, y0);
    return;
  }
  const SM = integral(w, h, (j) => (apagar[j] ? 0 : 1));
  const canais = [0, 1, 2].map((c) => integral(w, h, (j) => (apagar[j] ? 0 : d[j * 4 + c])));
  const R0 = Math.max(2, Math.round(0.006 * H));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      if (!apagar[j]) continue;
      let rr = R0, m = 0;
      while ((m = soma(SM, x - rr, y - rr, x + rr + 1, y + rr + 1)) < rr * rr * 0.5 && rr < R0 * 12) rr = Math.round(rr * 1.6);
      if (m < 1) continue;
      for (let c = 0; c < 3; c++) d[j * 4 + c] = soma(canais[c], x - rr, y - rr, x + rr + 1, y + rr + 1) / m;
    }
  g.putImageData(img, x0, y0);
}

/**
 * A borda reta mais forte de uma faixa. `sc` é a fração das colunas que mudam
 * de cor na mesma direção numa linha: alta numa borda reta (barra, caixa),
 * baixa no meio da arte, onde as mudanças se anulam.
 */
export function bordasHorizontais(g: Ctx, W: number, H: number, ya: number, yb: number, xa = 0.12, xb = 0.8): { sc: number; y: number } {
  const x0 = Math.round(xa * W), x1 = Math.round(xb * W), y0 = Math.round(ya * H), y1 = Math.round(yb * H);
  const d = Math.max(1, Math.round(0.003 * H));
  const w = x1 - x0, h = y1 - y0 + 2 * d;
  const L = luzes(g.getImageData(x0, y0 - d, w, h).data, w * h);
  let melhor = 0, onde = ya;
  for (let y = d; y < h - d; y++) {
    let pos = 0, neg = 0;
    for (let x = 0; x < w; x++) {
      const df = L[(y + d) * w + x] - L[(y - d) * w + x];
      if (df > 0.06) pos++;
      else if (df < -0.06) neg++;
    }
    const sc = Math.max(pos, neg) / w;
    if (sc > melhor) {
      melhor = sc;
      onde = (y0 - d + y) / H;
    }
  }
  return { sc: melhor, y: onde };
}

/** Todas as bordas retas (linhas ou colunas) de uma faixa, agrupadas em trechos [início, fim] em fração da carta. */
export function trechosDeBorda(
  g: Ctx,
  W: number,
  H: number,
  vertical: boolean,
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  lim = 0.75,
): Array<[number, number]> {
  const X0 = Math.round((vertical ? a0 : b0) * W), X1 = Math.round((vertical ? a1 : b1) * W);
  const Y0 = Math.round((vertical ? b0 : a0) * H), Y1 = Math.round((vertical ? b1 : a1) * H);
  const d = Math.max(1, Math.round(0.003 * H)), w = X1 - X0 + 2 * d, h = Y1 - Y0 + 2 * d;
  const L = luzes(g.getImageData(X0 - d, Y0 - d, w, h).data, w * h);
  const out: Array<[number, number]> = [];
  const n = vertical ? w : h, m = vertical ? h : w;
  for (let i = d; i < n - d; i++) {
    let pos = 0, neg = 0;
    for (let k = d; k < m - d; k++) {
      const df = vertical ? L[k * w + i + d] - L[k * w + i - d] : L[(i + d) * w + k] - L[(i - d) * w + k];
      if (df > 0.06) pos++;
      else if (df < -0.06) neg++;
    }
    if (Math.max(pos, neg) / (m - 2 * d) > lim) {
      const v = ((vertical ? X0 : Y0) - d + i) / (vertical ? W : H), u = out[out.length - 1];
      if (u && v - u[1] <= 0.0035) u[1] = v;
      else out.push([v, v]);
    }
  }
  return out;
}

export type CaixaAchada = { x0: number; x1: number; y0: number; y1: number; tipo0: number; tipo1: number };

/**
 * Caixa de texto das molduras de 1997 e 2003, achada pelas bordas dela (o
 * texto dentro não atrapalha, ao contrário da cor). `tipo0` e `tipo1` são o
 * fim da arte e o começo da caixa: a linha de tipo fica entre os dois.
 */
export function acharCaixaBordas(g: Ctx, W: number, H: number): CaixaAchada | null {
  const hz = trechosDeBorda(g, W, H, false, 0.53, 0.935, 0.2, 0.8), vt = trechosDeBorda(g, W, H, true, 0.03, 0.97, 0.66, 0.84);
  const topo = hz.filter((t) => t[1] >= 0.585 && t[0] <= 0.64), fundo = hz.filter((t) => t[0] >= 0.85 && t[0] <= 0.925);
  const esq = vt.filter((t) => t[1] >= 0.06 && t[1] <= 0.16), dir = vt.filter((t) => t[0] >= 0.84 && t[0] <= 0.94);
  if (!topo.length || !fundo.length || !esq.length || !dir.length) return null;
  const arte = hz.filter((t) => t[0] <= 0.58 && t[1] < topo[0][0]); // fim da arte, logo acima da linha de tipo
  return {
    // a primeira borda depois da moldura (desenhos dentro da caixa, como no Plateau, não contam)
    x0: (esq.find((t) => t[1] >= 0.095) || esq[esq.length - 1])[1] * W + 0.006 * W,
    x1: ([...dir].reverse().find((t) => t[0] <= 0.905) || dir[0])[0] * W - 0.006 * W,
    y0: Math.min(topo[topo.length - 1][1], 0.64) * H + 0.005 * H,
    y1: fundo[0][0] * H - 0.005 * H,
    tipo0: (arte.length ? arte[arte.length - 1][1] : 0.553) * H,
    tipo1: topo[0][0] * H,
  };
}

/** Começo da moldura no alto da carta (abaixo da borda preta ou branca): o nome nunca fica acima disso. */
export function topoDaMoldura(g: Ctx, W: number, H: number, padrao: number): number {
  try {
    const t = trechosDeBorda(g, W, H, false, 0.012, 0.06, 0.2, 0.8);
    return t.length ? Math.max(padrao, t[t.length - 1][1] * H + 0.004 * H) : padrao;
  } catch {
    return padrao;
  }
}

/** O texto original da caixa está centralizado? (algumas cartas de 1993 têm texto curto, grande e centralizado) */
export function textoCentralizado(g: Ctx, x0: number, y0: number, x1: number, y1: number): boolean {
  try {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    const w = Math.round(x1 - x0), h = Math.round(y1 - y0);
    const L = luzes(g.getImageData(x0, y0, w, h).data, w * h);
    const am: number[] = [];
    for (let j = 0; j < w * h; j += 7) am.push(L[j]);
    am.sort((a, b) => a - b);
    const fundo = am[am.length >> 1];
    const ds = am.map((v) => Math.abs(v - fundo)).sort((a, b) => a - b);
    const lim = Math.min(0.3, Math.max(0.12, ds[Math.floor(ds.length * 0.99)] * 0.5));
    const linhas: Array<{ a: number; b: number }> = [];
    let atual: { a: number; b: number } | null = null;
    const m0 = Math.round(w * 0.04), m1 = w - m0; // as bordas da caixa ficam de fora
    for (let y = 0; y < h; y++) {
      let a = -1, b = -1, n = 0;
      for (let x = m0; x < m1; x++)
        if (Math.abs(L[y * w + x] - fundo) > lim) {
          if (a < 0) a = x;
          b = x;
          n++;
        }
      if (n >= Math.max(2, w * 0.025) && n < w * 0.6) {
        if (!atual) {
          atual = { a, b };
          linhas.push(atual);
        } else {
          atual.a = Math.min(atual.a, a);
          atual.b = Math.max(atual.b, b);
        }
      } else atual = null;
    }
    const ok = linhas.filter((l) => l.b - l.a > w * 0.15);
    if (!ok.length) return false;
    const esq = ok.map((l) => l.a), cen = ok.map((l) => (l.a + l.b) / 2);
    const amp = (v: number[]) => Math.max(...v) - Math.min(...v);
    const meio = cen.reduce((s, v) => s + v, 0) / cen.length;
    if (ok.length === 1) return Math.abs(meio - w / 2) < w * 0.05 && esq[0] > w * 0.12;
    // texto alinhado à esquerda: as margens esquerdas coincidem; centralizado: os centros coincidem
    return amp(esq) > w * 0.06 && amp(cen) < Math.max(w * 0.05, amp(esq) * 0.6) && Math.abs(meio - w / 2) < w * 0.06;
  } catch {
    return false;
  }
}
