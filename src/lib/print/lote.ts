import type { MetaDeImpressao } from "../traducao/tipos";
import type { CardPrint } from "../types";

/**
 * O lote de produção: a lista de cartas na ordem em que vão para as folhas.
 * Cada posição é um "slot". Uma carta de duas faces ocupa dois slots do mesmo
 * grupo (frente e verso), que é sempre impresso e movido junto.
 */

export type FaceDeImpressao = { nome: string; normal: string; png: string };

/** O que a produção precisa saber de uma impressão do Scryfall. */
export type DetalheDeImpressao = {
  id: string;
  oracleId?: string;
  nome: string;
  lang: string;
  set: string;
  collectorNumber: string;
  faces: FaceDeImpressao[];
  /** Dados para escrever a tradução sobre a arte. */
  meta?: MetaDeImpressao;
};

export type ItemDoPedido = {
  printId: string;
  oracleId: string;
  nome: string;
  nomeImpresso: string | null;
  lang: "en" | "pt";
  /** Imagem de tamanho normal gravada no pedido. */
  image: string;
  quantidade: number;
  /** Texto em português escrito sobre a arte em inglês. */
  traduzida: boolean;
};

export type PedidoDoLote = { code: string; itens: ItemDoPedido[] };

export type Slot = {
  /** Identificador estável da posição, para a tela. */
  uid: string;
  /** Frente e verso da mesma cópia compartilham o grupo. */
  grupo: number;
  printId: string;
  oracleId: string;
  face: number;
  /** Nome da face em inglês, chave da tradução. */
  nomeEn: string;
  set: string;
  num: string;
  /** Recebe o texto em português sobre a arte em inglês. */
  traduzida: boolean;
  nome: string;
  lang: string;
  /** Imagem pequena para a tela. */
  thumb: string;
  /** Imagem de impressão (PNG do Scryfall, cerca de 300 dpi). */
  png: string;
  /** Código do pedido de origem, ou "avulsa". */
  origem: string;
};

/** Do endereço da imagem normal do Scryfall para o PNG de impressão. */
export function pngDaImagemNormal(url: string): string {
  return url.replace("/normal/", "/png/").replace(/\.jpg(\?.*)?$/, ".png$1");
}

function facesDe(item: ItemDoPedido, detalhe: DetalheDeImpressao | undefined): FaceDeImpressao[] {
  if (detalhe && detalhe.faces.length) return detalhe.faces;
  // Sem os detalhes do Scryfall ainda dá para imprimir a frente gravada no pedido.
  return [{ nome: item.nomeImpresso ?? item.nome, normal: item.image, png: pngDaImagemNormal(item.image) }];
}

export function montarSlots(pedidos: PedidoDoLote[], detalhes: Map<string, DetalheDeImpressao>): Slot[] {
  const slots: Slot[] = [];
  let grupo = 1;
  for (const pedido of pedidos) {
    for (const item of pedido.itens) {
      const detalhe = detalhes.get(item.printId);
      const faces = facesDe(item, detalhe);
      for (let copia = 0; copia < item.quantidade; copia++) {
        const g = grupo++;
        faces.forEach((f, face) => {
          slots.push({
            uid: `${g}-${face}`,
            grupo: g,
            printId: item.printId,
            oracleId: item.oracleId,
            face,
            nomeEn: detalhe?.meta?.faces[face]?.nome ?? item.nome.split(" // ")[face] ?? item.nome,
            set: detalhe?.set ?? "",
            num: detalhe?.collectorNumber ?? "",
            traduzida: item.traduzida,
            nome: face === 0 ? (item.nomeImpresso ?? f.nome) : f.nome,
            lang: item.lang,
            thumb: f.normal,
            png: f.png,
            origem: pedido.code,
          });
        });
      }
    }
  }
  return slots;
}

/**
 * Garante o verso logo depois de cada frente de carta de duas faces. Serve
 * para lotes guardados antes de o verso ser obrigatório e para cartas avulsas.
 */
export function completarVersos(slots: Slot[], detalhes: Map<string, DetalheDeImpressao>): Slot[] {
  const comVerso = new Set(slots.filter((sl) => sl.face > 0).map((sl) => sl.grupo));
  const out: Slot[] = [];
  for (const sl of slots) {
    out.push(sl);
    const detalhe = detalhes.get(sl.printId);
    const faces = detalhe?.faces ?? [];
    if (sl.face !== 0 || faces.length < 2 || comVerso.has(sl.grupo)) continue;
    for (let face = 1; face < faces.length; face++) {
      const f = faces[face];
      out.push({
        ...sl,
        uid: `${sl.grupo}-${face}`,
        face,
        nomeEn: detalhe?.meta?.faces[face]?.nome ?? f.nome,
        nome: f.nome,
        thumb: f.normal,
        png: f.png,
      });
    }
  }
  return out.length === slots.length ? slots : out;
}

/**
 * Uma impressão vinda da busca de artes, no formato da produção. A busca só
 * traz a frente: para carta de duas faces, os detalhes vêm do Scryfall.
 */
