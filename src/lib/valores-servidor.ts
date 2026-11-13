import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { VALORES_PADRAO, valoresSchema, type Valores } from "./valores";

const { settings } = schema;
const CHAVE = "valores";

export type ValoresSalvos = { valores: Valores; salvoEm: string | null };

/**
 * Valores em vigor, lidos do banco. Sem nada salvo (ou com algo ilegível),
 * valem os do arquivo de configuração. Erro de banco sobe para quem chamou:
 * um pedido nunca é fechado com preço "de reserva".
 */
export async function valoresDaLoja(): Promise<ValoresSalvos> {
  const [linha] = await db().select().from(settings).where(eq(settings.key, CHAVE)).limit(1);
  if (!linha) return { valores: VALORES_PADRAO, salvoEm: null };
  try {
    const lido = valoresSchema.safeParse(JSON.parse(linha.value));
    if (lido.success) return { valores: lido.data, salvoEm: linha.updatedAt };
  } catch {
    // cai no padrão abaixo
  }
  console.error("[valores] o que está salvo no banco não é válido; usando os valores do arquivo de configuração");
  return { valores: VALORES_PADRAO, salvoEm: null };
}

/**
 * Para as páginas da loja: se o banco não responder, mostra os valores do
 * arquivo em vez de derrubar a página. O total é conferido de novo ao fechar.
 */
export async function valoresParaMostrar(): Promise<Valores> {
  try {
    return (await valoresDaLoja()).valores;
  } catch (err) {
    console.error("[valores]", err);
    return VALORES_PADRAO;
  }
}

export async function salvarValores(valores: Valores): Promise<void> {
  const value = JSON.stringify(valoresSchema.parse(valores));
  const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
  await db()
    .insert(settings)
    .values({ key: CHAVE, value, updatedAt: agora })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: agora } });
}
