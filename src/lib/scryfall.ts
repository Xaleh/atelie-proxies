import type { DetalheDeImpressao, FaceDeImpressao } from "./print/lote";
import { chaveDoNome, type MetaDeImpressao, type Traducao } from "./traducao/tipos";
import type { CardPrint, CatalogEntry } from "./types";

/**
 * Acesso à API do Scryfall, sempre pelo servidor: assim o site manda o
 * User-Agent que o Scryfall pede, guarda as respostas em cache por 24 horas
 * (recomendação deles) e a busca não depende do navegador da cliente.
 *
 * Quando o catálogo local existir (fase da VPS), só este arquivo muda.
 */

const API = process.env.SCRYFALL_API_URL ?? "https://api.scryfall.com";
const UM_DIA = 60 * 60 * 24;

const HEADERS = {
  "User-Agent": "ProxyDoReis/0.1 (+https://github.com/Xaleh/atelie-proxies)",
  Accept: "application/json",
};

type ScryfallFace = {
  name?: string;
  oracle_id?: string;
  printed_name?: string;
  printed_type_line?: string;
  printed_text?: string;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  mana_cost?: string;
  power?: string;
  image_uris?: { normal?: string; png?: string };
};

type ScryfallCard = ScryfallFace & {
  id: string;
  name: string;
  lang: string;
  set: string;
  set_name: string;
  collector_number: string;
  frame?: string;
  layout?: string;
  border_color?: string;
  full_art?: boolean;
  card_faces?: ScryfallFace[];
};

type ScryfallList = { data?: ScryfallCard[]; not_found?: Array<{ name?: string }> };

/** As faces de uma carta: as de card_faces ou, sem elas, a própria carta. */
function facesDaCarta(card: ScryfallCard): ScryfallFace[] {
  return card.card_faces?.length ? card.card_faces : [card];
}

/** Dados da impressão em inglês que o renderizador da tradução usa. */
function metaDaImpressao(card: ScryfallCard): MetaDeImpressao {
  return {
    frame: card.frame ?? "",
    layout: card.layout ?? "",
    borda: card.border_color ?? "",
    fullArt: Boolean(card.full_art),
    tipo: card.type_line ?? "",
    faces: facesDaCarta(card).map((f) => ({
      nome: f.name ?? card.name,
      tipo: f.type_line ?? card.type_line ?? "",
      texto: f.oracle_text ?? "",
      sabor: Boolean(f.flavor_text),
      mana: f.mana_cost ?? "",
      temPT: f.power != null,
    })),
  };
}

function toPrint(card: ScryfallCard): CardPrint | null {
  const face = card.card_faces?.[0];
  const oracleId = card.oracle_id ?? face?.oracle_id;
  const image = card.image_uris?.normal ?? face?.image_uris?.normal;
  if (!oracleId || !image) return null;
  return {
    id: card.id,
    oracleId,
    name: card.name,
    printedName: card.lang === "en" ? null : (card.printed_name ?? face?.printed_name ?? null),
    lang: card.lang,
    set: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number,
    image,
    meta: metaDaImpressao(card),
  };
}

