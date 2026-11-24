/**
 * Escreve a tradução sobre a arte em inglês, num canvas do navegador.
 * O molde automático é o do site de produção do ateliê, portado sem mudar as
 * medidas: moldura moderna (2015, inclusive aventuras, sagas que transformam,
 * cartas modais, Secret Lair com a barra de tipo mais baixa, fundo liso sem
 * caixa e painel futurista), terreno básico de arte inteira, texto solto sobre
 * a arte (moldura de quadrinho) e molduras antigas (1993, 1997 e 2003). Os
 * símbolos da carta nunca são redesenhados: o molde mede na imagem onde estão
 * as letras em inglês e apaga só elas. Antes de escrever, confere se a imagem
 * tem uma diagramação conhecida. O molde manual usa os retângulos marcados no
 * painel para aquela arte.
 */
import {
  acharArte,
  acharCaixaBordas,
  acharTinta,
  acharTopoPR,
  ajusteBarra,
  apagarContornado,
  apagarFio,
  apagarTinta,
  barrasPainel,
  blurRegion,
  bordasHorizontais,
  corDoTexto,
  deslocamentoTipo,
  extensaoTexto,
  limitesFaixa,
  limparTexto,
  linhasContornadas,
  linhasFundoLiso,
  lum,
  mediana,
  rgb,
  textoCentralizado,
  topoDaMoldura,
  trechosDeBorda,
  type BarrasDoPainel,
  type Ctx,
  type FundoLiso,
  type LinhaAchada,
  type LinhaLisa,
  type OpcoesDeLimpeza,
  type Quadro,
  type RGB,
} from "./pixels";
import { ENCAIXE, ehEncaixe, type LetraEnviada } from "../tipografia";
import {
  basicoDeArteInteira,
  basicoComMoldura,
  conferirSimbolos,
  ehAventura,
  type MetaDeFace,
  type MetaDeImpressao,
  type MoldeManual,
  type Ret,
} from "./tipos";

type TextoDaParte = { nome: string; tipo: string; texto: string; sabor: string };
/** Nas cartas de aventura, `aventura` leva o texto da página esquerda do livro. */
export type TextoParaDesenhar = TextoDaParte & { aventura?: TextoDaParte };
type Fonte = Ctx | OffscreenCanvasRenderingContext2D;

// A primeira família de cada lista é a fonte que o ateliê envia pelo painel
// (/admin/fontes); ela só existe na página quando há arquivo enviado. Sem ela,
// valem as fontes livres: Crimson Pro (títulos e regras) e Inter (rodapé).
const FONT_T = `'${ENCAIXE.titulo.familia}','Crimson Pro',Georgia,serif`;
const FONT_R = `'${ENCAIXE.regras.familia}','Crimson Pro',Georgia,serif`;
const FONT_F = `'${ENCAIXE.rodape.familia}',Inter,'Helvetica Neue',Arial,sans-serif`;
// Molduras de painel futurista (Star Trek): letras altas e bem estreitas.
const FONT_CONDENSADA = "'Antonio','Arial Narrow',Arial,sans-serif";

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
let letrasDoPainel: FontFace[] = [];
let pedirDeNovo = false;

/**
 * Registra na página as fontes enviadas pelo painel. O arquivo vale para
 * qualquer peso pedido (o navegador não engrossa a letra por conta própria).
 * Qualquer falha deixa o encaixe na fonte livre.
 */
async function registrarLetrasDoPainel(): Promise<void> {
  let letras: LetraEnviada[] = [];
  try {
    const res = await fetch("/api/fontes", pedirDeNovo ? { cache: "reload" } : undefined);
    if (res.ok) letras = ((await res.json()) as { letras?: LetraEnviada[] }).letras ?? [];
  } catch {
    return;
  }
  pedirDeNovo = false;
  await Promise.all(
    letras.map(async (l) => {
      const e = ehEncaixe(l.encaixe) ? ENCAIXE[l.encaixe] : null;
      if (!e || !/^\/api\/fontes\/[a-z-]+\?v=[0-9a-f]+$/.test(l.url)) return;
      try {
        const face = new FontFace(e.familia, `url(${l.url})`, { style: e.italico ? "italic" : "normal", weight: "100 900" });
        await face.load();
        document.fonts.add(face);
        letrasDoPainel.push(face);
      } catch {
        // arquivo que o navegador não leu: fica a fonte livre
      }
    }),
  );
}

export function carregarFontes(): Promise<unknown> {
  if (!fontesProntas) {
    fontesProntas = registrarLetrasDoPainel().then(() =>
      Promise.all(
        [`700 40px ${FONT_T}`, `700 40px ${FONT_CONDENSADA}`, `400 40px ${FONT_R}`, `italic 400 40px ${FONT_R}`, `500 40px ${FONT_F}`].map((f) =>
          document.fonts.load(f).catch(() => null),
        ),
      ),
    );
  }
  return fontesProntas;
}

/**
 * Depois de trocar uma fonte no painel: tira as registradas e esquece as
 * medidas, para o próximo desenho buscar a lista de novo.
 */
