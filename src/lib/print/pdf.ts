/**
 * Geração do PDF de impressão, no navegador do ateliê. Portado do site de
 * produção original: cada carta é ampliada para a resolução escolhida, ganha a
 * sangria esticando a própria borda e entra na folha como JPEG.
 */
import { loja } from "@/config/loja";
import { CARD_H, CARD_W, POR_FOLHA, computeLayout, type Ajustes, type Layout } from "./layout";
import type { Slot } from "./lote";

type Progresso = (feitas: number, total: number, nome: string) => void;

const cacheJpeg = new Map<string, Uint8Array>();

async function baixarImagem(url: string): Promise<ImageBitmap> {
  let r: Response;
  try {
    r = await fetch(url, { mode: "cors" });
  } catch {
    throw new Error("Não consegui baixar a imagem de uma carta. Confira a internet e tente de novo.");
  }
  if (!r.ok) throw new Error(`Não consegui baixar a imagem de uma carta (${r.status}).`);
  return createImageBitmap(await r.blob());
}

async function cartaEmJpeg(url: string, s: Pick<Ajustes, "bleed" | "dpi" | "qual">): Promise<Uint8Array> {
  const chave = `${url}|${s.bleed}|${s.qual}|${s.dpi}`;
  const guardada = cacheJpeg.get(chave);
  if (guardada) return guardada;

  let bmp: ImageBitmap | HTMLCanvasElement = await baixarImagem(url);
  // Amplia para a resolução de impressão escolhida (o Scryfall entrega cerca de 300 dpi).
  const alvo = Math.round((CARD_W / 25.4) * (Number(s.dpi) || 1200));
  if (bmp.width < alvo) {
    const fator = alvo / bmp.width;
    const maior = document.createElement("canvas");
    maior.width = alvo;
    maior.height = Math.round(bmp.height * fator);
    const mg = maior.getContext("2d")!;
    mg.imageSmoothingEnabled = true;
    mg.imageSmoothingQuality = "high";
    mg.drawImage(bmp, 0, 0, maior.width, maior.height);
    if ("close" in bmp) bmp.close();
    bmp = maior;
  }

  const W = bmp.width;
  const H = bmp.height;
  const ppmm = W / CARD_W;
  const b = Math.round(s.bleed * ppmm);
  const raio = Math.round(3.4 * ppmm);
  const origem = document.createElement("canvas");
  origem.width = W;
  origem.height = H;
  const og = origem.getContext("2d", { willReadFrequently: true })!;
  og.drawImage(bmp, 0, 0);

  // Cor média da borda de cima, para preencher os cantos e a sangria.
  const y = Math.max(2, Math.round(ppmm * 0.8));
  const sx = Math.round(W * 0.3);
  const sw = Math.round(W * 0.4);
  const d = og.getImageData(sx, y, sw, 2).data;
  let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 200) {
      R += d[i];
      G += d[i + 1];
      B += d[i + 2];
      n++;
    }
  }
  const fundo = n ? `rgb(${(R / n) | 0},${(G / n) | 0},${(B / n) | 0})` : "#111";

  const c = document.createElement("canvas");
  c.width = W + 2 * b;
  c.height = H + 2 * b;
  const g = c.getContext("2d")!;
  g.fillStyle = fundo;
  g.fillRect(0, 0, c.width, c.height);
  if (b > 0) {
    // Estica a borda da carta para dentro da sangria (bom para cartas sem moldura).
    g.drawImage(origem, raio, 2, W - 2 * raio, 1, b + raio, 0, W - 2 * raio, b + 2);
    g.drawImage(origem, raio, H - 3, W - 2 * raio, 1, b + raio, b + H - 2, W - 2 * raio, b + 2);
    g.drawImage(origem, 2, raio, 1, H - 2 * raio, 0, b + raio, b + 2, H - 2 * raio);
    g.drawImage(origem, W - 3, raio, 1, H - 2 * raio, b + W - 2, b + raio, b + 2, H - 2 * raio);
  }
  g.drawImage(bmp, b, b);

  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", Number(s.qual) || 0.92));
  if (!blob) throw new Error("O navegador não conseguiu preparar a imagem de uma carta.");
  const dados = new Uint8Array(await blob.arrayBuffer());
  // Libera a memória das telas grandes.
  c.width = c.height = 0;
  origem.width = origem.height = 0;
  if ("close" in bmp) bmp.close();
  else bmp.width = bmp.height = 0;
  cacheJpeg.set(chave, dados);
  return dados;
}