function pausa(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type OpcoesDeBusca = { unique?: "cards" | "prints"; order?: string; dir?: "asc" | "desc" };

/** Busca na sintaxe do Scryfall. "Nenhum resultado" (404) vira lista vazia. */
async function search(q: string, opts: OpcoesDeBusca = {}): Promise<CardPrint[]> {
  return (await searchBruta(q, opts)).map(toPrint).filter((p): p is CardPrint => p !== null);
}

async function searchBruta(q: string, opts: OpcoesDeBusca = {}): Promise<ScryfallCard[]> {
  const params = new URLSearchParams({ q, unique: opts.unique ?? "cards", order: opts.order ?? "name" });
  if (opts.dir) params.set("dir", opts.dir);
  const res = await fetch(`${API}/cards/search?${params}`, {
    headers: HEADERS,
    next: { revalidate: UM_DIA },
  });
  // 404 = nenhuma carta; 400 = o Scryfall não entendeu o texto digitado.
  if (res.status === 404 || res.status === 400) return [];
  if (!res.ok) throw new Error(`Scryfall respondeu ${res.status}`);
  const json = (await res.json()) as ScryfallList;
  return json.data ?? [];
}

type Identificador = { name: string } | { oracle_id: string } | { id: string };

/** Até 75 cartas por chamada do Scryfall; devolve os objetos como vieram. */
async function collectionBruta(
  identifiers: Identificador[],
): Promise<{ cards: ScryfallCard[]; notFound: string[] }> {
  const cards: ScryfallCard[] = [];
  const notFound: string[] = [];
  for (let i = 0; i < identifiers.length; i += 75) {
    if (i > 0) await pausa(100);
    const res = await fetch(`${API}/cards/collection`, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: identifiers.slice(i, i + 75) }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Scryfall respondeu ${res.status}`);
    const json = (await res.json()) as ScryfallList;
    cards.push(...(json.data ?? []));
    for (const nf of json.not_found ?? []) if (nf.name) notFound.push(nf.name);
  }
  return { cards, notFound };
}

/** Por nome ou por oracle_id, já reduzido ao que a loja usa. */
async function collection(
  identifiers: Identificador[],
): Promise<{ found: CardPrint[]; notFound: string[] }> {
  const { cards, notFound } = await collectionBruta(identifiers);
  return { found: cards.map(toPrint).filter((p): p is CardPrint => p !== null), notFound };
}

/**
 * Detalhes de impressões pelo id, para a produção: todas as faces, com a
 * imagem de tela e o PNG de impressão de cada uma.
 */
export async function detalhesDasImpressoes(ids: string[]): Promise<DetalheDeImpressao[]> {
  const unicos = [...new Set(ids)];
  const { cards } = await collectionBruta(unicos.map((id) => ({ id })));
  return cards.map((c) => {
    const faces: FaceDeImpressao[] = [];
    if (c.image_uris?.normal && c.image_uris.png) {
      faces.push({ nome: c.printed_name ?? c.name, normal: c.image_uris.normal, png: c.image_uris.png });
    } else {
      for (const f of c.card_faces ?? []) {
        if (f.image_uris?.normal && f.image_uris.png) {
          faces.push({ nome: f.printed_name ?? f.name ?? c.name, normal: f.image_uris.normal, png: f.image_uris.png });
        }
      }
    }
    return {
      id: c.id,
      oracleId: c.oracle_id ?? c.card_faces?.[0]?.oracle_id,
      nome: c.name,
      lang: c.lang,
      set: c.set,
      collectorNumber: c.collector_number,
      faces,
      meta: metaDaImpressao(c),
    };
  });
}

/**
 * Textos das impressões oficiais em português, por face, chaveados pelo nome
 * da face em inglês. Usa a impressão em português mais recente de cada carta.
 */
export async function textosOficiaisEmPortugues(oracleIds: string[]): Promise<Map<string, Omit<Traducao, "fonte">>> {
  const textos = new Map<string, Omit<Traducao, "fonte">>();
  const vistos = new Set<string>();
  const unicos = [...new Set(oracleIds)];
  for (let i = 0; i < unicos.length; i += 20) {
    if (i > 0) await pausa(100);
    const grupo = unicos.slice(i, i + 20).map((id) => `oracleid:${id}`).join(" or ");
    const cartas = await searchBruta(`lang:pt (${grupo})`, { unique: "cards", order: "released", dir: "desc" });
    for (const c of cartas) {
      const oracle = c.oracle_id ?? c.card_faces?.[0]?.oracle_id;
      if (!oracle || vistos.has(oracle)) continue;
      vistos.add(oracle);
      for (const f of facesDaCarta(c)) {
        const nomeEn = f.name ?? c.name;
        if (!f.printed_name || !nomeEn) continue;
        textos.set(chaveDoNome(nomeEn), {
          nome: f.printed_name,
          tipo: f.printed_type_line ?? "",
          texto: f.printed_text ?? "",
          sabor: "",
        });
      }
    }
  }
  return textos;
}

/** Para cada carta, a impressão em português mais recente, se existir. */
async function impressoesEmPortugues(oracleIds: string[]): Promise<Map<string, CardPrint>> {
  const porOracle = new Map<string, CardPrint>();
  const unicos = [...new Set(oracleIds)];
  for (let i = 0; i < unicos.length; i += 20) {
    if (i > 0) await pausa(100);
    const grupo = unicos.slice(i, i + 20).map((id) => `oracleid:${id}`).join(" or ");
    const prints = await search(`lang:pt (${grupo})`, { unique: "cards", order: "released", dir: "desc" });
    for (const p of prints) if (!porOracle.has(p.oracleId)) porOracle.set(p.oracleId, p);
  }
  return porOracle;
}

function aspas(texto: string): string {
  return `"${texto.replace(/["\\]/g, " ").trim()}"`;
}

