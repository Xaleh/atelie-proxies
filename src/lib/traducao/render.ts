/**
 * Escreve a tradução sobre a arte em inglês, num canvas do navegador.
 * O molde automático é o do site de produção anterior (moldura moderna de
 * 2015), portado sem mudar as medidas. O molde manual usa os retângulos
 * marcados no painel para aquela arte.
 */
import type { MetaDeFace, MetaDeImpressao, MoldeManual, Ret } from "./tipos";

export type TextoParaDesenhar = { nome: string; tipo: string; texto: string; sabor: string };
type Ctx = CanvasRenderingContext2D;
type RGB = [number, number, number];
type Fonte = Ctx | OffscreenCanvasRenderingContext2D;

// Fontes livres: Crimson Pro (títulos e regras) e Inter (rodapé).
const FONT_T = "'Crimson Pro',Georgia,serif";
const FONT_R = "'Crimson Pro',Georgia,serif";
const FONT_F = "Inter,'Helvetica Neue',Arial,sans-serif";

// Posições na moldura moderna (2015), em fração da largura (x) e da altura (y) da imagem.
const GEO = {
  name: { x0: 0.072, y0: 0.053, y1: 0.099, tx: 0.0863, base: 0.0905, cap: 0.0262, right: 0.932, sym: 0.0543 },
  type: { x0: 0.072, x1: 0.856, y0: 0.567, y1: 0.613, tx: 0.0863, base: 0.5995, cap: 0.0232 },
  text: { x0: 0.07, x1: 0.921, y0: 0.629, y1: 0.924, tx: 0.0863, tr: 0.91, ptTop: 0.874, ptLeft: 0.77 },
};
const SYM_COL: Record<string, string> = {
  W: "#f8f6d8",
  U: "#c1d7e9",
  B: "#bab1ab",
  R: "#e49977",
  G: "#a3c095",
  C: "#cac5c0",
};

let fontesProntas: Promise<unknown> | null = null;
export function carregarFontes(): Promise<unknown> {
  if (!fontesProntas) {
    fontesProntas = Promise.all(
      [`700 40px ${FONT_T}`, `400 40px ${FONT_R}`, `italic 400 40px ${FONT_R}`, `500 40px ${FONT_F}`].map((f) =>
        document.fonts.load(f).catch(() => null),
      ),
    );
  }
  return fontesProntas;
}