type Doc = import("jspdf").jsPDF;

function marcasDeRegistro(doc: Doc, L: Layout) {
  doc.setFillColor(0, 0, 0);
  for (const m of L.marks) doc.rect(m.x, m.y, m.w, m.h, "F");
}

function marcasDeCorte(doc: Doc, L: Layout, bleed: number) {
  doc.setDrawColor(120);
  doc.setLineWidth(0.15);
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const sl of L.slots) {
    xs.add(sl.x);
    xs.add(+(sl.x + CARD_W).toFixed(2));
    ys.add(sl.y);
    ys.add(+(sl.y + CARD_H).toFixed(2));
  }
  const topo = L.y0 - bleed - 1;
  const base = L.y0 + L.gh + bleed + 1;
  const esq = L.x0 - bleed - 1;
  const dir = L.x0 + L.gw + bleed + 1;
  xs.forEach((x) => {
    if (topo - 4 > 0) doc.line(x, topo - 4, x, topo);
    if (base + 4 < L.H) doc.line(x, base, x, base + 4);
  });
  ys.forEach((y) => {
    if (esq - 4 > 0) doc.line(esq - 4, y, esq, y);
    if (dir + 4 < L.W) doc.line(dir, y, dir + 4, y);
  });
}

/** Monta o PDF do lote: uma página A4 em paisagem para cada 8 cartas. */
export async function gerarPdf(slots: Slot[], s: Ajustes, progresso?: Progresso): Promise<Blob> {
  if (slots.length === 0) throw new Error("O lote está vazio.");
  const { jsPDF } = await import("jspdf");
  const L = computeLayout(s);
  const doc = new jsPDF({ unit: "mm", format: [L.W, L.H], orientation: "landscape", compress: true });
  const folhas = Math.ceil(slots.length / POR_FOLHA);
  const origens = [...new Set(slots.map((sl) => sl.origem).filter((o) => o !== "avulsa"))].join(", ");

  for (let p = 0; p < folhas; p++) {
    if (p) doc.addPage([L.W, L.H], "landscape");
    const pagina = slots.slice(p * POR_FOLHA, (p + 1) * POR_FOLHA);
    for (let k = 0; k < pagina.length; k++) {
      const pos = L.slots[k];
      const sl = pagina[k];
      progresso?.(p * POR_FOLHA + k, slots.length, sl.nome);
      const dados = await cartaEmJpeg(sl.png, s);
      doc.addImage(
        dados,
        "JPEG",
        pos.x - s.bleed,
        pos.y - s.bleed,
        CARD_W + 2 * s.bleed,
        CARD_H + 2 * s.bleed,
        `${sl.printId}_${sl.face}_${s.bleed}_${s.qual}_${s.dpi}`,
        "NONE",
      );
    }
    if (s.marks) marcasDeRegistro(doc, L);
    if (s.crop) marcasDeCorte(doc, L, s.bleed);
    doc.setFontSize(6);
    doc.setTextColor(140);
    const rodape = `${loja.nome} · folha ${p + 1}/${folhas} · A4 paisagem · imprimir em tamanho real (100%)${origens ? " · " + origens : ""}`;
    doc.text(rodape.slice(0, 140), L.W / 2, L.H - 2, { align: "center" });
  }
  progresso?.(slots.length, slots.length, "");
  return doc.output("blob");
}

export function baixarArquivo(blob: Blob, nome: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