export function esquecerFontes(): void {
  for (const face of letrasDoPainel) document.fonts.delete(face);
  letrasDoPainel = [];
  fontesProntas = null;
  pedirDeNovo = true;
  razaoCap = null;
  razaoX = null;
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
function escreverAjustado(
  g: Ctx,
  txt: string,
  x: number,
  base: number,
  fam: string,
  peso: number,
  capPx: number,
  maxW: number,
  contorno?: number,
) {
  const s0 = fitLine(g, txt, fam, peso, capPx, 1e9), w = g.measureText(txt).width;
  let sx = 1;
  if (w > maxW) {
    sx = Math.max(0.8, maxW / w);
    if (w * sx > maxW) setFont(g, (s0 * maxW) / (w * sx), false, peso, fam);
  }
  g.save();
  g.translate(x, base);
  g.scale(sx, 1);
  if (contorno) {
    // letra branca com borda preta (molduras de quadrinho)
    g.lineJoin = "round";
    g.strokeStyle = "#000";
    g.lineWidth = contorno;
    g.strokeText(txt, 0, 0);
  }
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

// Medido nas cartas impressas: o símbolo tem ~1,4 vez a altura da maiúscula e desce um pouco
// abaixo da linha de base.
let razaoCap: number | null = null;
function alturaCap(g: Ctx): number {
  if (razaoCap) return razaoCap;
  setFont(g, 100);
  const r = g.measureText("H").actualBoundingBoxAscent / 100;
  razaoCap = r > 0.45 && r < 0.85 ? r : 0.62;
  return razaoCap;
}
const larguraSimbolo = (g: Ctx, size: number) => alturaCap(g) * size * 1.58;

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
  const cap = alturaCap(g) * size, d = cap * 1.4, oficial = SIMB_OK.get(arquivoDoSimbolo(sym));
  if (oficial) {
    g.drawImage(oficial, x, base - cap * 1.2, d, d);
    return d + cap * 0.18;
  }
  const r = d / 2, cx = x + r, cy = base - cap * 1.2 + r;
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

/** Área onde o texto corre. Com `ptY`, as linhas que descem abaixo do topo da caixa de P/R ficam mais curtas (`ptW`) e o texto pode ir até `fundo`. */
type Area = {
  x: number;
  w: number;
  y: number;
  h: number;
  ptY?: number | null;
  ptW?: number;
  fundo?: number;
  /** Altura-x do tamanho padrão da carta: os símbolos ficam sempre nesse tamanho. */
  symX?: number;
  maxX?: number;
};
/**
 * Caixa do texto de regras. `maxX` e `minX` são a altura da letra minúscula
 * (altura-x) maior e menor que o texto pode ter. `topo` começa no alto da
 * caixa em vez de centralizar na altura; `centrar` centraliza cada linha;
 * `contorno` desenha a borda preta das letras, em fração do tamanho da fonte.
 */
type Caixa = Area & {
  maxX: number;
  minX: number;
  topo?: boolean;
  centrar?: boolean;
  contorno?: number;
};
type Plano = {
  linhas: Array<{ itens: TokenNaLinha[]; y: number; w: number }>;
  h: number;
  sep: number | null;
  size: number;
  symSize: number;
  xh: number;
  cabe: boolean;
};

// O texto é dimensionado pela altura da letra minúscula (altura-x), como nas cartas impressas.
// Só diminui se não couber.
function planejarTexto(g: Ctx, paras: string[], flavor: string, box: Area, xh: number, emL: boolean): Plano {
  // os símbolos ficam sempre no tamanho da carta original (o da letra no tamanho padrão); só as letras diminuem
  const size = xh / alturaX(g), symSize = Math.max(size, (box.symX || box.maxX || xh) / alturaX(g));
  // medidas tiradas das cartas impressas
  const lh = xh * 2.22, lhSym = Math.max(lh, alturaCap(g) * symSize * 1.5), pg = xh * 0.85, gapSabor = xh * 2.1;
  const limite = emL ? (box.fundo ?? box.y + box.h) : box.y + box.h;
  const ptY = emL ? (box.ptY ?? Infinity) : Infinity;
  const largura = (y: number) => (box.y + y + lh > ptY ? (box.ptW ?? box.w) : box.w);
  const linhas: Plano["linhas"] = [];
  let y = 0, sep: number | null = null;
  const blocos = paras.map((p) => ({ toks: tokenize(p), sabor: false }));
  if (flavor) blocos.push({ toks: tokenize(flavor, true), sabor: true });
  setFont(g, size);
  const spW = g.measureText(" ").width;
  const altura = (linha: TokenNaLinha[]) => (linha.some((t) => t.sym) ? lhSym : lh);
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
      if (t.sym) tw = larguraSimbolo(g, symSize);
      else {
        setFont(g, size, t.it);
        tw = g.measureText(t.w!).width;
      }
      const gap = sp ? spW : 0;
      if (linha.length && w + gap + tw > maxW) {
        linhas.push({ itens: linha, y, w });
        y += altura(linha);
        maxW = largura(y);
        linha = [];
        w = 0;
      } else if (linha.length) w += gap;
      linha.push({ ...t, x: w });
      w += tw;
      sp = false;
    }
    if (linha.length) {
      linhas.push({ itens: linha, y, w });
      y += altura(linha);
    }
  });
  return { linhas, h: y, sep, size, symSize, xh, cabe: box.y + y <= limite + xh * 0.3 };
}

function layoutText(g: Ctx, tr: { texto: string; sabor: string }, box: Caixa, color: string) {
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
  const y0 = box.y + (emL || box.topo ? 0 : Math.max(0, (box.h - plan.h) / 2));
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
    // texto curto, grande e centralizado no original: cada linha centralizada, como nas impressas
    const dx = box.centrar ? Math.max(0, (box.w - linha.w) / 2) : 0;
    for (const t of linha.itens) {
      if (t.sym) drawSym(g, t.sym, box.x + dx + t.x, base + (plan.symSize - size) * alturaCap(g) * 0.09, plan.symSize);
      else {
        setFont(g, size, t.it);
        g.fillStyle = color;
        g.textAlign = "left";
        g.textBaseline = "alphabetic";
        if (box.contorno) {
          g.lineJoin = "round";
          g.strokeStyle = "#000";
          g.lineWidth = size * box.contorno;
          g.strokeText(t.w!, box.x + dx + t.x, base);
        }
        g.fillText(t.w!, box.x + dx + t.x, base);
      }
    }
  }
}

/** A arte tem diagramação especial, que o molde automático não reconhece. */
export class ErroDeDiagramacao extends Error {
  constructor() {
    super("Esta arte tem uma diagramação especial e não pode ser traduzida. Escolha outra arte ou deixe em inglês.");
    this.name = "ErroDeDiagramacao";
  }
}

type Faixa = [x0: number, y0: number, x1: number, y1: number];
const simbolosDoCusto = (mana: string) => (mana.match(/\{[^}]+\}/g) || []).length;
const DUAS_FACES = ["transform", "modal_dfc"];

/**
 * Troca o texto de uma barra (nome ou tipo) apagando SÓ onde estavam as letras
 * em inglês: ícones, custo de mana, símbolo da coleção e as caixinhas em volta
 * deles ficam intactos. Escreve o português a partir do mesmo ponto.
 * `lim` é até onde as letras podem estar; `ate`, até onde o texto novo pode ir;
 * `tx`, onde as letras começam (posição padrão da moldura).
 */
function trocarTextoBarra(
  g: Ctx,
  W: number,
  H: number,
  txt: string,
  base: number,
  cap: number,
  y0: number,
  y1: number,
  lim: { x0: number; x1: number },
  ate: number,
  tx: number,
) {
  // as letras antigas são apagadas só de tx até onde terminam
  const ya = Math.max(y0, base - cap * 1.3), yb = Math.min(y1, base + cap * 0.45);
  const t = acharTinta(g, Math.max(lim.x0, tx - 0.012 * W), ya, lim.x1, yb);
  const xa = Math.max(lim.x0, tx - 0.016 * W), xb = t ? Math.min(lim.x1, Math.max(t.x2, tx) + 0.01 * W) : lim.x1;
  const op: OpcoesDeLimpeza = {}, antes = mediana(g, xa, ya, xb - xa, yb - ya), fundo = limparTexto(g, xa, ya, xb, yb, H, op);
  g.fillStyle = corDoTexto(op, fundo, antes);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  escreverAjustado(g, txt, tx, base, FONT_T, 700, cap, ate - tx - 0.006 * W);
}

type OpcoesDaLinha = {
  capMin?: number;
  capMax?: number;
  ate?: number;
  sombra?: boolean;
  fonte?: string;
  maiusculas?: boolean;
  /** Barra de cor lisa: cobre as letras antigas com a própria cor da barra. */
  liso?: boolean;
  /** Limpa a faixa inteira (só as letras saem), para o preenchimento enxergar o ornamento em volta. */
  estrito?: boolean;
  espelho?: boolean;
  folga?: number;
  cor?: RGB;
  /** Texto centralizado onde estava o original, com largura de até `larguraMax`. */
  centro?: boolean;
  larguraMax?: number;
};

