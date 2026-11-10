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

type ScryfallCard = {
  id: string;
  oracle_id?: string;
  name: string;
  printed_name?: string;
  lang: string;
  set: string;
  set_name: string;
  collector_number: string;
  image_uris?: { normal?: string };
  card_faces?: Array<{
    oracle_id?: string;
    printed_name?: string;
    image_uris?: { normal?: string };
  }>;
};

type ScryfallList = { data?: ScryfallCard[]; not_found?: Array<{ name?: string }> };

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
  };
}

function pausa(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Busca na sintaxe do Scryfall. "Nenhum resultado" (404) vira lista vazia. */
async function search(
  q: string,
  opts: { unique?: "cards" | "prints"; order?: string; dir?: "asc" | "desc" } = {},
): Promise<CardPrint[]> {
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
  return (json.data ?? []).map(toPrint).filter((p): p is CardPrint => p !== null);
}

/** Até 75 cartas por chamada, por nome ou por oracle_id. */
async function collection(
  identifiers: Array<{ name: string } | { oracle_id: string }>,
): Promise<{ found: CardPrint[]; notFound: string[] }> {
  const found: CardPrint[] = [];
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
    for (const c of json.data ?? []) {
      const p = toPrint(c);
      if (p) found.push(p);
    }
    for (const nf of json.not_found ?? []) if (nf.name) notFound.push(nf.name);
  }
  return { found, notFound };
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
