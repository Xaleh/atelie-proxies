import { createHash } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { COMBOS_PADRAO, FOTO, acessoriosParaSalvarSchema, combosSchema, enderecoDaFoto, type Combos, type Produto, type ProdutoParaSalvar } from "./acessorios";
import type { Tabela } from "./pricing";
import { VALORES_PADRAO } from "./valores";
import { valoresDaLoja } from "./valores-servidor";

const { products, productImages, settings } = schema;
const CHAVE_DOS_COMBOS = "combos";

/** O catálogo inteiro, na ordem do painel. A loja usa só os disponíveis. */
export async function listarProdutos(): Promise<Produto[]> {
  const linhas = await db()
    .select({ p: products, hash: productImages.hash })
    .from(products)
    .leftJoin(productImages, eq(productImages.productId, products.id))
    .orderBy(asc(products.position), asc(products.id));
  return linhas.map(({ p, hash }) => ({
    id: p.id,
    tipo: p.kind,
    nome: p.name,
    descricao: p.description,
    centavos: p.priceCents,
    disponivel: p.available,
    imagem: hash ? enderecoDaFoto(p.id, hash) : null,
  }));
}

/** A foto de um acessório, para a rota pública que a entrega. */
export async function fotoDoProduto(id: number): Promise<{ mime: string; data: Buffer; hash: string } | null> {
  const [linha] = await db().select().from(productImages).where(eq(productImages.productId, id)).limit(1);
  return linha ? { mime: linha.mime, data: Buffer.from(linha.data), hash: linha.hash } : null;
}

/** Foto que não pode ser gravada (não é JPEG ou passou do tamanho). */
export class FotoRecusada extends Error {}

/** Confere a foto que o painel mandou: só JPEG, do tamanho que o painel gera. */
function lerFoto(base64: string, nome: string): { data: Buffer; hash: string } {
  const data = Buffer.from(base64, "base64");
  const jpeg = data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (!jpeg) throw new FotoRecusada(`A foto de "${nome}" não é uma imagem que o site aceita. Envie de novo pelo painel.`);
  if (data.length > FOTO.bytes) throw new FotoRecusada(`A foto de "${nome}" ficou grande demais. Envie uma imagem menor.`);
  return { data, hash: createHash("sha256").update(data).digest("hex").slice(0, 16) };
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
 * novos e apaga os que saíram da lista, com as fotos junto. Pedidos antigos não mudam, porque
 * guardam nome e preço do acessório na hora da compra.
 */
export async function salvarAcessorios(dados: { produtos: ProdutoParaSalvar[]; combos: Combos }): Promise<void> {
  const { produtos, combos } = acessoriosParaSalvarSchema.parse(dados);
  const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
  const valorDosCombos = JSON.stringify(combos);
  // confere todas as fotos antes de mexer no banco
  const fotos = produtos.map((p) => (p.imagem.acao === "nova" ? lerFoto(p.imagem.dados, p.nome) : null));
  await db().transaction(async (tx) => {
    const existentes = new Set((await tx.select({ id: products.id }).from(products)).map((p) => p.id));
    const mantidos = new Set(produtos.map((p) => p.id).filter((id): id is number => id != null && existentes.has(id)));
    const apagar = [...existentes].filter((id) => !mantidos.has(id));
    if (apagar.length) {
      await tx.delete(productImages).where(inArray(productImages.productId, apagar));
      await tx.delete(products).where(inArray(products.id, apagar));
    }
    for (const [position, p] of produtos.entries()) {
      const campos = { kind: p.tipo, name: p.nome, description: p.descricao, priceCents: p.centavos, available: p.disponivel, position, updatedAt: agora };
      let id = p.id != null && existentes.has(p.id) ? p.id : null;
      if (id != null) await tx.update(products).set(campos).where(eq(products.id, id));
      else id = (await tx.insert(products).values(campos).returning({ id: products.id }))[0].id;
      const foto = fotos[position];
      if (p.imagem.acao === "remover") await tx.delete(productImages).where(eq(productImages.productId, id));
      else if (foto) {
        const linha = { mime: "image/jpeg", data: foto.data, hash: foto.hash, updatedAt: agora };
        await tx
          .insert(productImages)
          .values({ productId: id, ...linha })
          .onConflictDoUpdate({ target: productImages.productId, set: linha });
      }
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