function comPortugues(ens: CardPrint[], pts: Map<string, CardPrint>): CatalogEntry[] {
  return ens.map((en) => ({ oracleId: en.oracleId, name: en.name, en, pt: pts.get(en.oracleId) ?? null }));
}

/** Busca por nome em inglês ou em português. Devolve até `limite` cartas. */
export async function buscarCartas(termo: string, limite = 12): Promise<CatalogEntry[]> {
  const nome = aspas(termo);
  // A busca pelo nome em português é um extra: se ela falhar, a busca em
  // inglês continua valendo.
  const [emIngles, emPortugues] = await Promise.all([
    search(`name:${nome}`),
    search(`lang:pt name:${nome}`).catch((err) => {
      console.error("[scryfall] busca em português falhou:", err);
      return [] as CardPrint[];
    }),
  ]);

  const ens = new Map<string, CardPrint>();
  for (const p of emIngles) if (p.lang === "en" && !ens.has(p.oracleId)) ens.set(p.oracleId, p);

  // Cartas achadas só pelo nome em português ainda precisam da impressão em inglês.
  const soEmPt = [...new Set(emPortugues.map((p) => p.oracleId))].filter((id) => !ens.has(id));
  if (soEmPt.length) {
    const { found } = await collection(soEmPt.slice(0, limite).map((oracle_id) => ({ oracle_id })));
    for (const p of found) if (!ens.has(p.oracleId)) ens.set(p.oracleId, p);
  }

  // Quem bateu pelo nome em português aparece primeiro.
  const ordemPt = new Set(emPortugues.map((p) => p.oracleId));
  const lista = [...ens.values()]
    .sort((a, b) => Number(ordemPt.has(b.oracleId)) - Number(ordemPt.has(a.oracleId)))
    .slice(0, limite);

  const pts = new Map<string, CardPrint>();
  for (const p of emPortugues) if (!pts.has(p.oracleId)) pts.set(p.oracleId, p);
  const semPt = lista.filter((p) => !pts.has(p.oracleId)).map((p) => p.oracleId);
  if (semPt.length) for (const [id, p] of await impressoesEmPortugues(semPt)) pts.set(id, p);

  return comPortugues(lista, pts);
}

/** Resolve os nomes de uma lista de deck. */
export async function buscarPorNomes(
  nomes: string[],
): Promise<{ entries: CatalogEntry[]; notFound: string[] }> {
  const { found, notFound } = await collection(nomes.map((name) => ({ name })));
  const pts = await impressoesEmPortugues(found.map((p) => p.oracleId));
  return { entries: comPortugues(found, pts), notFound };
}

/** Todas as artes de uma carta, em inglês e em português, da mais nova para a mais antiga. */
export async function buscarImpressoes(oracleId: string): Promise<CardPrint[]> {
  return search(`oracleid:${oracleId} (lang:en or lang:pt)`, {
    unique: "prints",
    order: "released",
    dir: "desc",
  });
}

export const HOSTS_DE_IMAGEM = ["cards.scryfall.io"];
