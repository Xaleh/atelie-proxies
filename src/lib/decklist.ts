export type LinhaDeLista = { qty: number; name: string };

/**
 * Interpreta uma lista de deck colada pela cliente.
 * Aceita "4 Lightning Bolt", "4x Lightning Bolt" e linhas sem número (1 cópia).
 * Ignora títulos de seção ("Sideboard", "Deck"), comentários e a anotação de
 * coleção que alguns sites exportam ("(M10) 146", "[M10]", "*F*").
 */
export function parseDecklist(texto: string): LinhaDeLista[] {
  const linhas: LinhaDeLista[] = [];
  const porNome = new Map<string, LinhaDeLista>();

  for (const bruta of texto.split(/\r?\n/)) {
    let linha = bruta.trim();
    if (!linha || linha.startsWith("//") || linha.startsWith("#")) continue;
    if (/^(deck|sideboard|commander|companion|maybeboard|mainboard|main)\s*:?\s*(\(\d+\))?$/i.test(linha)) continue;
    linha = linha.replace(/^SB:\s*/i, "");

    let qty = 1;
    const m = linha.match(/^(\d{1,3})\s*x?\s+(.+)$/i);
    if (m) {
      qty = Number(m[1]);
      linha = m[2];
    }
    const name = linha
      .replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+[\w★-]+)?.*$/, "") // (SET) 123
      .replace(/\s+\[[A-Za-z0-9]{2,6}\].*$/, "") // [SET]
      .replace(/\s+\*[A-Z]+\*\s*$/, "") // *F*
      .trim();
    if (!name || qty < 1) continue;

    const chave = name.toLowerCase();
    const existente = porNome.get(chave);
    if (existente) existente.qty += qty;
    else {
      const nova = { qty, name };
      porNome.set(chave, nova);
      linhas.push(nova);
    }
  }
  return linhas;
}
