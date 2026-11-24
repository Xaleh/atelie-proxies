import { afterEach, describe, expect, it, vi } from "vitest";
import { juntarFichas, slotsDoDetalhe, type DetalheDeImpressao } from "@/lib/print/lote";
import { fichasDasCartas } from "@/lib/scryfall";
import { basicoComMoldura, basicoDeArteInteira, type MetaDeImpressao } from "@/lib/traducao/tipos";

const ficha = (id: string, oracleId: string, faces = 1): DetalheDeImpressao => ({
  id,
  oracleId,
  nome: `Ficha ${id}`,
  lang: "en",
  set: "tfdn",
  collectorNumber: "1",
  faces: Array.from({ length: faces }, (_, i) => ({ nome: `Ficha ${id} ${i}`, normal: `https://x/normal/${id}-${i}.jpg`, png: `https://x/png/${id}-${i}.png` })),
});

describe("fichas no lote", () => {
  it("põe no fim só as fichas que ainda não estão no lote, uma de cada", () => {
    const lote = slotsDoDetalhe(ficha("a", "o-a"), 1, "PDR-1");
    const r = juntarFichas(lote, [ficha("a2", "o-a"), ficha("b", "o-b"), ficha("b2", "o-b"), ficha("c", "o-c", 2)]);
    expect(r.novas).toBe(2);
    expect(r.slots.map((s) => [s.printId, s.grupo, s.face, s.origem])).toEqual([
      ["a", 1, 0, "PDR-1"],
      ["b", 2, 0, "ficha"],
      ["c", 3, 0, "ficha"],
      ["c", 3, 1, "ficha"],
    ]);
  });

  it("sem ficha nova, devolve o mesmo lote", () => {
    const lote = slotsDoDetalhe(ficha("a", "o-a"), 1, "avulsa");
    const r = juntarFichas(lote, [ficha("a", "o-a")]);
    expect(r.novas).toBe(0);
    expect(r.slots).toBe(lote);
  });
});

describe("busca das fichas no Scryfall", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("usa a lista de fichas da versão em inglês quando a impressão em português não tem", async () => {
    const carta = (o: object) => ({ set: "x", set_name: "X", collector_number: "1", image_uris: { normal: "https://x/normal/a.jpg", png: "https://x/png/a.png" }, ...o });
    const chamadas: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const corpo = init?.body ? JSON.parse(String(init.body)) : null;
        chamadas.push(corpo ?? url);
        const ids = (corpo?.identifiers ?? []) as Array<Record<string, string>>;
        let data: object[] = [];
        if (String(url).includes("/cards/search")) data = [];
        else if (ids[0]?.id === "pt-1")
          data = [carta({ id: "pt-1", oracle_id: "o-1", name: "Raise the Alarm", lang: "pt", printed_text: "Crie duas fichas de criatura 1/1." })];
        else if (ids[0]?.oracle_id === "o-1")
          data = [carta({ id: "en-1", oracle_id: "o-1", name: "Raise the Alarm", lang: "en", all_parts: [{ id: "tok-1", component: "token" }] })];
        else if (ids[0]?.id === "tok-1") data = [carta({ id: "tok-1", oracle_id: "o-tok", name: "Soldier", lang: "en", type_line: "Token Creature — Soldier" })];
        return new Response(JSON.stringify({ data }), { status: String(url).includes("/cards/search") ? 404 : 200 });
      }),
    );
    const r = await fichasDasCartas(["pt-1"], { "pt-1": "pt" });
    expect(r.map((f) => [f.id, f.oracleId, f.lang])).toEqual([["tok-1", "o-tok", "en"]]);
    expect(chamadas.length).toBe(4); // carta, versão em inglês, ficha, ficha em português (não achou)
  });
});

describe("terreno básico", () => {
  const meta = (fullArt: boolean): MetaDeImpressao => ({ frame: "2015", layout: "normal", borda: "black", fullArt, tipo: "Basic Land — Forest", efeitos: [], faces: [] });
  it("com moldura comum só troca nome e tipo; de arte inteira tem molde próprio", () => {
    expect(basicoComMoldura(meta(false))).toBe(true);
    expect(basicoDeArteInteira(meta(false))).toBe(false);
    expect(basicoComMoldura(meta(true))).toBe(false);
    expect(basicoDeArteInteira(meta(true))).toBe(true);
  });
});