/** Uma linha de texto achada na imagem: apaga as letras antigas e escreve a nova no mesmo lugar, mesma altura e cor. */
function trocarLinha(g: Ctx, W: number, H: number, txt: string, faixa: Faixa, op: OpcoesDaLinha = {}): boolean {
  if (op.maiusculas) txt = txt.toLocaleUpperCase("pt-BR");
  const FT = op.fonte || FONT_T, PESO = 700;
  const t = acharTinta(g, ...faixa);
  if (!t) return false;
  const cap = Math.min((op.capMax || 0.03) * H, Math.max((op.capMin || 0.012) * H, t.cap));
  const px = 0.006 * W, py = 0.005 * H;
  const daFaixa = () => mediana(g, faixa[0], faixa[1], faixa[2] - faixa[0], faixa[3] - faixa[1]);
  let fundo: RGB | null;
  if (op.liso) {
    // sem sobrar sombra das letras antigas
    fundo = daFaixa();
    g.fillStyle = rgb(fundo);
    g.fillRect(t.x - 0.006 * W, faixa[1], t.x2 - t.x + 0.016 * W, faixa[3] - faixa[1]);
  } else {
    const rx0 = op.estrito ? faixa[0] : Math.max(faixa[0], t.x - px), ry0 = op.estrito ? faixa[1] : Math.max(faixa[1], t.y - py);
    const rx1 = op.estrito ? Math.min(faixa[2], t.x2 + 0.04 * W) : Math.min(faixa[2], t.x2 + px);
    const ry1 = op.estrito ? faixa[3] : Math.min(faixa[3], t.y2 + py);
    fundo = limparTexto(g, rx0, ry0, rx1, ry1, H, { folga: op.folga, espelho: op.espelho, estrito: op.estrito });
  }
  // cor das letras originais; se não der para medir, contraste com o fundo
  const lf = lum(fundo || daFaixa());
  let cor: RGB = t.cor && Math.abs(lum(t.cor) - lf) > 0.3 ? t.cor : t.claras ? [245, 243, 238] : [20, 20, 20];
  if (op.cor) cor = op.cor;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  if (op.sombra && lum(cor) > 0.5) {
    g.fillStyle = "rgba(0,0,0,.75)";
    escreverAjustado(g, txt, t.x + 0.0018 * W, t.base + 0.0018 * W, FT, PESO, cap, (op.ate || faixa[2]) - t.x);
  }
  g.fillStyle = rgb(cor);
  let x = t.x, maxW = (op.ate || faixa[2]) - t.x;
  if (op.centro) {
    // linha de tipo das molduras de livro de histórias
    maxW = op.larguraMax || faixa[2] - faixa[0];
    fitLine(g, txt, FT, PESO, cap, 1e9);
    const w = Math.min(g.measureText(txt).width, maxW);
    x = (t.x + t.x2) / 2 - w / 2;
  }
  escreverAjustado(g, txt, x, t.base, FT, PESO, cap, maxW);
  return true;
}

/**
 * Molde automático da moldura de 2015. Em vez de cobrir as caixas, mede na
 * imagem onde estão as letras em inglês e apaga só elas: custo de mana, símbolo
 * da coleção, ícone de duas faces ou de lição, selo holográfico, indicador de
 * P/R do verso, a arte vista através da caixa translúcida e a textura continuam.
 * `dy` é quanto a barra de tipo está abaixo do lugar padrão.
 */
function moldeModerno(g: Ctx, W: number, H: number, meta: MetaDeImpressao, face: number, info: MetaDeFace, tr: TextoParaDesenhar, dy: number) {
  // carta de duas faces ou lição: o ícone fica à esquerda do nome
  const dfc = DUAS_FACES.includes(meta.layout);
  const iconeEsperado = dfc || /\bLesson\b/.test(meta.tipo);
  // algumas impressões têm as barras um pouco mais baixas ou altas: mede na imagem e acompanha
  const dyN = ajusteBarra(g, W, H, 0.02, 0.14, 0.056, 0.033, 0.05);
  const N = { ...GEO.name, y0: GEO.name.y0 + dyN, y1: GEO.name.y1 + dyN, base: GEO.name.base + dyN };
  const nSym = simbolosDoCusto(info.mana), ny0 = N.y0 * H, ny1 = N.y1 * H;
  // a barra é medida na própria imagem: o ícone à esquerda e o custo de mana à direita não são tocados
  const lfN = limitesFaixa(g, W, H, ny0, ny1, { simbolos: nSym, tx: N.tx, icone: iconeEsperado });
  // as letras do nome começam depois do ícone e da moldura dele (que vai até ~13,5% da largura);
  // se o ícone não foi achado na imagem, a área padrão dele fica intacta mesmo assim
  const nx0 = iconeEsperado ? 0.142 * W : 0.06 * W;
  // nunca passa do começo do custo de mana: o menor entre o medido e o calculado pelo número de símbolos
  const nx1 = Math.min(nSym && lfN.livre < 0.94 * W ? lfN.livre - 0.006 * W : W, (N.right - nSym * N.sym - 0.012) * W);
  const txNome = iconeEsperado ? (lfN.txLetra && lfN.txLetra < 0.2 * W ? lfN.txLetra : 0.155 * W) : N.tx * W;
  trocarTextoBarra(g, W, H, tr.nome || info.nome, N.base * H, N.cap * H, ny0, ny1, { x0: nx0, x1: nx1 }, nx1, txNome);
  // tipo
  const Ty = { ...GEO.type, y0: GEO.type.y0 + dy, y1: GEO.type.y1 + dy, base: GEO.type.base + dy }, yy0 = Ty.y0 * H, yy1 = Ty.y1 * H;
  const lfT = limitesFaixa(g, W, H, yy0, yy1, { tx: Ty.tx });
  const yx1 = Math.min(Ty.x1 * W, lfT.livre < 0.94 * W ? lfT.livre - 0.006 * W : W); // nunca chega no símbolo da coleção
  trocarTextoBarra(g, W, H, tr.tipo || info.tipo, Ty.base * H, Ty.cap * H, yy0, yy1, { x0: 0.06 * W, x1: yx1 }, yx1, Ty.tx * W);
  if (ehAventura(meta) && tr.aventura) return moldeAventura(g, W, H, meta, tr, tr.aventura);
  // terreno básico com moldura comum: a caixa só tem o símbolo grande de mana e fica como está
  if (basicoComMoldura(meta)) return;
  // caixa de texto
  const T = { ...GEO.text, y0: GEO.text.y0 + dy }, ext = extensaoTexto(g, GEO.text.x0 * W, (GEO.text.y0 + dy) * H, GEO.text.x1 * W, 0.88 * H);
  // a limpeza começa um pouco antes da primeira letra: a moldura em volta da caixa fica intacta
  const tx0 = ext && ext[0] - 0.01 * W > T.x0 * W ? Math.min(ext[0] - 0.01 * W, 0.085 * W) : T.x0 * W;
  const tx1 = T.x1 * W, ty0 = T.y0 * H, ty1 = T.y1 * H, pt = info.temPT;
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
  // frente de carta que transforma: o P/R do verso aparece pequeno acima do P/R ("4/4") e fica como está
  const ind = dfc && face === 0 && Boolean(meta.faces[1]?.temPT);
  const indicador = (x: number, y: number) =>
    (ind && x > 0.862 * W && y > 0.844 * H && y < 0.872 * H) ||
    (meta.layout === "modal_dfc" && x < 0.56 * W && y > 0.872 * H); // faixa do verso das cartas modais ("◀ Land  {T}: Add")
  // texto curto, grande e centralizado (Inversão de Ondu)
  const centrado = !pt && !info.sabor && !/\n/.test(info.texto) && textoCentralizado(g, tx0, ty0, tx1, Math.min(ty1, 0.885 * H)).centrado;
  // o texto em inglês às vezes passa ao lado do "4/4": limpa também esse canto (o indicador fica protegido)
  if (ind && ptY < T.ptTop * H) rects.push([T.ptLeft * W, ptY, tx1 - T.ptLeft * W, T.ptTop * H - ptY]);
  g.save();
  g.beginPath();
  g.rect(0, 0, W, H);
  g.ellipse(0.5 * W, 0.9375 * H, 0.0605 * W, 0.0332 * H, 0, 0, Math.PI * 2);
  g.clip("evenodd");
  let fundoDaCaixa: RGB | null = null;
  // a decisão sobre a marca d'água vale para a caixa toda
  const op: OpcoesDeLimpeza = { protegido: (x, y) => selo(x, y) || indicador(x, y), circulos: true };
  rects.forEach((r, i) => {
    const f = limparTexto(g, r[0], r[1], r[0] + r[2], r[1] + r[3], H, op);
    if (i === 0) {
      fundoDaCaixa = f;
      if (!op.marca) op.marca = false;
    }
  });
  const color = corDoTexto(op, fundoDaCaixa, col);
  g.restore();
  const ptL = Math.min(ptY, T.ptTop * H, ind ? 0.822 * H : Infinity); // onde o texto passa a desviar do P/R
  const top = ty0 + 0.006 * H, bottom = pt ? ptL - 0.004 * H : T.fundo * H;
  const fundoTxt = meta.layout === "modal_dfc" ? 0.868 * H : bottom; // a faixa do verso fica livre
  layoutText(
    g,
    tr,
    {
      x: T.tx * W,
      w: (T.tr - T.tx) * W,
      y: top,
      h: Math.min(bottom, fundoTxt) - top,
      maxX: centrado ? 0.021 * H : 0.0165 * H,
      minX: 0.0112 * H,
      ptY: pt ? ptL - 0.004 * H : null,
      ptW: (T.ptLeft - T.tx - 0.012) * W,
      fundo: T.fundo * H,
      centrar: centrado,
    },
    color,
  );
  const outra = meta.faces[1 - face];
  if (meta.layout === "modal_dfc" && outra) faixaDoVerso(g, W, H, outra.tipo);
}

