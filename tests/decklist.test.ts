import { describe, expect, it } from "vitest";
import { parseDecklist } from "@/lib/decklist";

describe("parseDecklist", () => {
  it("lê quantidade e nome nos formatos comuns", () => {
    expect(parseDecklist("1 Sol Ring\n4x Lightning Bolt\nLlanowar Elves\n  2   Swords to Plowshares  ")).toEqual([
      { qty: 1, name: "Sol Ring" },
      { qty: 4, name: "Lightning Bolt" },
      { qty: 1, name: "Llanowar Elves" },
      { qty: 2, name: "Swords to Plowshares" },
    ]);
  });

  it("ignora seções, comentários e anotações de coleção", () => {
    const texto = "Deck\n4 Lightning Bolt (M10) 146\n// comentário\n\nSideboard\nSB: 2 Counterspell [MH2]\n1 Sol Ring (C21) 263 *F*";
    expect(parseDecklist(texto)).toEqual([
      { qty: 4, name: "Lightning Bolt" },
      { qty: 2, name: "Counterspell" },
      { qty: 1, name: "Sol Ring" },
    ]);
  });

  it("soma linhas repetidas e mantém vírgulas e apóstrofos do nome", () => {
    expect(parseDecklist("2 Urza's Saga\n1 urza's saga\n1 Jace, the Mind Sculptor")).toEqual([
      { qty: 3, name: "Urza's Saga" },
      { qty: 1, name: "Jace, the Mind Sculptor" },
    ]);
  });
});
