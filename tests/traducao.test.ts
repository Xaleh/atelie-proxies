import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { aceitaMoldeAutomatico, chaveDoSabor, facesFisicas, moldeParaUsar, moldeSchema, type MetaDeImpressao } from "@/lib/traducao/tipos";
import { impressaoEscolhida, modoDoTexto, type CardPrint } from "@/lib/types";

const dir = mkdtempSync(join(tmpdir(), "pdr-tr-"));
process.env.TURSO_DATABASE_URL = `file:${join(dir, "teste.db")}`;
const srv = await import("@/lib/traducao/servidor");

const meta = (o: Partial<MetaDeImpressao> = {}): MetaDeImpressao => ({
  frame: "2015",
  layout: "normal",
  borda: "black",
  fullArt: false,
  tipo: "Creature — Elf Druid",
  faces: [{ nome: "Llanowar Elves", tipo: "Creature — Elf Druid", texto: "{T}: Add {G}.", sabor: true, mana: "{G}", temPT: true }],
  ...o,
});

const print = (lang: string): CardPrint => ({
  id: lang,
  oracleId: "o",
  name: "Llanowar Elves",
  printedName: null,
  lang,
  set: "dom",
  setName: "Dominaria",
  collectorNumber: "168",
  image: "https://cards.scryfall.io/x.jpg",
});

beforeAll(async () => {
  const client = createClient({ url: process.env.TURSO_DATABASE_URL! });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  client.close();
});

afterEach(() => vi.unstubAllGlobals());

describe("molde", () => {
  it("só aceita o automático na moldura 2015 comum", () => {
    expect(aceitaMoldeAutomatico(meta())).toBe(true);
    expect(aceitaMoldeAutomatico(meta({ frame: "1997" }))).toBe(false);
    // moldura antiga (Alpha a Mirage, 30th Edition): só no layout comum
    expect(aceitaMoldeAutomatico(meta({ frame: "1993" }))).toBe(true);
    expect(aceitaMoldeAutomatico(meta({ frame: "1993", layout: "transform" }))).toBe(false);
    expect(aceitaMoldeAutomatico(meta({ frame: "1993", tipo: "Enchantment — Saga" }))).toBe(false);
    expect(aceitaMoldeAutomatico(meta({ layout: "split" }))).toBe(false);
    expect(aceitaMoldeAutomatico(meta({ tipo: "Legendary Planeswalker — Jace" }))).toBe(false);
    expect(aceitaMoldeAutomatico(meta({ tipo: "Enchantment — Saga" }))).toBe(false);
    expect(aceitaMoldeAutomatico(undefined)).toBe(false);
  });

  it("molde manual vence, bloqueio desliga, e sem nada vale o automático", () => {
    const manual = moldeSchema.parse({
      modo: "manual",
      nome: null,
      tipo: { x: 0.1, y: 0.5, w: 0.8, h: 0.05 },
      texto: { x: 0.1, y: 0.6, w: 0.8, h: 0.3 },
      fundo: "desfoque",
      corTexto: "claro",
    });
    expect(moldeParaUsar(meta({ frame: "1997" }), manual)).toEqual(manual);
    expect(moldeParaUsar(meta(), { modo: "bloqueado" })).toBeNull();
    expect(moldeParaUsar(meta(), null)).toBe("auto");
    expect(moldeParaUsar(meta({ frame: "1997" }), null)).toBeNull();
  });

  it("conta o verso das cartas de duas faces como carta física", () => {
    const duas = [meta().faces[0], meta().faces[0]];
    expect(facesFisicas(meta())).toBe(1);
    expect(facesFisicas(meta({ layout: "transform", faces: duas }))).toBe(2);
    expect(facesFisicas(meta({ layout: "modal_dfc", faces: duas }))).toBe(2);
    // split e aventura têm duas "faces" de texto numa carta só
    expect(facesFisicas(meta({ layout: "split", faces: duas }))).toBe(1);
    expect(facesFisicas(meta({ layout: "adventure", faces: duas }))).toBe(1);
    expect(facesFisicas(undefined)).toBe(1);
  });

  it("recusa retângulo fora da carta", () => {
    expect(
      moldeSchema.safeParse({ modo: "manual", nome: { x: 0.5, y: 0, w: 0.8, h: 0.1 }, tipo: null, texto: null, fundo: "cor", corTexto: "auto" }).success,
    ).toBe(false);
  });
});

describe("modo do texto no carrinho", () => {
  const en = print("en"), pt = print("pt");
  it("escolhe a arte e diz como o texto sai", () => {
    expect(modoDoTexto({ en, pt, lang: "en", arte: "padrao" }, true)).toBe("en");
    expect(modoDoTexto({ en, pt, lang: "pt", arte: "padrao" }, true)).toBe("oficial");
    expect(modoDoTexto({ en, pt, lang: "pt", arte: "en" }, true)).toBe("traduzida");
    expect(modoDoTexto({ en, pt: null, lang: "pt", arte: "padrao" }, false)).toBe("indisponivel");
    expect(impressaoEscolhida({ en, pt, lang: "en", arte: "pt" }).lang).toBe("pt");
  });
});

describe("traduções no banco", () => {
  const pedido = { oracleId: "o", nome: "Llanowar Elves", set: "DOM", num: "168", printId: "p1", face: 0 };

  it("revisão do ateliê vence o Arena, e o sabor vem por impressão", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
    await srv.importarArena({
      limpar: true,
      cartas: [["Llanowar Elves", "Elfos de Llanowar", "Criatura — Elfo Druida", "{T}: Adicione {G}."]],
      sabores: [[chaveDoSabor("Llanowar Elves", "dom", "168"), "Um sussurro na mata."]],
    });
    let r = await srv.buscarTraducoes([pedido]);
    expect(r.traducoes["llanowar elves"]).toMatchObject({ nome: "Elfos de Llanowar", fonte: "arena" });
    expect(r.sabores[chaveDoSabor("Llanowar Elves", "dom", "168")]).toBe("Um sussurro na mata.");

    await srv.salvarRevisao("Llanowar Elves", { nome: "Elfos de Llanowar (rev)", tipo: "Criatura — Elfo", texto: "x", sabor: "" });
    r = await srv.buscarTraducoes([pedido]);
    expect(r.traducoes["llanowar elves"]).toMatchObject({ nome: "Elfos de Llanowar (rev)", fonte: "manual" });

    await srv.removerRevisao("Llanowar Elves");
    r = await srv.buscarTraducoes([pedido]);
    expect(r.traducoes["llanowar elves"].fonte).toBe("arena");

    const resumo = await srv.resumoDasTraducoes();
    expect(resumo).toMatchObject({ arena: 1 });
  });

  it("guarda e remove o molde da impressão", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
    await srv.salvarMolde("p1", 0, { modo: "bloqueado" });
    expect(await srv.moldeDe("p1", 0)).toEqual({ modo: "bloqueado" });
    const r = await srv.buscarTraducoes([pedido]);
    expect(r.moldes["p1#0"]).toEqual({ modo: "bloqueado" });
    await srv.removerMolde("p1", 0);
    expect(await srv.moldeDe("p1", 0)).toBeNull();
  });
});
