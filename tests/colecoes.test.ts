import { describe, expect, it } from "vitest";
import { colecoesDasArtes, filtrarPorColecao, rotuloDaColecao } from "@/lib/colecoes";

const arte = (set: string, setName: string, n = 1) => Array.from({ length: n }, (_, i) => ({ set, setName, id: `${set}-${i}` }));
const artes = [
  ...arte("dmr", "Dominaria Remastered"),
  ...arte("dmu", "Dominaria United", 2),
  ...arte("dom", "Dominaria", 3),
  ...arte("pdom", "Dominaria Promos"),
  ...arte("m10", "Magic 2010"),
  ...arte("ptk", "Portal Três Reinos"),
];

describe("filtro por coleção", () => {
  it("lista as coleções das artes, na ordem em que aparecem, com a contagem", () => {
    expect(colecoesDasArtes(artes)).toEqual([
      { codigo: "dmr", nome: "Dominaria Remastered", artes: 1 },
      { codigo: "dmu", nome: "Dominaria United", artes: 2 },
      { codigo: "dom", nome: "Dominaria", artes: 3 },
      { codigo: "pdom", nome: "Dominaria Promos", artes: 1 },
      { codigo: "m10", nome: "Magic 2010", artes: 1 },
      { codigo: "ptk", nome: "Portal Três Reinos", artes: 1 },
    ]);
    expect(rotuloDaColecao({ codigo: "dom", nome: "Dominaria" })).toBe("Dominaria (DOM)");
  });

  it("sem nada digitado, mostra tudo", () => {
    expect(filtrarPorColecao(artes, "")).toBe(artes);
    expect(filtrarPorColecao(artes, "   ")).toBe(artes);
  });

  it("a sugestão escolhida vale só para aquela coleção", () => {
    expect(filtrarPorColecao(artes, "Dominaria (DOM)").map((a) => a.set)).toEqual(["dom", "dom", "dom"]);
    expect(filtrarPorColecao(artes, "Dominaria United (DMU)").map((a) => a.set)).toEqual(["dmu", "dmu"]);
  });

  it("a sigla exata vale só para aquela coleção, em maiúsculas ou minúsculas", () => {
    expect(filtrarPorColecao(artes, "DOM").map((a) => a.set)).toEqual(["dom", "dom", "dom"]);
    expect(filtrarPorColecao(artes, " m10 ").map((a) => a.set)).toEqual(["m10"]);
  });

  it("outro texto procura no nome e na sigla", () => {
    expect(new Set(filtrarPorColecao(artes, "domin").map((a) => a.set))).toEqual(new Set(["dmr", "dmu", "dom", "pdom"]));
    expect(filtrarPorColecao(artes, "united").map((a) => a.set)).toEqual(["dmu", "dmu"]);
    expect(filtrarPorColecao(artes, "dm").map((a) => a.set)).toEqual(["dmr", "dmu", "dmu"]);
    expect(filtrarPorColecao(artes, "2010").map((a) => a.set)).toEqual(["m10"]);
  });

  it("ignora acento e maiúsculas", () => {
    expect(filtrarPorColecao(artes, "tres reinos").map((a) => a.set)).toEqual(["ptk"]);
    expect(filtrarPorColecao(artes, "TRÊS").map((a) => a.set)).toEqual(["ptk"]);
  });

  it("sem coleção que bata, não sobra arte", () => {
    expect(filtrarPorColecao(artes, "zendikar")).toEqual([]);
    // sigla entre parênteses que a carta não tem: cai na procura pelo texto
    expect(filtrarPorColecao(artes, "Zendikar (ZEN)")).toEqual([]);
  });
});
