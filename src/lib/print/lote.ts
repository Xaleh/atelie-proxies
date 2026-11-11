/**
 * O lote de produção: a lista de cartas na ordem em que vão para as folhas.
 * Cada posição é um "slot". Uma carta de duas faces ocupa dois slots do mesmo
 * grupo (frente e verso) quando a opção de imprimir versos está ligada.
 */

export type FaceDeImpressao = { nome: string; normal: string; png: string };

/** O que a produção precisa saber de uma impressão do Scryfall. */
export type DetalheDeImpressao = {
  id: string;
  nome: string;
  lang: string;
  set: string;
  collectorNumber: string;
  faces: FaceDeImpressao[];
};

export type ItemDoPedido = {
  printId: string;
  nome: string;
  nomeImpresso: string | null;
  lang: "en" | "pt";
  /** Imagem de tamanho normal gravada no pedido. */
  image: string;
  quantidade: number;
};

export type PedidoDoLote = { code: string; itens: ItemDoPedido[] };

export type Slot = {
  /** Identificador estável da posição, para a tela. */
  uid: string;
  /** Frente e verso da mesma cópia compartilham o grupo. */
  grupo: number;
  printId: string;
  face: number;
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

export function montarSlots(
  pedidos: PedidoDoLote[],
  detalhes: Map<string, DetalheDeImpressao>,
  versos: boolean,
): Slot[] {
  const slots: Slot[] = [];
  let grupo = 1;
  for (const pedido of pedidos) {
    for (const item of pedido.itens) {
      const faces = facesDe(item, detalhes.get(item.printId));
      const usadas = versos ? faces : faces.slice(0, 1);
      for (let copia = 0; copia < item.quantidade; copia++) {
        const g = grupo++;
        usadas.forEach((f, face) => {
          slots.push({
            uid: `${g}-${face}`,
            grupo: g,
            printId: item.printId,
            face,
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

/** Liga ou desliga os versos num lote que já foi reordenado, sem perder a ordem. */
export function ajustarVersos(slots: Slot[], detalhes: Map<string, DetalheDeImpressao>, versos: boolean): Slot[] {
  if (!versos) return slots.filter((sl) => sl.face === 0);
  const out: Slot[] = [];
  for (const sl of slots) {
    out.push(sl);
    const faces = detalhes.get(sl.printId)?.faces ?? [];
    const jaTemVerso = slots.some((o) => o.grupo === sl.grupo && o.face > 0);
    if (sl.face === 0 && faces.length > 1 && !jaTemVerso) {
      for (let face = 1; face < faces.length; face++) {
        const f = faces[face];
        out.push({ ...sl, uid: `${sl.grupo}-${face}`, face, nome: f.nome, thumb: f.normal, png: f.png });
      }
    }
  }
  return out;
}

export function moverSlot(slots: Slot[], de: number, para: number): Slot[] {
  if (de === para || de < 0 || de >= slots.length) return slots;
  const copia = [...slots];
  const [sl] = copia.splice(de, 1);
  copia.splice(Math.max(0, Math.min(para, copia.length)), 0, sl);
  return copia;
}

export function proximoGrupo(slots: Slot[]): number {
  return slots.reduce((m, sl) => Math.max(m, sl.grupo), 0) + 1;
}
