import { CARD_H, CARD_W, computeLayout, type Ajustes } from "./layout";

/**
 * Gabarito de corte em DXF (R12) para o Silhouette Studio: a borda da folha na
 * camada FOLHA e um retângulo de 63 × 88 mm com cantos arredondados por carta
 * na camada CORTE. No DXF o eixo Y cresce para cima, por isso a inversão.
 */
export function gerarDxf(s: Pick<Ajustes, "bleed" | "offX" | "offY" | "marks" | "radius">): string {
  const L = computeLayout(s);
  const r = Math.max(0, Math.min(Number(s.radius) || 0, CARD_W / 2));
  const bulge = 0.41421356; // arco de 90°
  const f = (n: number) => n.toFixed(3);
  const out: string[] = [
    "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
  ];

  const poly = (camada: string, pontos: Array<[number, number, number?]>) => {
    out.push("0", "POLYLINE", "8", camada, "66", "1", "70", "1", "10", "0", "20", "0", "30", "0");
    for (const [x, y, bl] of pontos) {
      out.push("0", "VERTEX", "8", camada, "10", f(x), "20", f(y), "30", "0");
      if (bl) out.push("42", f(bl));
    }
    out.push("0", "SEQEND", "8", camada);
  };

  poly("FOLHA", [[0, 0], [L.W, 0], [L.W, L.H], [0, L.H]]);
  for (const sl of L.slots) {
    const esq = sl.x;
    const dir = sl.x + CARD_W;
    const topo = L.H - sl.y;
    const base = L.H - sl.y - CARD_H;
    poly(
      "CORTE",
      r > 0
        ? [
            [esq + r, base, 0], [dir - r, base, bulge], [dir, base + r, 0], [dir, topo - r, bulge],
            [dir - r, topo, 0], [esq + r, topo, bulge], [esq, topo - r, 0], [esq, base + r, bulge],
          ]
        : [[esq, base], [dir, base], [dir, topo], [esq, topo]],
    );
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\r\n");
}
