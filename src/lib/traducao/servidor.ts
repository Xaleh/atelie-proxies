import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { textosOficiaisEmPortugues } from "../scryfall";
import {
  chaveDoMolde,
  chaveDoNome,
  chaveDoSabor,
  moldeSchema,
  type Molde,
  type Traducao,
} from "./tipos";

const { translations, arenaFlavors, printTemplates } = schema;

export type PedidoDeTraducao = {
  oracleId: string;
  /** Nome da face em inglês. */
  nome: string;
  set: string;
  num: string;
  printId: string;
  face: number;
};

export type RespostaDeTraducao = {
  /** Por nome da face em inglês, em minúsculas. */
  traducoes: Record<string, Traducao>;
  /** Ambientação do Arena, por "nome|set|número". */
  sabores: Record<string, string>;
  /** Moldes manuais, por "printId#face". */
  moldes: Record<string, Molde>;
};

function partes<T>(lista: T[], tamanho: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) out.push(lista.slice(i, i + tamanho));
  return out;
}

const AGORA = sql`(CURRENT_TIMESTAMP)`;

/**
 * A melhor tradução de cada face: revisão do ateliê, depois Arena, depois o
 * texto da carta impressa em português (Scryfall). Sem banco configurado, só
 * o texto impresso.
 */
export async function buscarTraducoes(pedidos: PedidoDeTraducao[]): Promise<RespostaDeTraducao> {
  const resposta: RespostaDeTraducao = { traducoes: {}, sabores: {}, moldes: {} };
  const nomes = [...new Set(pedidos.map((p) => chaveDoNome(p.nome)))];
  const chavesSabor = [...new Set(pedidos.map((p) => chaveDoSabor(p.nome, p.set, p.num)))];
  const printIds = [...new Set(pedidos.map((p) => p.printId))];

  try {
    for (const grupo of partes(nomes, 400)) {
      const linhas = await db().select().from(translations).where(inArray(translations.nameEn, grupo));
      for (const l of linhas) {
        const atual = resposta.traducoes[l.nameEn];
        if (atual && atual.fonte === "manual") continue;
        resposta.traducoes[l.nameEn] = { nome: l.nome, tipo: l.tipo, texto: l.texto, sabor: l.sabor, fonte: l.source };
      }
    }
    for (const grupo of partes(chavesSabor, 400)) {
      const linhas = await db().select().from(arenaFlavors).where(inArray(arenaFlavors.key, grupo));
      for (const l of linhas) resposta.sabores[l.key] = l.sabor;
    }
    for (const grupo of partes(printIds, 400)) {
      const linhas = await db().select().from(printTemplates).where(inArray(printTemplates.printId, grupo));
      for (const l of linhas) {
        const molde = moldeSchema.safeParse(JSON.parse(l.data));
        if (molde.success) resposta.moldes[chaveDoMolde(l.printId, l.face)] = molde.data;
      }
    }
  } catch (err) {
    // Sem banco, ainda dá para usar o texto das cartas impressas em português.
    console.error("[traducoes] banco indisponível:", err);
  }

  const faltando = pedidos.filter((p) => !resposta.traducoes[chaveDoNome(p.nome)]);
  if (faltando.length) {
    const oficiais = await textosOficiaisEmPortugues(faltando.map((p) => p.oracleId));
    for (const p of faltando) {
      const t = oficiais.get(chaveDoNome(p.nome));
      if (t) resposta.traducoes[chaveDoNome(p.nome)] = { ...t, fonte: "oficial" };
    }
  }
  return resposta;
}

export async function revisaoDe(nomeEn: string) {
  const [l] = await db()
    .select()
    .from(translations)
    .where(and(eq(translations.nameEn, chaveDoNome(nomeEn)), eq(translations.source, "manual")))
    .limit(1);
  return l ?? null;
}