// Carta modal: na faixa de baixo ("◀ Land  {T}: Add {W}") traduz só o tipo da outra face; o resto fica como está.
const TIPO_PT: Record<string, string> = {
  Land: "Terreno",
  Creature: "Criatura",
  Instant: "Mágica Instantânea",
  Sorcery: "Feitiço",
  Artifact: "Artefato",
  Enchantment: "Encantamento",
  Planeswalker: "Planeswalker",
  Battle: "Batalha",
};
function faixaDoVerso(g: Ctx, W: number, H: number, tipo: string) {
  const base = String(tipo || "").replace(/^Legendary\s+|^Snow\s+|^Basic\s+/g, "").split(/\s+[—-]\s+/)[0].split(/\s+/).pop();
  const pt = base ? TIPO_PT[base] : undefined;
  if (!pt) return;
  // a palavra fica na pílula cinza da esquerda, logo depois do triângulo
  const t = acharTinta(g, 0.065 * W, 0.893 * H, 0.2 * W, 0.918 * H);
  if (!t) return;
  const cap = 0.0125 * H, x1 = Math.min(t.x2 + 0.006 * W, 0.2 * W);
  const op: OpcoesDeLimpeza = { folga: 1.6 }, antes = mediana(g, t.x, 0.895 * H, x1 - t.x, 0.02 * H);
  const f = limparTexto(g, t.x - 0.003 * W, 0.894 * H, x1, 0.917 * H, H, op);
  g.fillStyle = corDoTexto(op, f, antes);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  escreverAjustado(g, pt, t.x, t.base, FONT_T, 700, cap, 0.12 * W); // antes do {T} da faixa
}

// Aventura (moldura de 2015): a caixa de texto é um livro aberto. Página da esquerda = aventura
// (faixa com nome e custo, faixa com o tipo e o texto); página da direita = texto da criatura, com o P/R embaixo.
const GEO_AV = {
  nome: { x0: 0.075, y0: 0.634, y1: 0.669, tx: 0.085, base: 0.6615, cap: 0.0185, right: 0.476, sym: 0.041 },
  tipo: { x0: 0.075, y0: 0.675, y1: 0.712, x1: 0.478, tx: 0.085, base: 0.7025, cap: 0.0175 },
  esq: { x0: 0.07, y0: 0.716, x1: 0.484, y1: 0.915 },
  dir: { x0: 0.51, y0: 0.632, x1: 0.93, y1: 0.915, ptTop: 0.885, ptLeft: 0.768 },
};

function moldeAventura(g: Ctx, W: number, H: number, meta: MetaDeImpressao, tr: TextoParaDesenhar, trAv: TextoDaParte) {
  const A = GEO_AV, cr = meta.faces[0], av = meta.faces[1];
  // tira o texto antigo da faixa e devolve a cor do texto novo
  const bar = (x: number, y: number, w: number, h: number) => {
    const antes = mediana(g, x, y, w, h), op: OpcoesDeLimpeza = {};
    return corDoTexto(op, limparTexto(g, x, y, x + w, y + h, H, op), antes);
  };
  // faixa do nome da aventura (o custo de mana à direita fica como está)
  const nSym = simbolosDoCusto(av.mana), nx1 = (A.nome.right - nSym * A.nome.sym - 0.008) * W;
  g.fillStyle = bar(A.nome.x0 * W, A.nome.y0 * H, nx1 - A.nome.x0 * W, (A.nome.y1 - A.nome.y0) * H);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  escreverAjustado(g, trAv.nome || av.nome, A.nome.tx * W, A.nome.base * H, FONT_T, 700, A.nome.cap * H, nx1 - A.nome.tx * W - 0.006 * W);
  // faixa do tipo da aventura
  g.fillStyle = bar(A.tipo.x0 * W, A.tipo.y0 * H, (A.tipo.x1 - A.tipo.x0) * W, (A.tipo.y1 - A.tipo.y0) * H);
  escreverAjustado(g, trAv.tipo || av.tipo, A.tipo.tx * W, A.tipo.base * H, FONT_T, 700, A.tipo.cap * H, (A.tipo.x1 - A.tipo.tx - 0.008) * W);
  // página da esquerda: texto da aventura
  const E = A.esq;
  apagarFio(g, (E.x0 + 0.02) * W, E.y0 * H, (E.x1 - 0.02) * W, E.y1 * H, H);
  const opE: OpcoesDeLimpeza = { marca: false }, fe = limparTexto(g, E.x0 * W, E.y0 * H, E.x1 * W, E.y1 * H, H, opE);
  layoutText(
    g,
    { texto: trAv.texto, sabor: trAv.sabor || "" },
    { x: (E.x0 + 0.013) * W, w: (E.x1 - E.x0 - 0.022) * W, y: (E.y0 + 0.004) * H, h: (E.y1 - E.y0 - 0.01) * H, maxX: 0.0145 * H, minX: 0.0095 * H },
    corDoTexto(opE, fe, [230, 220, 210]),
  );
  // página da direita: texto da criatura, em L em volta do P/R
  const D = A.dir, pt = cr.temPT, ptY = D.ptTop * H;
  const rects: Quadro[] = pt
    ? [
        [D.x0 * W, D.y0 * H, (D.x1 - D.x0) * W, ptY - D.y0 * H],
        [D.x0 * W, ptY, (D.ptLeft - D.x0) * W, D.y1 * H - ptY],
      ]
    : [[D.x0 * W, D.y0 * H, (D.x1 - D.x0) * W, (D.y1 - D.y0) * H]];
  apagarFio(g, (D.x0 + 0.03) * W, D.y0 * H, (D.x1 - 0.02) * W, ptY, H);
  const opD: OpcoesDeLimpeza = { marca: false };
  let fd: RGB | null = null;
  rects.forEach((r, i) => {
    const f = limparTexto(g, r[0], r[1], r[0] + r[2], r[1] + r[3], H, i ? { marca: false } : opD);
    if (i === 0) fd = f;
  });
  const x = (D.x0 + 0.022) * W, top = (D.y0 + 0.006) * H;
  layoutText(
    g,
    tr,
    {
      x,
      w: (D.x1 - D.x0 - 0.03) * W,
      y: top,
      h: (pt ? ptY - 0.004 * H : D.y1 * H) - top,
      maxX: 0.0145 * H,
      minX: 0.0095 * H,
      ptY: pt ? ptY - 0.004 * H : null,
      ptW: (D.ptLeft - 0.012) * W - x,
      fundo: (D.y1 - 0.01) * H,
    },
    corDoTexto(opD, fd, [230, 220, 210]),
  );
}

