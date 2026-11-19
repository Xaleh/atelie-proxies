import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { ENCAIXES, TAMANHO_MAXIMO, ehEncaixe, enderecoDaLetra, formatoDaLetra, tamanhoLegivel, type Encaixe, type LetraEnviada } from "./tipografia";

const { cardFonts } = schema;

const FORMATO_DO_MIME: Record<string, LetraEnviada["formato"]> = {
  "font/ttf": "truetype",
  "font/otf": "opentype",
  "font/woff": "woff",
  "font/woff2": "woff2",
};

/** As letras enviadas, na ordem dos encaixes, sem os bytes. Encaixe sem arquivo não aparece. */
export async function letrasEnviadas(): Promise<LetraEnviada[]> {
  const linhas = await db()
    .select({
      slot: cardFonts.slot,
      fileName: cardFonts.fileName,
      mime: cardFonts.mime,
      hash: cardFonts.hash,
      updatedAt: cardFonts.updatedAt,
      // só o tamanho: a lista não carrega os arquivos
      bytes: sql<number>`length(${cardFonts.data})`,
    })
    .from(cardFonts);
  return ENCAIXES.flatMap((encaixe) => {
    const l = linhas.find((o) => o.slot === encaixe);
    const formato = l && FORMATO_DO_MIME[l.mime];
    if (!l || !formato) return [];
    return [{ encaixe, arquivo: l.fileName, bytes: Number(l.bytes), formato, hash: l.hash, enviadaEm: l.updatedAt, url: enderecoDaLetra(encaixe, l.hash) }];
  });
}

/** O arquivo de um encaixe, para a rota pública que o entrega. */
export async function arquivoDaLetra(encaixe: Encaixe): Promise<{ mime: string; data: Buffer; hash: string } | null> {
  const [linha] = await db().select().from(cardFonts).where(eq(cardFonts.slot, encaixe)).limit(1);
  return linha ? { mime: linha.mime, data: Buffer.from(linha.data), hash: linha.hash } : null;
}

/** Arquivo que não pode ser gravado (não é uma fonte ou passou do tamanho). */
export class LetraRecusada extends Error {}

/** Só o nome, sem pasta, sem caracteres de controle e com tamanho razoável. */
function nomeLimpo(nome: string): string {
  const so = nome.split(/[\\/]/).pop() ?? "";
  return so.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 120) || "fonte";
}

/** Grava (ou troca) a letra de um encaixe, depois de conferir que o arquivo é mesmo uma fonte. */
export async function salvarLetra(encaixe: string, nome: string, bytes: Uint8Array): Promise<void> {
  if (!ehEncaixe(encaixe)) throw new LetraRecusada("Encaixe desconhecido.");
  if (bytes.length > TAMANHO_MAXIMO) throw new LetraRecusada(`O arquivo passa de ${tamanhoLegivel(TAMANHO_MAXIMO)}.`);
  const formato = formatoDaLetra(bytes);
  if (!formato) throw new LetraRecusada("O arquivo não é uma fonte. Envie um .ttf, .otf, .woff ou .woff2.");
  const data = Buffer.from(bytes);
  const linha = {
    fileName: nomeLimpo(nome),
    mime: formato.mime,
    data,
    hash: createHash("sha256").update(data).digest("hex").slice(0, 16),
    updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
  };
  await db()
    .insert(cardFonts)
    .values({ slot: encaixe, ...linha })
    .onConflictDoUpdate({ target: cardFonts.slot, set: linha });
}

/** Tira a letra de um encaixe; as cartas voltam a usar a fonte livre. */
export async function removerLetra(encaixe: string): Promise<void> {
  if (!ehEncaixe(encaixe)) throw new LetraRecusada("Encaixe desconhecido.");
  await db().delete(cardFonts).where(eq(cardFonts.slot, encaixe));
}