export async function salvarRevisao(nomeEn: string, t: { nome: string; tipo: string; texto: string; sabor: string }) {
  await db()
    .insert(translations)
    .values({ nameEn: chaveDoNome(nomeEn), source: "manual", ...t })
    .onConflictDoUpdate({
      target: [translations.nameEn, translations.source],
      set: { nome: t.nome, tipo: t.tipo, texto: t.texto, sabor: t.sabor, updatedAt: AGORA },
    });
}

export async function removerRevisao(nomeEn: string) {
  await db()
    .delete(translations)
    .where(and(eq(translations.nameEn, chaveDoNome(nomeEn)), eq(translations.source, "manual")));
}

/** Uma parte do arquivo do Arena. A primeira parte apaga a importação anterior. */
export async function importarArena(lote: {
  limpar: boolean;
  cartas: Array<[string, string, string, string]>;
  sabores: Array<[string, string]>;
}) {
  if (lote.limpar) {
    await db().delete(translations).where(eq(translations.source, "arena"));
    await db().delete(arenaFlavors);
  }
  for (const grupo of partes(lote.cartas, 100)) {
    await db()
      .insert(translations)
      .values(grupo.map(([nameEn, nome, tipo, texto]) => ({ nameEn: chaveDoNome(nameEn), source: "arena" as const, nome, tipo, texto })))
      .onConflictDoUpdate({
        target: [translations.nameEn, translations.source],
        set: { nome: sql`excluded.nome`, tipo: sql`excluded.tipo`, texto: sql`excluded.texto`, updatedAt: AGORA },
      });
  }
  for (const grupo of partes(lote.sabores, 200)) {
    await db()
      .insert(arenaFlavors)
      .values(grupo.map(([key, sabor]) => ({ key: key.toLowerCase(), sabor })))
      .onConflictDoUpdate({ target: arenaFlavors.key, set: { sabor: sql`excluded.sabor` } });
  }
}

export async function resumoDasTraducoes() {
  const [r] = await db()
    .select({
      arena: sql<number>`sum(case when ${translations.source} = 'arena' then 1 else 0 end)`,
      manual: sql<number>`sum(case when ${translations.source} = 'manual' then 1 else 0 end)`,
      arenaEm: sql<string | null>`max(case when ${translations.source} = 'arena' then ${translations.updatedAt} end)`,
    })
    .from(translations);
  const [s] = await db().select({ n: sql<number>`count(*)` }).from(arenaFlavors);
  const [m] = await db().select({ n: sql<number>`count(*)` }).from(printTemplates);
  return {
    arena: Number(r?.arena ?? 0),
    manual: Number(r?.manual ?? 0),
    arenaEm: r?.arenaEm ?? null,
    sabores: Number(s?.n ?? 0),
    moldes: Number(m?.n ?? 0),
  };
}

export async function revisoesRecentes(limite = 30) {
  return db()
    .select()
    .from(translations)
    .where(eq(translations.source, "manual"))
    .orderBy(desc(translations.updatedAt))
    .limit(limite);
}

export async function moldeDe(printId: string, face: number): Promise<Molde | null> {
  const [l] = await db()
    .select()
    .from(printTemplates)
    .where(and(eq(printTemplates.printId, printId), eq(printTemplates.face, face)))
    .limit(1);
  if (!l) return null;
  const molde = moldeSchema.safeParse(JSON.parse(l.data));
  return molde.success ? molde.data : null;
}

export async function salvarMolde(printId: string, face: number, molde: Molde) {
  const data = JSON.stringify(molde);
  await db()
    .insert(printTemplates)
    .values({ printId, face, data })
    .onConflictDoUpdate({ target: [printTemplates.printId, printTemplates.face], set: { data, updatedAt: AGORA } });
}

export async function removerMolde(printId: string, face: number) {
  await db()
    .delete(printTemplates)
    .where(and(eq(printTemplates.printId, printId), eq(printTemplates.face, face)));
}