/**
 * Aventura com moldura de "livro de histórias" (Trono de Eldraine): tudo achado
 * na imagem (nome, tipo centralizado, faixas da aventura); páginas com medida própria.
 */
function moldeAventuraLivro(g: Ctx, W: number, H: number, meta: MetaDeImpressao, tr: TextoParaDesenhar, trAv: TextoDaParte) {
  const cr = meta.faces[0], av = meta.faces[1];
  const nC = simbolosDoCusto(cr.mana), nA = simbolosDoCusto(av.mana);
  trocarLinha(g, W, H, tr.nome || cr.nome, [0.145 * W, 0.04 * H, (0.93 - nC * 0.052 - 0.015) * W, 0.115 * H], { capMin: 0.02, capMax: 0.026 });
  trocarLinha(g, W, H, tr.tipo || cr.tipo, [0.2 * W, 0.565 * H, 0.8 * W, 0.615 * H], { capMin: 0.016, capMax: 0.025, centro: true, larguraMax: 0.6 * W });
  trocarLinha(g, W, H, trAv.nome || av.nome, [0.07 * W, 0.628 * H, (0.478 - nA * 0.05 - 0.01) * W, 0.672 * H], { capMin: 0.015, capMax: 0.024, folga: 1.6, estrito: true });
  trocarLinha(g, W, H, trAv.tipo || av.tipo, [0.07 * W, 0.676 * H, 0.485 * W, 0.717 * H], { capMin: 0.014, capMax: 0.022, folga: 1.6, estrito: true });
  // página da esquerda (texto da aventura, centralizado na altura como na impressa)
  const E = { x0: 0.084, y0: 0.733, x1: 0.481, y1: 0.879 };
  apagarFio(g, (E.x0 + 0.02) * W, E.y0 * H, (E.x1 - 0.02) * W, E.y1 * H, H);
  const opE: OpcoesDeLimpeza = { marca: false }, fe = limparTexto(g, E.x0 * W, E.y0 * H, E.x1 * W, E.y1 * H, H, opE);
  layoutText(
    g,
    { texto: trAv.texto, sabor: trAv.sabor || "" },
    { x: (E.x0 + 0.016) * W, w: (E.x1 - E.x0 - 0.028) * W, y: (E.y0 + 0.006) * H, h: (E.y1 - E.y0 - 0.012) * H, maxX: 0.0128 * H, minX: 0.0095 * H },
    corDoTexto(opE, fe, [230, 220, 200]),
  );
  // página da direita (criatura); o P/R fica abaixo da página
  const D = { x0: 0.524, y0: 0.648, x1: 0.906, y1: 0.878 };
  apagarFio(g, (D.x0 + 0.03) * W, D.y0 * H, (D.x1 - 0.02) * W, D.y1 * H, H);
  const opD: OpcoesDeLimpeza = { marca: false }, fd = limparTexto(g, D.x0 * W, D.y0 * H, D.x1 * W, D.y1 * H, H, opD);
  layoutText(
    g,
    tr,
    { x: (D.x0 + 0.016) * W, w: (D.x1 - D.x0 - 0.028) * W, y: (D.y0 + 0.01) * H, h: (D.y1 - D.y0 - 0.02) * H, maxX: 0.0128 * H, minX: 0.0095 * H },
    corDoTexto(opD, fd, [230, 220, 200]),
  );
}

/** A carta tem as barras e caixas onde o molde espera? (moldura de quadrinho, arte que toma a carta toda etc. não têm) */
function diagramacaoReconhecida(g: Ctx, W: number, H: number, meta: MetaDeImpressao): boolean {
  if (meta.frame === "2015" && basicoDeArteInteira(meta))
    // terreno básico de arte inteira: barra de tipo embaixo
    return bordasHorizontais(g, W, H, 0.82, 0.865, 0.2, 0.8).sc > 0.7 && bordasHorizontais(g, W, H, 0.88, 0.93, 0.2, 0.8).sc > 0.7;
  // as outras têm a barra de tipo (ou o fim da arte e o começo da caixa) no meio da carta
  // (numa barra translúcida uma das bordas some um pouco atrás da arte)
  const a = bordasHorizontais(g, W, H, 0.53, 0.59).sc, b = bordasHorizontais(g, W, H, 0.59, 0.65).sc;
  return Math.max(a, b) > 0.8 && Math.min(a, b) > 0.45;
}

type TextoSolto = { nome: LinhaAchada | undefined; tipo: LinhaAchada; regras: LinhaAchada[] };

/** Acha nome, linha de tipo e texto de regras escritos direto sobre a arte. Devolve null se não achar tipo e regras. */
function acharTextoSolto(g: Ctx, W: number, H: number, meta: MetaDeImpressao): TextoSolto | null {
  if (meta.frame !== "2015" || basicoDeArteInteira(meta)) return null;
  const melhor = (ls: LinhaAchada[]): LinhaAchada | undefined => ls.sort((p, q) => q.n - p.n)[0];
  const tipo = melhor(linhasContornadas(g, W, H, 0.05, 0.52, 0.8, 0.63).filter((l) => l.xa < 0.2 && l.y1 - l.y0 <= 0.03));
  if (!tipo) return null;
  const cand = linhasContornadas(g, W, H, 0.05, tipo.y1 + 0.004, 0.95, 0.82).filter((l) => l.xa < 0.2);
  if (!cand.length || cand[0].y0 - tipo.y1 > 0.06) return null;
  const regras = [cand[0]];
  for (const l of cand.slice(1)) {
    const ult = regras[regras.length - 1], alt = ult.y1 - ult.y0;
    if (l.y0 - ult.y1 < alt * 1.6) regras.push(l);
    else break;
  }
  if (Math.max(...regras.map((l) => l.xbTodo)) - regras[0].xa < 0.3) return null;
  const nome = melhor(linhasContornadas(g, W, H, 0.05, 0.02, 0.78, 0.09).filter((l) => l.xa < 0.2));
  return { nome, tipo, regras };
}