export function detalheDaFrente(print: CardPrint): DetalheDeImpressao {
  return {
    id: print.id,
    oracleId: print.oracleId,
    nome: print.name,
    lang: print.lang,
    set: print.set,
    collectorNumber: print.collectorNumber,
    faces: [{ nome: print.printedName ?? print.name, normal: print.image, png: pngDaImagemNormal(print.image) }],
    meta: print.meta,
  };
}

/** Cópias da mesma carta no lote, seja qual for a arte de cada uma. */
function mesmaCarta(a: Slot, b: Slot): boolean {
  return a.oracleId && b.oracleId ? a.oracleId === b.oracleId : a.printId === b.printId;
}

/** Quantas cópias da carta da posição `i` estão no lote. */
export function copiasDaCarta(slots: Slot[], i: number): number {
  const alvo = slots[i];
  return alvo ? new Set(slots.filter((sl) => mesmaCarta(sl, alvo)).map((sl) => sl.grupo)).size : 0;
}

/**
 * Troca a arte da carta da posição `i`, frente e verso, sem tirá-la do lugar.
 * Com `todas`, troca em todas as cópias da mesma carta.
 *
 * O idioma pedido continua valendo: carta em português numa arte em inglês
 * recebe o texto traduzido por cima; arte em português já sai em português.
 */
export function trocarArte(slots: Slot[], i: number, nova: DetalheDeImpressao, todas = false): Slot[] {
  const alvo = slots[i];
  if (!alvo || nova.faces.length === 0) return slots;
  const grupos = new Set(todas ? slots.filter((sl) => mesmaCarta(sl, alvo)).map((sl) => sl.grupo) : [alvo.grupo]);
  const artePt = nova.lang === "pt";
  const out: Slot[] = [];
  for (const sl of slots) {
    if (!grupos.has(sl.grupo)) {
      out.push(sl);
      continue;
    }
    // as faces da arte nova entram no lugar da frente; o verso antigo sai
    if (sl.face !== 0) continue;
    const emPt = sl.lang === "pt" || sl.traduzida;
    nova.faces.forEach((f, face) => {
      out.push({
        ...sl,
        uid: `${sl.grupo}-${face}`,
        printId: nova.id,
        oracleId: sl.oracleId || nova.oracleId || "",
        face,
        nomeEn: nova.meta?.faces[face]?.nome ?? nova.nome.split(" // ")[face] ?? nova.nome,
        set: nova.set,
        num: nova.collectorNumber,
        traduzida: emPt && !artePt,
        nome: f.nome,
        lang: emPt || artePt ? "pt" : "en",
        thumb: f.normal,
        png: f.png,
      });
    });
  }
  return out;
}

/** Primeira e última posição do grupo (frente e verso da mesma cópia), que ficam sempre lado a lado. */
export function grupoDe(slots: Slot[], i: number): [number, number] {
  const g = slots[i].grupo;
  let a = i, b = i;
  while (a > 0 && slots[a - 1].grupo === g) a--;
  while (b < slots.length - 1 && slots[b + 1].grupo === g) b++;
  return [a, b];
}

/**
 * Leva a carta da posição `de` (com o verso junto) para o lugar da carta em
 * `para`: antes dela quando vai para trás, depois dela quando vai para frente.
 * Nunca cai no meio da frente e do verso de outra carta.
 */
export function moverSlot(slots: Slot[], de: number, para: number): Slot[] {
  if (de === para || de < 0 || de >= slots.length || slots.length === 0) return slots;
  para = Math.max(0, Math.min(para, slots.length - 1));
  const [a, b] = grupoDe(slots, de);
  if (para >= a && para <= b) return slots;
  const [pa, pb] = grupoDe(slots, para);
  const copia = [...slots];
  const bloco = copia.splice(a, b - a + 1);
  copia.splice(para < a ? pa : pb + 1 - bloco.length, 0, ...bloco);
  return copia;
}

/** Uma posição para trás (-1) ou para frente (+1), pulando o par inteiro da carta vizinha. */
export function moverUmaPosicao(slots: Slot[], i: number, sentido: -1 | 1): Slot[] {
  const [a, b] = grupoDe(slots, i);
  if (sentido < 0) return a > 0 ? moverSlot(slots, i, a - 1) : slots;
  return b < slots.length - 1 ? moverSlot(slots, i, b + 1) : slots;
}

/** Mais uma cópia da carta, com o verso, logo depois dela. */
export function duplicarGrupo(slots: Slot[], i: number): Slot[] {
  const [a, b] = grupoDe(slots, i);
  const grupo = proximoGrupo(slots);
  const copia = [...slots];
  copia.splice(b + 1, 0, ...slots.slice(a, b + 1).map((sl) => ({ ...sl, grupo, uid: `${grupo}-${sl.face}` })));
  return copia;
}

/** Tira a carta do lote, frente e verso. */
export function tirarGrupo(slots: Slot[], i: number): Slot[] {
  const [a, b] = grupoDe(slots, i);
  return slots.filter((_, k) => k < a || k > b);
}

export function proximoGrupo(slots: Slot[]): number {
  return slots.reduce((m, sl) => Math.max(m, sl.grupo), 0) + 1;
}
