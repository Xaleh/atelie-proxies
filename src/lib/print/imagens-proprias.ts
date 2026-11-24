/**
 * Imagens próprias na produção: o ateliê envia a arte pronta de uma carta
 * (JPG, PNG ou WEBP) e ela entra no lote como qualquer outra carta.
 *
 * Tudo acontece no navegador: a imagem é preparada num canvas (sangria,
 * formato de carta, tamanho máximo) e guardada no IndexedDB, para o lote
 * reabrir com ela. Nada vai para o servidor.
 */

import type { Slot } from "./lote";

/** Medidas da carta e da carta com a sangria de 3 mm que a MPC usa (69,85 × 95,25 mm). */
const CARTA = { w: 63, h: 88 };
const MPC = { w: 69.85, h: 95.25 };
const SANGRIA_MPC = 3.175;
/** 63 mm a 1200 dpi: mais que isso não melhora a impressão. */
const LARGURA_MAXIMA = 2976;
/** Abaixo disso a carta sai borrada; o ideal é a partir de 300 dpi. */
export const DPI_MINIMO = 280;

export type Sangria = "auto" | "sem" | "mpc";
export type Encaixe = "cortar" | "encaixar";

export type ImagemPreparada = {
  id: string;
  nome: string;
  blob: Blob;
  /** Resolução da carta na impressão (pixels por polegada na largura de 63 mm). */
  dpi: number;
};

export const PREFIXO = "up:";
export const ORIGEM_IMAGEM = "Imagem própria";
export const ehImagemPropria = (sl: Pick<Slot, "printId">) => sl.printId.startsWith(PREFIXO);

async function sha1(blob: Blob): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Deixa a imagem no formato da carta (63 × 88):
 * - sangria automática: proporção perto da MPC (69,85 × 95,25) → corta 3,175 mm de cada lado;
 * - depois corta as sobras pelo centro ou encaixa a imagem inteira sobre fundo preto;
 * - limita a 2976 px de largura e salva em JPEG.
 */
export async function prepararImagem(arquivo: File, sangria: Sangria, encaixe: Encaixe): Promise<ImagemPreparada> {
  const bmp = await createImageBitmap(arquivo);
  try {
    let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
    const proporcao = sw / sh;
    const pertoDaMpc = Math.abs(proporcao - MPC.w / MPC.h) < Math.abs(proporcao - CARTA.w / CARTA.h) && Math.abs(proporcao - MPC.w / MPC.h) < 0.012;
    if (sangria === "mpc" || (sangria === "auto" && pertoDaMpc)) {
      const cx = (sw * SANGRIA_MPC) / MPC.w, cy = (sh * SANGRIA_MPC) / MPC.h;
      sx += cx;
      sy += cy;
      sw -= 2 * cx;
      sh -= 2 * cy;
    }
    // largura e altura finais, em pixels da imagem original
    const alvo = CARTA.w / CARTA.h;
    let W: number, H: number;
    if (encaixe === "cortar") {
      if (sw / sh > alvo) {
        const nw = sh * alvo;
        sx += (sw - nw) / 2;
        sw = nw;
      } else {
        const nh = sw / alvo;
        sy += (sh - nh) / 2;
        sh = nh;
      }
      W = sw;
      H = sh;
    } else {
      // encaixar: a carta cresce até caber a imagem inteira; o resto fica preto
      W = Math.max(sw, sh * alvo);
      H = W / alvo;
    }
    const dpi = Math.round(W / (CARTA.w / 25.4));
    const escala = Math.min(1, LARGURA_MAXIMA / W);
    const cw = Math.round(W * escala), ch = Math.round(H * escala);
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    const g = c.getContext("2d")!;
    g.fillStyle = "#000";
    g.fillRect(0, 0, cw, ch);
    g.imageSmoothingQuality = "high";
    const dw = sw * escala, dh = sh * escala;
    g.drawImage(bmp, sx, sy, sw, sh, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    const blob = await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error("canvas"))), "image/jpeg", 0.95));
    const nome = arquivo.name.replace(/\.(jpe?g|png|webp)$/i, "") || "Imagem";
    return { id: PREFIXO + (await sha1(blob)), nome, blob, dpi };
  } finally {
    bmp.close();
  }
}

/** Carta do lote feita de uma imagem própria (frente só, sem tradução nem troca de arte). */
export function slotDaImagem(img: { id: string; nome: string }, url: string, grupo: number): Slot {
  return {
    uid: `${grupo}-0`,
    grupo,
    printId: img.id,
    oracleId: "",
    face: 0,
    nomeEn: img.nome,
    set: "",
    num: "",
    traduzida: false,
    nome: img.nome,
    lang: "img",
    thumb: url,
    png: url,
    origem: ORIGEM_IMAGEM,
  };
}

// ---------- IndexedDB: "proxy-do-reis" / "imagens" ----------

const BANCO = "proxy-do-reis";
const LOJA = "imagens";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(LOJA)) req.result.createObjectStore(LOJA);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}

async function comLoja<T>(modo: IDBTransactionMode, fn: (loja: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await abrir();
  try {
    return await new Promise<T | undefined>((ok, falha) => {
      const tx = db.transaction(LOJA, modo);
      const req = fn(tx.objectStore(LOJA));
      tx.oncomplete = () => ok(req ? req.result : undefined);
      tx.onerror = () => falha(tx.error);
      tx.onabort = () => falha(tx.error);
    });
  } finally {
    db.close();
  }
}

type Guardada = { nome: string; blob: Blob };

export function guardarImagem(img: ImagemPreparada): Promise<unknown> {
  return comLoja("readwrite", (loja) => loja.put({ nome: img.nome, blob: img.blob } satisfies Guardada, img.id));
}

/** As imagens guardadas destes ids; as que não estão no navegador ficam de fora. */
export async function lerImagens(ids: string[]): Promise<Map<string, Guardada>> {
  const out = new Map<string, Guardada>();
  for (const id of new Set(ids)) {
    const g = (await comLoja<Guardada>("readonly", (loja) => loja.get(id)).catch(() => undefined)) as Guardada | undefined;
    if (g?.blob) out.set(id, g);
  }
  return out;
}

/** Apaga as imagens que não estão em nenhum dos ids informados. */
export async function apagarImagensFora(manter: Set<string>): Promise<void> {
  const chaves = ((await comLoja<IDBValidKey[]>("readonly", (loja) => loja.getAllKeys()).catch(() => [])) ?? []) as IDBValidKey[];
  const sobras = chaves.filter((k) => typeof k === "string" && !manter.has(k));
  if (sobras.length) await comLoja("readwrite", (loja) => void sobras.forEach((k) => loja.delete(k))).catch(() => undefined);
}
