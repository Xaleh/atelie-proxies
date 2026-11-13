import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { COMBOS_PADRAO, acessoriosParaSalvarSchema, combosSchema, type Combos, type Produto, type ProdutoParaSalvar } from "./acessorios";
import type { Tabela } from "./pricing";
import { VALORES_PADRAO } from "./valores";
import { valoresDaLoja } from "./valores-servidor";

const { products, settings } = schema;
const CHAVE_DOS_COMBOS = "combos";

/** O catálogo inteiro, na ordem do painel. A loja usa só os disponíveis. */
export async function listarProdutos(): Promise<Produto[]> {
  const linhas = await db().select().from(products).orderBy(asc(products.position), asc(products.id));
  return linhas.map((p) => ({
    id: p.id,
    tipo: p.kind,
    nome: p.name,
    descricao: p.description,
    centavos: p.priceCents,
    disponivel: p.available,
  }));
}

export async function combosDaLoja(): Promise<Combos> {
  const [linha] = await db().select().from(settings).where(eq(settings.key, CHAVE_DOS_COMBOS)).limit(1);
  if (!linha) return COMBOS_PADRAO;
  try {
    const lido = combosSchema.safeParse(JSON.parse(linha.value));
    if (lido.success) return lido.data;
  } catch {
    // cai no padrão abaixo
  }
  console.error("[acessorios] os combos salvos no banco não são válidos; seguindo sem desconto");
  return COMBOS_PADRAO;
}

/**
 * Grava o catálogo como veio do painel: atualiza os que têm id, cria os
 * novos e apaga os que saíram da lista. Pedidos antigos não mudam, porque
 * guardam nome e preço do acessório na hora da compra.
 */
export async function salvarAcessorios(dados: { produtos: ProdutoParaSalvar[]; combos: Combos }): Promise<void> {
  const { produtos, combos } = acessoriosParaSalvarSchema.parse(dados);
  const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
  const valorDosCombos = JSON.stringify(combos);
  await db().transaction(async (tx) => {
    const existentes = new Set((await tx.select({ id: products.id }).from(products)).map((p) => p.id));
    const mantidos = new Set(produtos.map((p) => p.id).filter((id): id is number => id != null && existentes.has(id)));
    const apagar = [...existentes].filter((id) => !mantidos.has(id));
    if (apagar.length) await tx.delete(products).where(inArray(products.id, apagar));
    for (const [position, p] of produtos.entries()) {
      const campos = { kind: p.tipo, name: p.nome, description: p.descricao, priceCents: p.centavos, available: p.disponivel, position, updatedAt: agora };
      if (p.id != null && existentes.has(p.id)) await tx.update(products).set(campos).where(eq(products.id, p.id));
      else await tx.insert(products).values(campos);
    }
    await tx
      .insert(settings)
      .values({ key: CHAVE_DOS_COMBOS, value: valorDosCombos, updatedAt: agora })
      .onConflictDoUpdate({ target: settings.key, set: { value: valorDosCombos, updatedAt: agora } });
  });
}

/**
 * Tudo o que define o preço de um pedido, como está em vigor. Erro de banco
 * sobe para quem chamou: um pedido nunca é fechado com preço "de reserva".
 */
export async function tabelaDaLoja(): Promise<Tabela> {
  const [{ valores }, produtos, combos] = await Promise.all([valoresDaLoja(), listarProdutos(), combosDaLoja()]);
  return { valores, produtos: produtos.filter((p) => p.disponivel), combos };
}

/**
 * Para as páginas da loja: se o banco não responder, mostra os valores do
 * arquivo e nenhum acessório, em vez de derrubar a página. O total é
 * conferido de novo ao fechar.
 */
export async function tabelaParaMostrar(): Promise<Tabela> {
  try {
    return await tabelaDaLoja();
  } catch (err) {
    console.error("[tabela]", err);
    return { valores: VALORES_PADRAO, produtos: [], combos: COMBOS_PADRAO };
  }
}