/** Texto branco com borda preta direto sobre a arte (moldura de quadrinho). */
function moldeSolto(g: Ctx, W: number, H: number, info: MetaDeFace, tr: TextoParaDesenhar, det: TextoSolto) {
  const nSym = simbolosDoCusto(info.mana);
  const area = (l: LinhaAchada, px = 0.008, py = 0.006) =>
    [(l.xa - px) * W, (l.y0 - py) * H, (l.xb + px) * W, (l.y1 + py) * H] as const;
  const rg = det.regras, y0 = rg[0].y0, y1 = rg[rg.length - 1].y1, xa = rg[0].xa;
  // primeiro apaga todo o inglês e só depois escreve: assim a arte usada para refazer o fundo nunca tem letra nova
  if (det.nome) apagarContornado(g, ...area(det.nome), H, true, true);
  apagarContornado(g, ...area(det.tipo), H, true, true);
  // o bloco inteiro do texto de regras, até a ponta da linha mais comprida
  apagarContornado(g, (xa - 0.012) * W, (y0 - 0.008) * H, Math.min(0.97, Math.max(...rg.map((l) => l.xbTodo)) + 0.03) * W, (y1 + 0.008) * H, H, true, true);
  const linha = (l: LinhaAchada, txt: string, ate: number, capMin: number) => {
    const cap = Math.max(capMin * H, (l.y1 - l.y0) * H * 0.9); // a linha achada vai do topo das maiúsculas até um pouco abaixo da base
    const base = l.y0 * H + cap * 1.03;
    g.fillStyle = "#fff";
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    escreverAjustado(g, txt, l.xa * W, base, FONT_T, 700, cap, ate * W - l.xa * W, Math.max(1.5, cap * 0.22));
  };
  if (det.nome) linha(det.nome, tr.nome || info.nome, 0.93 - nSym * 0.055 - 0.02, 0.02);
  linha(det.tipo, tr.tipo || info.tipo, 0.85, 0.017);
  const lh = rg.length > 1 ? (rg[rg.length - 1].y0 - rg[0].y0) / (rg.length - 1) : (y1 - y0) * 1.25;
  const xh = Math.min(0.017, Math.max(0.0105, lh / 2.02));
  layoutText(
    g,
    tr,
    { x: xa * W, w: (0.94 - xa) * W, y: (y0 - 0.004) * H, h: (y1 - y0 + 0.004 + lh * 0.6) * H, maxX: xh * H, minX: 0.0105 * H, topo: true, contorno: 0.16 },
    "#fff",
  );
}

/** Fundo preto liso sem caixa (Edge of Eternities): nome, tipo e regras escritos direto no fundo. */
function moldeFundoLiso(g: Ctx, W: number, H: number, info: MetaDeFace, tr: TextoParaDesenhar, det: FundoLiso) {
  const [nome, tipo, ...regras] = det.linhas;
  const faixa = (l: LinhaLisa): Faixa => [0.05 * W, (l.y0 - 0.006) * H, 0.95 * W, (l.y1 + 0.006) * H];
  // o texto antigo (e o resto colorido dos símbolos) é coberto com a própria cor do fundo
  trocarLinha(g, W, H, tr.nome || info.nome, faixa(nome), { capMin: 0.016, capMax: 0.03, cor: [245, 243, 238], liso: true });
  trocarLinha(g, W, H, tr.tipo || info.tipo, faixa(tipo), { capMin: 0.012, capMax: 0.022, cor: [245, 243, 238], liso: true });
  const y0 = regras[0].y0, y1 = regras[regras.length - 1].y1, xa = regras[0].xa;
  const ry0 = (y0 - 0.008) * H, ry1 = Math.min(0.905, y1 + 0.01) * H;
  const fundo = mediana(g, 0.05 * W, ry0, 0.9 * W, ry1 - ry0);
  g.fillStyle = rgb(fundo);
  g.fillRect(0.05 * W, ry0, 0.9 * W, ry1 - ry0);
  const lh = regras.length > 1 ? Math.min(...regras.slice(1).map((l, i) => l.y0 - regras[i].y0)) : (y1 - y0) * 1.25;
  layoutText(
    g,
    tr,
    { x: xa * W, w: (0.92 - xa) * W, y: (y0 - 0.004) * H, h: (0.9 - y0) * H, maxX: Math.min(0.016, Math.max(0.0105, lh / 2.02)) * H, minX: 0.0095 * H, topo: true },
    corDoTexto({ dir: 1 }, fundo, [10, 10, 10]),
  );
}

/** Painel futurista (Star Trek): só o nome e o tipo, em maiúsculas e na fonte condensada; a carta não tem caixa de regras. */
function moldePainel(g: Ctx, W: number, H: number, info: MetaDeFace, tr: TextoParaDesenhar, det: BarrasDoPainel) {
  const op: OpcoesDaLinha = { fonte: FONT_CONDENSADA, maiusculas: true, capMin: 0.022, capMax: 0.04, liso: true };
  trocarLinha(g, W, H, tr.nome || info.nome, [0.15 * W, (det.nome[0] + 0.004) * H, 0.93 * W, (det.nome[1] - 0.004) * H], op);
  // o emblema fica à direita
  trocarLinha(g, W, H, tr.tipo || info.tipo, [0.13 * W, (det.tipo[0] + 0.004) * H, 0.9 * W, (det.tipo[1] - 0.004) * H], { ...op, ate: 0.85 * W });
}

type Saga = { x0: number; x1: number; faixas: Array<[number, number]>; tipo: [number, number] };

/**
 * Saga (moldura moderna): coluna de capítulos à esquerda (I, II, III), cada um
 * numa faixa separada por fio duplo; nome em cima e linha de tipo na barra de baixo.
 */
function acharSaga(g: Ctx, W: number, H: number, meta: MetaDeImpressao): Saga | null {
  if (meta.frame !== "2015") return null;
  const v = trechosDeBorda(g, W, H, true, 0.02, 0.7, 0.2, 0.75, 0.7);
  const esq = v.find((t) => t[1] > 0.06 && t[1] < 0.11), dir = v.find((t) => t[0] > 0.4 && t[0] < 0.6);
  const bar = trechosDeBorda(g, W, H, false, 0.78, 0.95, 0.2, 0.8, 0.7);
  if (!esq || !dir || bar.length < 2) return null;
  const x0 = esq[1] + 0.004, x1 = dir[0] - 0.004;
  const h = trechosDeBorda(g, W, H, false, 0.1, 0.84, x0 + 0.06, x1 - 0.03, 0.7);
  const topo = h.find((t) => t[0] < 0.14), divs: Array<[number, number]> = [];
  for (let i = 0; i + 1 < h.length; i++)
    if (h[i][0] > 0.15 && h[i + 1][0] - h[i][1] <= 0.01 && h[i + 1][1] - h[i][0] < 0.02) {
      divs.push([h[i][0], h[i + 1][1]]);
      i++;
    }
  if (!topo || !divs.length) return null;
  const tb = bar.filter((t) => t[1] > 0.82 && t[1] < 0.87).pop();
  const bb = tb && bar.find((t) => t[0] - tb[1] > 0.03 && t[0] - tb[1] < 0.05);
  if (!tb || !bb) return null;
  const faixas: Array<[number, number]> = [];
  let y = topo[1] + 0.004;
  for (const d of divs) {
    faixas.push([y, d[0] - 0.003]);
    y = d[1] + 0.003;
  }
  faixas.push([y, tb[0] - 0.045]); // o P/R do verso ("5/4") fica no pé da coluna
  return { x0, x1, faixas, tipo: [tb[1], bb[0]] };
}

