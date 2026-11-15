/**
 * Filtro por coleção da janela de artes. Vale no navegador, sobre as artes já
 * carregadas da carta: só aparecem as coleções em que a carta existe.
 */

export type Colecao = {
  /** Sigla da coleção no Scryfall, em minúsculas (ex.: "dom"). */
  codigo: string;
  nome: string;
  /** Quantas artes da carta existem nela. */
  artes: number;
};

type ComColecao = { set: string; setName: string };

/** Sem acento e em minúsculas, para comparar o que foi digitado. */
function simples(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Coleções das artes, na ordem em que aparecem (a lista vem da mais nova para a mais antiga). */
export function colecoesDasArtes(prints: ComColecao[]): Colecao[] {
  const porCodigo = new Map<string, Colecao>();
  for (const p of prints) {
    const codigo = p.set.toLowerCase();
    const c = porCodigo.get(codigo);
    if (c) c.artes++;
    else porCodigo.set(codigo, { codigo, nome: p.setName, artes: 1 });
  }
  return [...porCodigo.values()];
}

/** Como a coleção aparece nas sugestões do campo: "Dominaria (DOM)". */
export function rotuloDaColecao(c: Pick<Colecao, "codigo" | "nome">): string {
  return `${c.nome} (${c.codigo.toUpperCase()})`;
}

/**
 * Artes das coleções que batem com o que foi digitado. Uma sugestão escolhida
 * ("Dominaria (DOM)") ou a sigla exata ("dom") valem só para aquela coleção;
 * qualquer outro texto procura no nome e na sigla ("domin" acha Dominaria,
 * Dominaria United e Dominaria Remastered).
 */
export function filtrarPorColecao<T extends ComColecao>(prints: T[], termo: string): T[] {
  const t = simples(termo);
  if (!t) return prints;
  const siglaNoFim = t.match(/\(([a-z0-9]{2,8})\)$/)?.[1];
  for (const sigla of [siglaNoFim, t]) {
    if (!sigla) continue;
    const exatas = prints.filter((p) => p.set.toLowerCase() === sigla);
    if (exatas.length) return exatas;
  }
  return prints.filter((p) => simples(p.setName).includes(t) || p.set.toLowerCase().includes(t));
}