function mediana(g: Ctx, x: number, y: number, w: number, h: number): RGB {
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
const lum = (c: RGB) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const rgb = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

function setFont(g: Fonte, size: number, italic = false, weight = 400, fam = FONT_R) {
  g.font = `${italic ? "italic " : ""}${weight} ${size}px ${fam}`;
}

function fitLine(g: Ctx, text: string, fam: string, weight: number, capPx: number, maxW: number): number {
  let s = capPx / 0.66;
  setFont(g, s, false, weight, fam);
  const a = g.measureText("H").actualBoundingBoxAscent;
  if (a > 0) s = (s * capPx) / a;
  setFont(g, s, false, weight, fam);
  const w = g.measureText(text).width;
  if (w > maxW) {
    s *= maxW / w;
    setFont(g, s, false, weight, fam);
  }
  return s;
}

function blurRegion(g: Ctx, x: number, y: number, w: number, h: number) {
  const sm = document.createElement("canvas");
  sm.width = Math.max(1, Math.round(w / 18));
  sm.height = Math.max(1, Math.round(h / 18));
  const sg = sm.getContext("2d")!;
  sg.imageSmoothingQuality = "high";
  sg.drawImage(g.canvas, x, y, w, h, 0, 0, sm.width, sm.height);
  g.save();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(sm, 0, 0, sm.width, sm.height, x, y, w, h);
  g.restore();
}

function drawSym(g: Ctx, sym: string, x: number, base: number, size: number): number {
  const d = size * 0.8, r = d / 2, cx = x + r, cy = base - size * 0.3;
  const s = sym.toUpperCase(), parts = s.split("/");
  g.save();
  g.fillStyle = "rgba(0,0,0,.85)";
  g.beginPath();
  g.arc(cx + size * 0.03, cy + size * 0.04, r, 0, Math.PI * 2);
  g.fill();
  if (parts.length === 2 && SYM_COL[parts[0]] && SYM_COL[parts[1]]) {
    g.fillStyle = SYM_COL[parts[0]];
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 1.75);
    g.fill();
    g.fillStyle = SYM_COL[parts[1]];
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * 1.75, Math.PI * 2.75);
    g.fill();
  } else {
    g.fillStyle = SYM_COL[parts[0]] || "#cac5c0";
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#151515";
  g.strokeStyle = "#151515";
  if (s === "T" || s === "Q") {
    g.lineWidth = size * 0.085;
    g.beginPath();
    const a0 = s === "T" ? Math.PI * 0.95 : Math.PI * 0.05;
    const a1 = s === "T" ? Math.PI * 2.15 : -Math.PI * 1.15;
    g.arc(cx, cy, r * 0.5, a0, a1, s === "Q");
    g.stroke();
    const ex = cx + Math.cos(a1) * r * 0.5, ey = cy + Math.sin(a1) * r * 0.5, t = size * 0.13;
    g.beginPath();
    g.moveTo(ex - t, ey - t * 0.2);
    g.lineTo(ex + t, ey - t * 0.2);
    g.lineTo(ex, ey + t * 1.1);
    g.closePath();
    g.fill();
  } else {
    let label = parts[1] === "P" ? parts[0] : s.replace("/", "");
    if (s === "C") label = "◇";
    const fs = size * (label.length > 2 ? 0.38 : label.length > 1 ? 0.48 : 0.58);
    g.font = `700 ${fs}px ${FONT_T}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, cx, cy + size * 0.03);
  }
  g.restore();
  return d + size * 0.06;
}

type Token = { sym?: string; sp?: boolean; w?: string; it?: boolean; x?: number };

function tokenize(text: string, forceItalic = false): Token[] {
  const out: Token[] = [];
  let it = false;
  const re = /(\{[^}]+\})|(\s+)|([^\s{]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) out.push({ sym: m[1].slice(1, -1), it });
    else if (m[2]) out.push({ sp: true });
    else {
      const w = m[3];
      if (w.includes("(")) it = true;
      out.push({ w, it: it || forceItalic });
      if (w.includes(")")) it = false;
    }
  }
  return out;
}

function wrap(g: Ctx, toks: Token[], size: number, maxW: number): Token[][] {
  setFont(g, size);
  const spW = g.measureText(" ").width;
  const lines: Token[][] = [];
  let line: Token[] = [], w = 0, sp = false;
  for (const t of toks) {
    if (t.sp) {
      sp = line.length > 0;
      continue;
    }
    let tw: number;
    if (t.sym) tw = size * 0.86;
    else {
      setFont(g, size, t.it);
      tw = g.measureText(t.w!).width;
    }
    const gap = sp ? spW : 0;
    if (line.length && w + gap + tw > maxW) {
      lines.push(line);
      line = [];
      w = 0;
    } else if (line.length) w += gap;
    line.push({ ...t, x: w });
    w += tw;
    sp = false;
  }
  if (line.length) lines.push(line);
  return lines;
}

type Caixa = { x: number; w: number; y: number; h: number; maxSize: number; minSize: number };

function layoutText(g: Ctx, tr: TextoParaDesenhar, box: Caixa, color: string) {
  const paras = String(tr.texto || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const flavor = String(tr.sabor || "").trim();
  let size = box.maxSize;
  let plan: { blocks: Array<{ L: Token[][]; flavor?: boolean }>; h: number; lh: number; pg: number; size: number };
  for (;;) {
    const lh = size * 1.12, pg = size * 0.42;
    const blocks: Array<{ L: Token[][]; flavor?: boolean }> = [];
    let h = 0;
    paras.forEach((p, i) => {
      const L = wrap(g, tokenize(p), size, box.w);
      blocks.push({ L });
      h += (i ? pg : 0) + L.length * lh;
    });
    if (flavor) {
      const L = wrap(g, tokenize(flavor, true), size, box.w);
      blocks.push({ L, flavor: true });
      h += (paras.length ? size * 0.9 : 0) + L.length * lh;
    }
    plan = { blocks, h, lh, pg, size };
    if (h <= box.h || size <= box.minSize) break;
    size *= 0.96;
  }
  const { lh, pg } = plan;
  size = plan.size;
  let y = box.y + Math.max(0, (box.h - plan.h) / 2);
  plan.blocks.forEach((b, i) => {
    if (b.flavor && paras.length) {
      y += size * 0.45;
      g.save();
      g.strokeStyle = color;
      g.globalAlpha = 0.45;
      g.lineWidth = Math.max(1, size * 0.05);
      g.beginPath();
      g.moveTo(box.x + box.w * 0.03, y - size * 0.05);
      g.lineTo(box.x + box.w * 0.97, y - size * 0.05);
      g.stroke();
      g.restore();
      y += size * 0.45;
    } else if (i) y += pg;
    for (const line of b.L) {
      const base = y + size * 0.8;
      for (const t of line) {
        if (t.sym) drawSym(g, t.sym, box.x + t.x!, base, size);
        else {
          setFont(g, size, t.it);
          g.fillStyle = color;
          g.textAlign = "left";
          g.textBaseline = "alphabetic";
          g.fillText(t.w!, box.x + t.x!, base);
        }
      }
      y += lh;
    }
  });
}

/** Molde automático da moldura de 2015, igual ao do site de produção anterior. */
function moldeAutomatico(g: Ctx, W: number, H: number, meta: MetaDeImpressao, info: MetaDeFace, tr: TextoParaDesenhar) {
  const dark = meta.borda === "borderless" || meta.fullArt;
  const N = GEO.name, nSym = (info.mana.match(/\{[^}]+\}/g) || []).length;
  const nx0 = N.x0 * W, nx1 = (N.right - nSym * N.sym - 0.012) * W, ny0 = N.y0 * H, ny1 = N.y1 * H;
  const bar = (x: number, y: number, w: number, h: number) => {
    if (dark) {
      blurRegion(g, x, y, w, h);
      g.fillStyle = "rgba(0,0,0,.35)";
      g.fillRect(x, y, w, h);
      return "#fff";
    }
    const c = mediana(g, x, y, w, h);
    g.fillStyle = rgb(c);
    g.fillRect(x, y, w, h);
    return lum(c) > 0.5 ? "#111" : "#fff";
  };
  // nome
  g.fillStyle = bar(nx0, ny0, nx1 - nx0, ny1 - ny0);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  fitLine(g, tr.nome || info.nome, FONT_T, 700, N.cap * H, nx1 - N.tx * W - 0.01 * W);
  g.fillText(tr.nome || info.nome, N.tx * W, N.base * H);
  // tipo
  const Ty = GEO.type, yx0 = Ty.x0 * W, yx1 = Ty.x1 * W, yy0 = Ty.y0 * H, yy1 = Ty.y1 * H;
  g.fillStyle = bar(yx0, yy0, yx1 - yx0, yy1 - yy0);
  fitLine(g, tr.tipo || info.tipo, FONT_T, 700, Ty.cap * H, yx1 - Ty.tx * W - 0.01 * W);
  g.fillText(tr.tipo || info.tipo, Ty.tx * W, Ty.base * H);
  // caixa de texto
  const T = GEO.text, tx0 = T.x0 * W, tx1 = T.x1 * W, ty0 = T.y0 * H, ty1 = T.y1 * H, pt = info.temPT;
  const rects: Array<[number, number, number, number]> = pt
    ? [
        [tx0, ty0, tx1 - tx0, T.ptTop * H - ty0],
        [tx0, T.ptTop * H, T.ptLeft * W - tx0, ty1 - T.ptTop * H],
      ]
    : [[tx0, ty0, tx1 - tx0, ty1 - ty0]];
  let color: string;
  if (dark) {
    rects.forEach((r) => {
      blurRegion(g, ...r);
      g.fillStyle = "rgba(0,0,0,.45)";
      g.fillRect(...r);
    });
    color = "#fff";
  } else {
    const col = mediana(g, tx0, ty0, tx1 - tx0, ty1 - ty0);
    g.fillStyle = rgb(col);
    rects.forEach((r) => g.fillRect(...r));
    color = lum(col) > 0.5 ? "#111" : "#fff";
  }
  const top = ty0 + 0.009 * H, bottom = (pt ? T.ptTop : T.y1) * H - 0.007 * H;
  layoutText(g, tr, { x: T.tx * W, w: (T.tr - T.tx) * W, y: top, h: bottom - top, maxSize: 0.03 * H, minSize: 0.015 * H }, color);
  trocaIdiomaRodape(g, W, H, "PT");
}

/** Molde manual: pinta cada retângulo marcado e escreve o texto dentro. */
function moldeManual(g: Ctx, W: number, H: number, info: MetaDeFace, tr: TextoParaDesenhar, m: MoldeManual) {
  const pinta = (r: Ret) => {
    const x = r.x * W, y = r.y * H, w = r.w * W, h = r.h * H;
    let cor: string;
    if (m.fundo === "desfoque") {
      blurRegion(g, x, y, w, h);
      g.fillStyle = "rgba(0,0,0,.45)";
      g.fillRect(x, y, w, h);
      cor = "#fff";
    } else {
      const c = mediana(g, x, y, w, h);
      g.fillStyle = rgb(c);
      g.fillRect(x, y, w, h);
      cor = lum(c) > 0.5 ? "#111" : "#fff";
    }
    if (m.corTexto === "claro") cor = "#fff";
    if (m.corTexto === "escuro") cor = "#111";
    return { x, y, w, h, cor };
  };
  const linha = (r: Ret, texto: string, capFracao: number) => {
    const a = pinta(r);
    const pad = a.h * 0.28;
    const cap = a.h * capFracao;
    g.fillStyle = a.cor;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    fitLine(g, texto, FONT_T, 700, cap, a.w - 2 * pad);
    g.fillText(texto, a.x + pad, a.y + a.h / 2 + cap / 2);
  };
  if (m.nome) linha(m.nome, tr.nome || info.nome, 0.5);
  if (m.tipo) linha(m.tipo, tr.tipo || info.tipo, 0.45);
  if (m.texto) {
    const a = pinta(m.texto);
    const pad = Math.min(a.w, a.h) * 0.06;
    layoutText(
      g,
      tr,
      { x: a.x + pad, w: a.w - 2 * pad, y: a.y + pad, h: a.h - 2 * pad, maxSize: 0.03 * H, minSize: 0.012 * H },
      a.cor,
    );
  }
}

/**
 * Devolve uma cópia da imagem com a tradução. `tr.sabor` só aparece se a arte
 * original tiver ambientação.
 */
export async function renderizarTraducao(
  src: CanvasImageSource & { width: number; height: number },
  meta: MetaDeImpressao,
  face: number,
  tr: TextoParaDesenhar,
  molde: MoldeManual | "auto",
): Promise<HTMLCanvasElement> {
  await carregarFontes();
  const W = src.width, H = src.height;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(src, 0, 0);
  const info = meta.faces[face] ?? meta.faces[0];
  const texto = { ...tr, sabor: info.sabor ? tr.sabor : "" };
  if (molde === "auto") moldeAutomatico(g, W, H, meta, info, texto);
  else moldeManual(g, W, H, info, texto, molde);
  return c;
}

// No rodapé ("FRA • EN"), troca o código de idioma depois do ponto, como nas cartas impressas em português.
function trocaIdiomaRodape(g: Ctx, W: number, H: number, codigo: string) {
  try {
    const x0 = Math.round(0.055 * W), x1 = Math.round(0.33 * W), y0 = Math.round(0.949 * H), y1 = Math.round(0.969 * H);
    const bw = x1 - x0, bh = y1 - y0, d = g.getImageData(x0, y0, bw, bh).data;
    const L = (i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const all: number[] = [];
    for (let i = 0; i < d.length; i += 4) all.push(L(i));
    const sorted = [...all].sort((a, b) => a - b), bg = sorted[sorted.length >> 1];
    const ink = (x: number, y: number) => Math.abs(all[y * bw + x] - bg) > 90;
    const colInk: Array<[number, number] | null> = [];
    for (let x = 0; x < bw; x++) {
      let top = -1, bot = -1;
      for (let y = 0; y < bh; y++)
        if (ink(x, y)) {
          if (top < 0) top = y;
          bot = y;
        }
      colInk.push(top < 0 ? null : [top, bot]);
    }
    const gapTol = Math.max(1, Math.round(0.0025 * W));
    const groups: Array<{ x0: number; x1: number; top: number; bot: number }> = [];
    for (let x = 0; x < bw; x++) {
      const ci = colInk[x];
      if (!ci) continue;
      const gr = groups[groups.length - 1];
      if (gr && x - gr.x1 <= gapTol) {
        gr.x1 = x;
        gr.top = Math.min(gr.top, ci[0]);
        gr.bot = Math.max(gr.bot, ci[1]);
      } else groups.push({ x0: x, x1: x, top: ci[0], bot: ci[1] });
    }
    const capH = Math.max(...groups.slice(0, 3).map((gr) => gr.bot - gr.top + 1));
    // o ponto: estreito e baixo, entre as letras da edição e as do idioma
    const iDot = groups.findIndex((gr, i) => i >= 2 && gr.x1 - gr.x0 + 1 <= 0.009 * W && gr.bot - gr.top + 1 < capH * 0.6);
    if (iDot < 0 || groups.length < iDot + 3) return;
    const a = groups[iDot + 1], b = groups[iDot + 2];
    if (b.x1 - a.x0 > 0.06 * W || a.bot - a.top + 1 < capH * 0.7) return;
    let R = 0, G = 0, B = 0, n = 0;
    const fr: number[] = [], fg: number[] = [], fb: number[] = [];
    for (let x = a.x0 - 4; x <= b.x1 + 4; x++)
      for (let y = 0; y < bh; y++) {
        if (x < 0 || x >= bw) continue;
        const i = (y * bw + x) * 4, dl = Math.abs(all[y * bw + x] - bg);
        if (dl > 150) {
          R += d[i];
          G += d[i + 1];
          B += d[i + 2];
          n++;
        } else if (dl < 25) {
          fr.push(d[i]);
          fg.push(d[i + 1]);
          fb.push(d[i + 2]);
        }
      }
    const inkCol = n ? `rgb(${(R / n) | 0},${(G / n) | 0},${(B / n) | 0})` : "#fff";
    const med = (a2: number[]) => {
      a2.sort((p, q) => p - q);
      return a2[a2.length >> 1] || 0;
    };
    const bgc: RGB = fr.length ? [med(fr), med(fg), med(fb)] : mediana(g, x0 + a.x0, y0, b.x1 - a.x0 + 1, bh);
    const pad = Math.max(1, Math.round(0.002 * W));
    g.fillStyle = rgb(bgc);
    g.fillRect(
      x0 + a.x0 - pad,
      y0 + Math.min(a.top, b.top) - pad,
      b.x1 - a.x0 + 1 + 2 * pad,
      Math.max(a.bot, b.bot) - Math.min(a.top, b.top) + 1 + 2 * pad,
    );
    const base = y0 + Math.max(a.bot, b.bot) + 1;
    let fs = capH / 0.72;
    g.font = `700 ${fs}px ${FONT_F}`;
    const asc = g.measureText("P").actualBoundingBoxAscent;
    if (asc > 0) {
      fs *= capH / asc;
      g.font = `700 ${fs}px ${FONT_F}`;
    }
    g.fillStyle = inkCol;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    // cada letra no lugar da letra original, com a mesma largura
    ([[codigo[0], a], [codigo[1], b]] as const).forEach(([ch, gr]) => {
      const m = g.measureText(ch), w = m.actualBoundingBoxRight + m.actualBoundingBoxLeft || m.width, alvo = gr.x1 - gr.x0 + 1;
      g.save();
      g.translate(x0 + gr.x0 + (m.actualBoundingBoxLeft || 0), base);
      g.scale(Math.min(1.25, Math.max(0.8, alvo / w)), 1);
      g.fillText(ch, 0, 0);
      g.restore();
    });
  } catch {
    // se não reconhecer o rodapé, deixa como está
  }
}

const cacheDeImagens = new Map<string, Promise<ImageBitmap>>();

/** Baixa uma imagem do Scryfall uma vez só por endereço. */
export function imagemDaCarta(url: string): Promise<ImageBitmap> {
  let p = cacheDeImagens.get(url);
  if (!p) {
    p = fetch(url, { mode: "cors" })
      .then((r) => {
        if (!r.ok) throw new Error(`Não consegui baixar a imagem da carta (${r.status}).`);
        return r.blob();
      })
      .then((b) => createImageBitmap(b));
    p.catch(() => cacheDeImagens.delete(url));
    cacheDeImagens.set(url, p);
  }
  return p;
}

const cacheDePrevias = new Map<string, Promise<string>>();
let rodando = 0;
const fila: Array<() => void> = [];

async function vez<T>(fn: () => Promise<T>): Promise<T> {
  if (rodando >= 2) await new Promise<void>((r) => fila.push(r));
  rodando++;
  try {
    return await fn();
  } finally {
    rodando--;
    fila.shift()?.();
  }
}

/** Prévia em JPEG (data URL) da carta traduzida, guardada por combinação. */
export function previaTraduzida(
  url: string,
  meta: MetaDeImpressao,
  face: number,
  tr: TextoParaDesenhar,
  molde: MoldeManual | "auto",
): Promise<string> {
  const chave = JSON.stringify([url, face, tr, molde]);
  let p = cacheDePrevias.get(chave);
  if (!p) {
    p = vez(async () => {
      const c = await renderizarTraducao(await imagemDaCarta(url), meta, face, tr, molde);
      const dado = c.toDataURL("image/jpeg", 0.88);
      c.width = c.height = 0;
      return dado;
    });
    p.catch(() => cacheDePrevias.delete(chave));
    cacheDePrevias.set(chave, p);
  }
  return p;
}