function moldeSaga(g: Ctx, W: number, H: number, meta: MetaDeImpressao, info: MetaDeFace, tr: TextoParaDesenhar, det: Saga) {
  // capítulos: "I — texto", "II, III — texto"; o lembrete inicial entre parênteses não é impresso nesta moldura
  const CAPITULO = /^[IVX]+(\s*,\s*[IVX]+)*\s*[—–-]/;
  const caps = String(tr.texto || "")
    .split(/\n+/)
    .map((t) => t.trim())
    .filter((t) => CAPITULO.test(t))
    .map((t) => t.replace(/^[IVX]+(\s*,\s*[IVX]+)*\s*[—–-]\s*/, ""));
  if (caps.length !== det.faixas.length) throw new ErroDeDiagramacao();
  const nSym = simbolosDoCusto(info.mana), N = GEO.name, dfc = DUAS_FACES.includes(meta.layout);
  const lf = limitesFaixa(g, W, H, N.y0 * H, N.y1 * H, { simbolos: nSym, tx: N.tx, icone: dfc });
  const nx1 = Math.min(lf.livre - 0.006 * W, (N.right - nSym * N.sym - 0.012) * W);
  const txNome = dfc ? (lf.txLetra && lf.txLetra < 0.2 * W ? lf.txLetra : 0.155 * W) : N.tx * W;
  trocarTextoBarra(g, W, H, tr.nome || info.nome, N.base * H, N.cap * H, N.y0 * H, N.y1 * H, { x0: (dfc ? 0.138 : 0.06) * W, x1: nx1 }, nx1, txNome);
  // linha de tipo na barra de baixo: base e altura das letras medidas na própria carta (até o símbolo da coleção)
  const lt = limitesFaixa(g, W, H, det.tipo[0] * H, det.tipo[1] * H, { tx: 0.086 });
  const tx1 = Math.min(0.86 * W, lt.livre - 0.012 * W); // o símbolo da coleção fica inteiro
  const tt = acharTinta(g, 0.07 * W, det.tipo[0] * H, Math.min(0.6 * W, tx1), det.tipo[1] * H);
  if (tt)
    trocarTextoBarra(g, W, H, tr.tipo || info.tipo, tt.base, Math.max(0.016 * H, Math.min(0.024 * H, tt.cap)), det.tipo[0] * H, det.tipo[1] * H, { x0: 0.06 * W, x1: tx1 }, tx1, tt.x);
  // o mesmo tamanho de letra em todos os capítulos: o menor que cabe em cada um
  let xh = 0.0165 * H;
  // o texto começa depois dos hexágonos dos capítulos
  const xt = Math.max(det.x0 + 0.012, 0.112);
  const boxes = det.faixas.map(([a, b]) => ({ x: xt * W, w: (det.x1 - xt - 0.012) * W, y: (a + 0.006) * H, h: (b - a - 0.012) * H }));
  boxes.forEach((bx, i) => {
    for (; xh > 0.0105 * H; xh *= 0.97) if (planejarTexto(g, [caps[i]], "", bx, xh, false).cabe) break;
  });
  boxes.forEach((bx, i) => {
    const op: OpcoesDeLimpeza = { marca: false };
    const f = limparTexto(g, bx.x - 0.006 * W, bx.y - 0.003 * H, bx.x + bx.w + 0.008 * W, bx.y + bx.h + 0.003 * H, H, op);
    layoutText(g, { texto: caps[i], sabor: "" }, { ...bx, maxX: xh, minX: xh, symX: 0.0165 * H }, corDoTexto(op, f, [200, 200, 200]));
  });
}

/** Terreno básico de arte inteira: nome em cima e "Terreno Básico — X" na barra de baixo. Não há caixa de texto. */
function moldeBasico(g: Ctx, W: number, H: number, info: MetaDeFace, tr: TextoParaDesenhar) {
  const N = GEO.name, nx0 = N.x0 * W, nx1 = (N.right - 0.012) * W; // barra de nome igual à das cartas comuns
  const op: OpcoesDeLimpeza = {}, antes = mediana(g, nx0, N.y0 * H, nx1 - nx0, (N.y1 - N.y0) * H);
  const fundo = limparTexto(g, nx0, N.y0 * H, nx1, N.y1 * H, H, op);
  g.fillStyle = corDoTexto(op, fundo, antes);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  escreverAjustado(g, tr.nome || info.nome, N.tx * W, N.base * H, FONT_T, 700, N.cap * H, nx1 - N.tx * W - 0.01 * W);
  // barra de baixo: o símbolo de mana fica à esquerda e o da edição à direita
  trocarLinha(g, W, H, tr.tipo || info.tipo, [0.18 * W, 0.842 * H, 0.85 * W, 0.892 * H], { capMin: 0.016, capMax: 0.025, ate: 0.84 * W });
}

/** Molduras de 1997 a 2014: nome, linha de tipo e caixa de texto achados na imagem. */
function moldeClassico(g: Ctx, W: number, H: number, meta: MetaDeImpressao, info: MetaDeFace, tr: TextoParaDesenhar) {
  const nSym = simbolosDoCusto(info.mana);
  const arte = acharArte(g, W, H), cx = acharCaixaBordas(g, W, H);
  if (!cx) throw new ErroDeDiagramacao();
  const altura = cx.y1 - cx.y0, largura = cx.x1 - cx.x0;
  if (altura < 0.18 * H || altura > 0.34 * H || largura < 0.65 * W) throw new ErroDeDiagramacao();
  const corDaCaixa = mediana(g, cx.x0, cx.y0, largura, altura);
  const moderna = meta.frame === "2003";
  // nome: na moldura de 2003 fica numa barra um pouco mais baixa; na de 1997, direto na moldura, acima da arte
  const nomeFaixa: Faixa = moderna
    ? [0.075 * W, 0.038 * H, (0.93 - nSym * 0.052 - 0.02) * W, Math.min(0.102 * H, Math.max(0.09 * H, arte.y0 - 0.003 * H))]
    : [0.07 * W, topoDaMoldura(g, W, H, 0.025 * H), (0.93 - nSym * 0.052 - 0.02) * W, Math.min(0.082 * H, arte.y0 - 0.003 * H)];
  trocarLinha(g, W, H, tr.nome || info.nome, nomeFaixa, { capMin: 0.018, capMax: 0.028, sombra: !moderna });
  // linha de tipo: entre a arte e a caixa, antes do símbolo da edição
  const yt0 = cx.tipo0 + 0.003 * H, yt1 = cx.tipo1 - 0.002 * H;
  if (yt1 - yt0 > 0.015 * H)
    trocarLinha(g, W, H, tr.tipo || info.tipo, [moderna ? 0.085 * W : 0.07 * W, yt0, 0.82 * W, yt1], {
      capMin: 0.013,
      capMax: 0.021,
      ate: 0.83 * W,
      sombra: !moderna,
    });
  // terreno básico com moldura comum: a caixa só tem o símbolo grande de mana e fica como está
  if (basicoComMoldura(meta)) return;
  // caixa de texto: apaga só as letras (a textura e a cor da caixa ficam); antes de 2003 não havia marca d'água
  const m = 0.012 * W;
  const op: OpcoesDeLimpeza = { marca: moderna ? undefined : false, circulos: true };
  const fundo = limparTexto(g, cx.x0, cx.y0, cx.x1, cx.y1, H, op);
  const cor = corDoTexto(op, fundo, corDaCaixa);
  // na moldura de 2003 a caixa de P/R invade o canto de baixo da caixa de texto
  const fim = cx.y1 - 0.008 * H, ptY = info.temPT && moderna ? cx.y1 - 0.03 * H : null;
  layoutText(
    g,
    tr,
    {
      x: cx.x0 + m,
      w: largura - 2 * m,
      y: cx.y0 + 0.008 * H,
      h: (ptY || fim) - cx.y0 - 0.008 * H,
      maxX: 0.0172 * H,
      minX: 0.0105 * H,
      ptY,
      ptW: largura * 0.72,
      fundo: fim,
    },
    cor,
  );
}

/**
 * Moldura antiga (1993): nome e tipo escritos direto na moldura, caixa de
 * texto com textura. Os scans variam, então o nome é procurado logo acima da
 * ilustração e o tipo logo abaixo.
 */
