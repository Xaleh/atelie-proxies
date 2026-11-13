/**
 * Escreve a tradução sobre a arte em inglês, num canvas do navegador.
 * O molde automático é o do site de produção do ateliê, portado sem mudar as
 * medidas: moldura moderna (2015) e moldura antiga (1993). O molde manual usa
 * os retângulos marcados no painel para aquela arte.
 */
import {
  acharArte,
  acharTinta,
  acharTopoPR,
  apagarTinta,
  blurRegion,
  cobrir,
  limparTexto,
  lum,
  mediana,
  rgb,
  type Ctx,
  type OpcoesDeLimpeza,
  type Quadro,
  type RGB,
} from "./pixels";
import type { MetaDeFace, MetaDeImpressao, MoldeManual, Ret } from "./tipos";

export type TextoParaDesenhar = { nome: string; tipo: string; texto: string; sabor: string };
type Fonte = Ctx | OffscreenCanvasRenderingContext2D;

// Fontes livres: Crimson Pro (títulos e regras) e Inter (rodapé).
const FONT_T = "'Crimson Pro',Georgia,serif";
const FONT_R = "'Crimson Pro',Georgia,serif";
const FONT_F = "Inter,'Helvetica Neue',Arial,sans-serif";

// Posições na moldura moderna (2015), em fração da largura (x) e da altura (y) da imagem.
const GEO = {
  name: { x0: 0.072, y0: 0.053, y1: 0.099, tx: 0.0863, base: 0.0905, cap: 0.0262, right: 0.932, sym: 0.0543 },
  type: { x0: 0.072, x1: 0.856, y0: 0.567, y1: 0.613, tx: 0.0863, base: 0.5995, cap: 0.0232 },
  text: { x0: 0.07, x1: 0.921, y0: 0.629, y1: 0.924, ptTop: 0.874, ptLeft: 0.77, tx: 0.083, tr: 0.913, fundo: 0.898 },
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

/**
 * Escreve uma linha (nome ou tipo) no tamanho da carta. Se não couber, primeiro
 * estreita a letra até 80%, como as cartas impressas fazem com nomes longos, e
 * só então diminui o tamanho.
 */
function escreverAjustado(g: Ctx, txt: string, x: number, base: number, fam: string, peso: number, capPx: number, maxW: number) {
  const s0 = fitLine(g, txt, fam, peso, capPx, 1e9), w = g.measureText(txt).width;
  let sx = 1;
  if (w > maxW) {
    sx = Math.max(0.8, maxW / w);
    if (w * sx > maxW) setFont(g, (s0 * maxW) / (w * sx), false, peso, fam);
  }
  g.save();
  g.translate(x, base);
  g.scale(sx, 1);
  g.fillText(txt, 0, 0);
  g.restore();
}

/* Símbolos oficiais de Magic ({T}, {Q}, manas, híbridos...), nos arquivos SVG que o Scryfall publica. */
const ENDERECO_DOS_SIMBOLOS = "https://svgs.scryfall.io/card-symbols";
const SIMB_OK = new Map<string, HTMLImageElement>();
const SIMB_PROMESSA = new Map<string, Promise<HTMLImageElement | null>>();
const arquivoDoSimbolo = (sym: string) => sym.toUpperCase().replace(/\//g, "").replace(/[^A-Z0-9½∞]/g, "");

async function baixarSimbolo(codigo: string): Promise<HTMLImageElement | null> {
  try {
    const r = await fetch(`${ENDERECO_DOS_SIMBOLOS}/${encodeURIComponent(codigo)}.svg`);
    if (!r.ok) return null;
    let svg = await r.text();
    if (!/<svg/i.test(svg)) return null;
    // sem largura declarada, alguns navegadores desenham o SVG com tamanho zero no canvas
    if (!/<svg[^>]*\swidth=/i.test(svg)) svg = svg.replace(/<svg/i, '<svg width="300" height="300"');
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    await new Promise((ok, erro) => {
      img.onload = ok;
      img.onerror = erro;
      img.src = url;
    });
    SIMB_OK.set(codigo, img);
    return img;
  } catch {
    return null; // sem internet ou símbolo desconhecido: usa o desenho simples
  }
}

/** Deixa prontos os símbolos que aparecem nos textos. Quem falhar é desenhado à mão e tentado de novo depois. */
function carregarSimbolos(...textos: string[]): Promise<unknown> {
  const codigos = new Set<string>();
  textos.forEach((t) => (String(t || "").match(/\{[^}]+\}/g) || []).forEach((m) => codigos.add(arquivoDoSimbolo(m.slice(1, -1)))));
  return Promise.all(
    [...codigos].filter(Boolean).map((c) => {
      let p = SIMB_PROMESSA.get(c);
      if (!p) {
        p = baixarSimbolo(c);
        SIMB_PROMESSA.set(c, p);
        p.then((img) => {
          if (!img) setTimeout(() => SIMB_PROMESSA.delete(c), 60_000);
        });
      }
      return p;
    }),
  );
}

// Medido nas cartas impressas: o símbolo tem ~1,18 vez a altura da maiúscula, com o topo alinhado
// ao topo das maiúsculas e a parte de baixo passando um pouco da linha de base.
let razaoCap: number | null = null;
function alturaCap(g: Ctx): number {
  if (razaoCap) return razaoCap;
  setFont(g, 100);
  const r = g.measureText("H").actualBoundingBoxAscent / 100;
  razaoCap = r > 0.45 && r < 0.85 ? r : 0.62;
  return razaoCap;
}
const larguraSimbolo = (g: Ctx, size: number) => alturaCap(g) * size * 1.32;

// Proporção altura-x / tamanho da fonte (cada fonte tem a letra minúscula de uma altura).
let razaoX: number | null = null;
function alturaX(g: Ctx): number {
  if (razaoX) return razaoX;
  setFont(g, 100);
  const r = g.measureText("x").actualBoundingBoxAscent / 100;
  razaoX = r > 0.3 && r < 0.7 ? r : 0.45;
  return razaoX;
}

function drawSym(g: Ctx, sym: string, x: number, base: number, size: number): number {
  const cap = alturaCap(g) * size, d = cap * 1.18, oficial = SIMB_OK.get(arquivoDoSimbolo(sym));
  if (oficial) {
    g.drawImage(oficial, x, base - cap, d, d);
    return d + cap * 0.14;
  }
  const r = d / 2, cx = x + r, cy = base - cap + r;
  size = d / 0.8; // as proporções do desenho de reserva foram feitas para d = 0,8 do tamanho
  const s = sym.toUpperCase(), parts = s.split("/");
  g.save();
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

type Token = { sym?: string; sp?: boolean; w?: string; it?: boolean };
type TokenNaLinha = Token & { x: number };

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

/**
 * Caixa do texto de regras. `maxX` e `minX` são a altura da letra minúscula
 * (altura-x) maior e menor que o texto pode ter. Com `ptY`, as linhas que
 * descem abaixo do topo da caixa de P/R ficam mais curtas (`ptW`) e o texto
 * pode ir até `fundo`.
 */
type Caixa = { x: number; w: number; y: number; h: number; maxX: number; minX: number; ptY?: number | null; ptW?: number; fundo?: number };
type Plano = { linhas: Array<{ itens: TokenNaLinha[]; y: number }>; h: number; sep: number | null; size: number; xh: number; cabe: boolean };

// O texto é dimensionado pela altura da letra minúscula, como nas cartas impressas:
// linhas a 2 vezes essa altura. Só diminui se não couber.
function planejarTexto(g: Ctx, paras: string[], flavor: string, box: Caixa, xh: number, emL: boolean): Plano {
  const size = xh / alturaX(g), lh = xh * 2.02, pg = xh * 0.72, gapSabor = xh * 1.9;
  const limite = emL ? (box.fundo ?? box.y + box.h) : box.y + box.h;
  const ptY = emL ? (box.ptY ?? Infinity) : Infinity;
  const largura = (y: number) => (box.y + y + lh > ptY ? (box.ptW ?? box.w) : box.w);
  const linhas: Plano["linhas"] = [];
  let y = 0, sep: number | null = null;
  const blocos = paras.map((p) => ({ toks: tokenize(p), sabor: false }));
  if (flavor) blocos.push({ toks: tokenize(flavor, true), sabor: true });
  setFont(g, size);
  const spW = g.measureText(" ").width;
  blocos.forEach((bl, i) => {
    if (i) {
      if (bl.sabor) {
        sep = y + gapSabor / 2;
        y += gapSabor;
      } else y += pg;
    }
    let linha: TokenNaLinha[] = [], w = 0, sp = false, maxW = largura(y);
    for (const t of bl.toks) {
      if (t.sp) {
        sp = linha.length > 0;
        continue;
      }
      let tw: number;
      if (t.sym) tw = larguraSimbolo(g, size);
      else {
        setFont(g, size, t.it);
        tw = g.measureText(t.w!).width;
      }
      const gap = sp ? spW : 0;
      if (linha.length && w + gap + tw > maxW) {
        linhas.push({ itens: linha, y });
        y += lh;
        maxW = largura(y);
        linha = [];
        w = 0;
      } else if (linha.length) w += gap;
      linha.push({ ...t, x: w });
      w += tw;
      sp = false;
    }
    if (linha.length) {
      linhas.push({ itens: linha, y });
      y += lh;
    }
  });
  return { linhas, h: y, sep, size, xh, cabe: box.y + y <= limite + xh * 0.3 };
}

function layoutText(g: Ctx, tr: TextoParaDesenhar, box: Caixa, color: string) {
  const paras = String(tr.texto || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const flavor = String(tr.sabor || "").trim();
  const procurar = (emL: boolean): Plano => {
    for (let xh = box.maxX; ; xh *= 0.97) {
      const p = planejarTexto(g, paras, flavor, box, xh, emL);
      if (p.cabe || xh <= box.minX) return p;
    }
  };
  let plan = procurar(false), emL = false;
  // texto longo: tenta correr também pelo espaço ao lado da caixa de P/R, se isso deixar a letra maior
  if (box.ptY && plan.xh < box.maxX * 0.995) {
    const l = procurar(true);
    if (l.cabe && l.xh > plan.xh * 1.02) {
      plan = l;
      emL = true;
    }
  }
  const { xh, size } = plan;
  const y0 = box.y + (emL ? 0 : Math.max(0, (box.h - plan.h) / 2));
  if (plan.sep != null) {
    g.save();
    g.strokeStyle = color;
    g.globalAlpha = 0.45;
    g.lineWidth = Math.max(1, size * 0.05);
    g.beginPath();
    g.moveTo(box.x + box.w * 0.03, y0 + plan.sep);
    g.lineTo(box.x + box.w * 0.97, y0 + plan.sep);
    g.stroke();
    g.restore();
  }
  for (const linha of plan.linhas) {
    const base = y0 + linha.y + xh * 1.55; // a linha de base fica a 1,55 altura-x do topo da linha
    for (const t of linha.itens) {
      if (t.sym) drawSym(g, t.sym, box.x + t.x, base, size);
      else {
        setFont(g, size, t.it);
        g.fillStyle = color;
        g.textAlign = "left";
        g.textBaseline = "alphabetic";
        g.fillText(t.w!, box.x + t.x, base);
      }
    }
  }
}

/**
 * Molde automático da moldura de 2015. Em vez de cobrir as caixas, apaga só as
 * letras em inglês: a arte vista através da caixa translúcida, a textura e a
 * marca d'água pequena continuam.
 */
function moldeModerno(g: Ctx, W: number, H: number, info: MetaDeFace, tr: TextoParaDesenhar) {
  const N = GEO.name, nSym = (info.mana.match(/\{[^}]+\}/g) || []).length;
  const nx0 = N.x0 * W, nx1 = (N.right - nSym * N.sym - 0.012) * W, ny0 = N.y0 * H, ny1 = N.y1 * H;
  // tira o texto antigo da barra e devolve a cor do texto novo
  const bar = (x: number, y: number, w: number, h: number) => {
    const claroAntes = lum(mediana(g, x, y, w, h)) > 0.5;
    const fundo = limparTexto(g, x, y, x + w, y + h, H);
    return (fundo ? lum(fundo) > 0.5 : claroAntes) ? "#111" : "#fff";
  };
  // nome
  g.fillStyle = bar(nx0, ny0, nx1 - nx0, ny1 - ny0);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  escreverAjustado(g, tr.nome || info.nome, N.tx * W, N.base * H, FONT_T, 700, N.cap * H, nx1 - N.tx * W - 0.01 * W);
  // tipo
  const Ty = GEO.type, yx0 = Ty.x0 * W, yx1 = Ty.x1 * W, yy0 = Ty.y0 * H, yy1 = Ty.y1 * H;
  g.fillStyle = bar(yx0, yy0, yx1 - yx0, yy1 - yy0);
  escreverAjustado(g, tr.tipo || info.tipo, Ty.tx * W, Ty.base * H, FONT_T, 700, Ty.cap * H, yx1 - Ty.tx * W - 0.01 * W);
  // caixa de texto
  const T = GEO.text, tx0 = T.x0 * W, tx1 = T.x1 * W, ty0 = T.y0 * H, ty1 = T.y1 * H, pt = info.temPT;
  const col = mediana(g, tx0, ty0, tx1 - tx0, (T.ptTop - T.y0) * H);
  const ptY = pt ? acharTopoPR(g, W, H, col, T.ptTop * H) : ty1;
  const rects: Quadro[] = pt
    ? [
        [tx0, ty0, tx1 - tx0, ptY - ty0],
        [tx0, ptY, T.ptLeft * W - tx0, ty1 - ptY],
      ]
    : [[tx0, ty0, tx1 - tx0, ty1 - ty0]];
  // o selo holográfico invade a borda de baixo da caixa: fica intacto (com uma pequena folga)
  const selo = (x: number, y: number) => ((x - 0.5 * W) / (0.066 * W)) ** 2 + ((y - 0.9375 * H) / (0.037 * H)) ** 2 <= 1;
  g.save();
  g.beginPath();
  g.rect(0, 0, W, H);
  g.ellipse(0.5 * W, 0.9375 * H, 0.0605 * W, 0.0332 * H, 0, 0, Math.PI * 2);
  g.clip("evenodd");
  let fundoDaCaixa: RGB | null = null;
  const op: OpcoesDeLimpeza = { protegido: selo }; // a decisão sobre a marca d'água vale para a caixa toda
  rects.forEach((r, i) => {
    const f = limparTexto(g, r[0], r[1], r[0] + r[2], r[1] + r[3], H, op);
    if (i === 0) {
      fundoDaCaixa = f;
      if (!op.marca) op.marca = false;
    }
  });
  g.restore();
  const color = lum(fundoDaCaixa || col) > 0.5 ? "#111" : "#fff";
  const limitePT = pt ? Math.min(ptY, T.ptTop * H) - 0.004 * H : null;
  const top = ty0 + 0.006 * H, bottom = limitePT ?? T.fundo * H;
  layoutText(
    g,
    tr,
    {
      x: T.tx * W,
      w: (T.tr - T.tx) * W,
      y: top,
      h: bottom - top,
      maxX: 0.0165 * H,
      minX: 0.0112 * H,
      ptY: limitePT,
      ptW: (T.ptLeft - T.tx - 0.012) * W,
      fundo: T.fundo * H,
    },
    color,
  );
  trocaIdiomaRodape(g, W, H, "PT");
}

/**
 * Moldura antiga (1993): nome e tipo escritos direto na moldura, caixa de
 * texto com textura. Os scans variam, então o nome é procurado logo acima da
 * ilustração e o tipo logo abaixo.
 */
function moldeAntigo(g: Ctx, W: number, H: number, info: MetaDeFace, tr: TextoParaDesenhar) {
  const linha = (txt: string, faixa: [number, number, number, number], capMin: number, capMax: number) => {
    const t = acharTinta(g, ...faixa);
    if (!t) return;
    const cap = Math.min(capMax * H, Math.max(capMin * H, t.cap));
    const px = 0.006 * W, py = 0.006 * H;
    const fundo = mediana(g, faixa[0], faixa[1], faixa[2] - faixa[0], faixa[3] - faixa[1]);
    // apaga só os pixels das letras antigas, preenchendo com a textura da moldura em volta
    apagarTinta(g, t.x - px, t.y - py, t.x2 + px, t.y2 + py, H);
    // na moldura de 1993 o nome e o tipo são brancos com sombra, menos na moldura branca (texto preto)
    const escuro = lum(fundo) > 0.7;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    fitLine(g, txt, FONT_T, 700, cap, faixa[2] - t.x - 0.01 * W);
    if (!escuro) {
      g.fillStyle = "rgba(0,0,0,.75)";
      g.fillText(txt, t.x + 0.0018 * W, t.base + 0.0018 * W);
    }
    g.fillStyle = escuro ? "#141414" : "#f5f3ee";
    g.fillText(txt, t.x, t.base);
  };
  const nSym = (info.mana.match(/\{[^}]+\}/g) || []).length;
  const arte = acharArte(g, W, H);
  linha(
    tr.nome || info.nome,
    [0.055 * W, 0.018 * H, (0.925 - nSym * 0.052 - 0.015) * W, Math.min(0.093 * H, arte.y0 - 0.004 * H)],
    0.019,
    0.027,
  );
  linha(tr.tipo || info.tipo, [0.06 * W, 0.559 * H, 0.72 * W, 0.598 * H], 0.016, 0.021);
  const cx = { x0: 0.113 * W, x1: 0.897 * W, y0: 0.606 * H, y1: 0.874 * H };
  const cor = cobrir(g, [[cx.x0, cx.y0, cx.x1 - cx.x0, cx.y1 - cx.y0]], mediana(g, 0.2 * W, 0.62 * H, 0.6 * W, 0.23 * H));
  const m = 0.02 * W;
  layoutText(
    g,
    tr,
    { x: cx.x0 + m, w: cx.x1 - cx.x0 - 2 * m, y: cx.y0 + 0.008 * H, h: cx.y1 - cx.y0 - 0.016 * H, maxX: 0.0175 * H, minX: 0.0112 * H },
    cor,
  );
}

/** Molde marcado à mão no painel: cada campo vai para o retângulo que o Augusto desenhou. */
function moldeManual(g: Ctx, W: number, H: number, info: MetaDeFace, tr: TextoParaDesenhar, m: MoldeManual) {
  const pinta = (r: Ret) => {
    const x = r.x * W, y = r.y * H, w = r.w * W, h = r.h * H;
    let cor: string;
    if (m.fundo === "desfoque") {
      blurRegion(g, x, y, w, h);
      g.fillStyle = "rgba(0,0,0,.45)";
      g.fillRect(x, y, w, h);
      cor = "#fff";
    } else if (m.fundo === "limpar") {
      const antes = mediana(g, x, y, w, h);
      cor = lum(limparTexto(g, x, y, x + w, y + h, H) ?? antes) > 0.5 ? "#111" : "#fff";
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
    escreverAjustado(g, texto, a.x + pad, a.y + a.h / 2 + cap / 2, FONT_T, 700, cap, a.w - 2 * pad);
  };
  if (m.nome) linha(m.nome, tr.nome || info.nome, 0.5);
  if (m.tipo) linha(m.tipo, tr.tipo || info.tipo, 0.45);
  if (m.texto) {
    const a = pinta(m.texto);
    const pad = Math.min(a.w, a.h) * 0.06;
    layoutText(g, tr, { x: a.x + pad, w: a.w - 2 * pad, y: a.y + pad, h: a.h - 2 * pad, maxX: 0.0165 * H, minX: 0.008 * H }, a.cor);
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
  await carregarSimbolos(texto.texto, texto.sabor);
  if (molde !== "auto") moldeManual(g, W, H, info, texto, molde);
  else if (meta.frame === "1993") moldeAntigo(g, W, H, info, texto);
  else moldeModerno(g, W, H, info, texto);
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