function moldeAntigo(g: Ctx, W: number, H: number, info: MetaDeFace, tr: TextoParaDesenhar, soNomeETipo = false) {
  const linha = (txt: string, faixa: Faixa, capMin: number, capMax: number) => {
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
  const nSym = simbolosDoCusto(info.mana);
  const arte = acharArte(g, W, H);
  linha(
    tr.nome || info.nome,
    [0.055 * W, topoDaMoldura(g, W, H, 0.028 * H), (0.925 - nSym * 0.052 - 0.015) * W, Math.min(0.093 * H, arte.y0 - 0.004 * H)],
    0.019,
    0.027,
  );
  linha(tr.tipo || info.tipo, [0.06 * W, 0.559 * H, 0.72 * W, 0.598 * H], 0.016, 0.021);
  // terreno básico: a caixa só tem o símbolo grande de mana e fica como está
  if (soNomeETipo) return;
  const cx = { x0: 0.113 * W, x1: 0.897 * W, y0: 0.606 * H, y1: 0.874 * H };
  const corDaCaixa = mediana(g, 0.2 * W, 0.62 * H, 0.6 * W, 0.23 * H);
  const { centrado, altura } = textoCentralizado(g, cx.x0, cx.y0, cx.x1, cx.y1);
  // tamanho da letra original: a linha medida vai do topo das maiúsculas ao pé das letras (~2 alturas-x)
  const xhOriginal = altura ? Math.min(0.025 * H, Math.max(0.011 * H, altura * 0.68)) : 0.0175 * H;
  // apaga só as letras: a textura da caixa fica
  const op: OpcoesDeLimpeza = { marca: false, circulos: true };
  const fundo = limparTexto(g, cx.x0, cx.y0, cx.x1, cx.y1, H, op);
  const cor = corDoTexto(op, fundo, corDaCaixa);
  const m = 0.02 * W;
  // quando a carta original tem o texto grande e centralizado, a traduzida também tem
  layoutText(
    g,
    tr,
    {
      x: cx.x0 + m,
      w: cx.x1 - cx.x0 - 2 * m,
      y: cx.y0 + 0.008 * H,
      h: cx.y1 - cx.y0 - 0.016 * H,
      maxX: centrado ? xhOriginal : 0.0175 * H,
      minX: 0.0112 * H,
      centrar: centrado,
    },
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

type Diagramacao =
  | { modo: "padrao"; dy: number }
  | { modo: "saga"; det: Saga }
  | { modo: "liso"; det: FundoLiso }
  | { modo: "painel"; det: BarrasDoPainel }
  | { modo: "solto"; det: TextoSolto };

/** Qual diagramação a imagem tem (null = nenhuma que o molde automático saiba desenhar). `info` é a face que está na imagem. */
function acharDiagramacao(g: Ctx, W: number, H: number, meta: MetaDeImpressao, info: MetaDeFace): Diagramacao | null {
  if (/Saga/i.test(info.tipo)) {
    const det = acharSaga(g, W, H, meta);
    return det ? { modo: "saga", det } : null;
  }
  if (diagramacaoReconhecida(g, W, H, meta)) return { modo: "padrao", dy: 0 };
  if (meta.frame === "2015" && !basicoDeArteInteira(meta) && !ehAventura(meta)) {
    const dy = deslocamentoTipo(g, W, H); // barra de tipo mais baixa: tipo e começo da caixa descem juntos
    if (dy != null) return { modo: "padrao", dy };
    const liso = linhasFundoLiso(g, W, H);
    if (liso) return { modo: "liso", det: liso };
    const painel = barrasPainel(g, W, H);
    if (painel) return { modo: "painel", det: painel };
  }
  const solto = acharTextoSolto(g, W, H, meta); // texto direto sobre a arte, como nas cartas de quadrinho
  return solto ? { modo: "solto", det: solto } : null;
}

/**
 * Molde automático: confere a diagramação da imagem e escolhe o desenho por
 * ela e pela moldura. Lança `ErroDeDiagramacao` se a arte não tiver uma
 * diagramação conhecida.
 */
function moldeAutomatico(g: Ctx, W: number, H: number, meta: MetaDeImpressao, face: number, info: MetaDeFace, tr: TextoParaDesenhar) {
  const d = acharDiagramacao(g, W, H, meta, info);
  if (!d) throw new ErroDeDiagramacao();
  if (d.modo === "solto") moldeSolto(g, W, H, info, tr, d.det);
  else if (d.modo === "liso") moldeFundoLiso(g, W, H, info, tr, d.det);
  else if (d.modo === "saga") moldeSaga(g, W, H, meta, info, tr, d.det);
  else if (d.modo === "painel") moldePainel(g, W, H, info, tr, d.det);
  // rodapé das molduras antigas: só o ilustrador, sem idioma
  else if (meta.frame === "1993") return moldeAntigo(g, W, H, info, tr, basicoComMoldura(meta));
  else if (meta.frame === "1997" || meta.frame === "2003") return moldeClassico(g, W, H, meta, info, tr);
  else if (basicoDeArteInteira(meta)) moldeBasico(g, W, H, info, tr);
  else if (ehAventura(meta) && tr.aventura && (meta.efeitos ?? []).includes("showcase")) moldeAventuraLivro(g, W, H, meta, tr, tr.aventura);
  else moldeModerno(g, W, H, meta, face, info, tr, d.dy || ajusteBarra(g, W, H, 0.52, 0.7, 0.571, 0.032, 0.05));
  trocaIdiomaRodape(g, W, H, "PT");
}

/**
 * Devolve uma cópia da imagem com a tradução. `tr.sabor` só aparece se a arte
 * original tiver ambientação. Os símbolos do texto de regras são conferidos
 * contra o original: se a tradução trocou algum, vale o do original. Com o
 * molde automático, lança `ErroDeDiagramacao` quando a arte tem diagramação especial.
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
  const aventura = ehAventura(meta);
  // na aventura a imagem é uma só e a parte 0 (criatura) dá o nome e o tipo da carta
  const info = (aventura ? meta.faces[0] : meta.faces[face]) ?? meta.faces[0];
  const texto: TextoParaDesenhar = {
    nome: tr.nome,
    tipo: tr.tipo,
    texto: conferirSimbolos(tr.texto, info.texto).texto,
    sabor: info.sabor ? tr.sabor : "",
  };
  if (aventura && tr.aventura)
    texto.aventura = {
      ...tr.aventura,
      texto: conferirSimbolos(tr.aventura.texto, meta.faces[1].texto).texto,
      sabor: meta.faces[1].sabor ? tr.aventura.sabor : "",
    };
  if (aventura && molde === "auto" && !texto.aventura) throw new Error("Falta a tradução de uma das duas partes desta carta de aventura.");
  await carregarSimbolos(texto.texto, texto.sabor, texto.aventura?.texto ?? "", texto.aventura?.sabor ?? "");
  if (molde !== "auto") moldeManual(g, W, H, info, texto, molde);
  else {
    try {
      moldeAutomatico(g, W, H, meta, face, info, texto);
    } catch (e) {
      c.width = c.height = 0;
      throw e;
    }
  }
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

const cacheDeConferencias = new Map<string, Promise<boolean>>();

/**
 * Confere, na imagem da frente, se o molde automático reconhece a diagramação
 * da arte, antes de a loja prometer a tradução. Sem conseguir baixar a imagem,
 * responde que sim: a conferência se repete na hora de desenhar.
 */
export function conferirDiagramacao(url: string, meta: MetaDeImpressao): Promise<boolean> {
  let p = cacheDeConferencias.get(url);
  if (!p) {
    p = (async () => {
      let bmp: ImageBitmap;
      try {
        bmp = await imagemDaCarta(url);
      } catch {
        cacheDeConferencias.delete(url);
        return true;
      }
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(bmp, 0, 0);
      try {
        return acharDiagramacao(g, c.width, c.height, meta, meta.faces[0]) !== null;
      } catch {
        return true;
      } finally {
        c.width = c.height = 0;
      }
    })();
    cacheDeConferencias.set(url, p);
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
