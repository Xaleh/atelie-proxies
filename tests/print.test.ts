import { describe, expect, it } from "vitest";
import { gerarDxf } from "@/lib/print/dxf";
import { AJUSTES_PADRAO, MARCA, avisosDoLayout, computeLayout, folhasPara } from "@/lib/print/layout";
import {
  ajustarVersos,
  montarSlots,
  moverSlot,
  pngDaImagemNormal,
  type DetalheDeImpressao,
  type PedidoDoLote,
} from "@/lib/print/lote";

describe("folha de impressão", () => {
  const L = computeLayout(AJUSTES_PADRAO);

  it("põe as 8 cartas nas posições do gabarito da Silhouette", () => {
    // Tabela do guia do ateliê: X 21 · 85 · 149 · 213, Y 16,5 · 105,5.
    expect(L.slots.map((s) => [s.x, s.y])).toEqual([
      [21, 16.5], [85, 16.5], [149, 16.5], [213, 16.5],
      [21, 105.5], [85, 105.5], [149, 105.5], [213, 105.5],
    ]);
    expect([L.W, L.H]).toEqual([297, 210]);
  });

  it("desenha as marcas de registro medidas no PDF do Proxxied", () => {
    expect(L.marks).toEqual([
      { x: 9.653, y: 210 - 9.371 - 5.99, w: 5.99, h: 5.99 },
      { x: 9.653, y: 9.66, w: 9.385, h: 0.99 },
      { x: 9.653, y: 9.66, w: 0.99, h: 9.385 },
      { x: 297 - 9.39 - 9.385, y: 210 - 9.371 - 0.99, w: 9.385, h: 0.99 },
      { x: 297 - 9.39 - 0.99, y: 210 - 9.371 - 9.385, w: 0.99, h: 9.385 },
    ]);
    expect(MARCA.thick).toBe(0.99);
    expect(computeLayout({ ...AJUSTES_PADRAO, marks: false }).marks).toEqual([]);
  });

  it("move só a impressão com o ajuste, sem mexer nas marcas", () => {
    const movido = computeLayout({ ...AJUSTES_PADRAO, offX: 1, offY: -0.5 });
    expect([movido.slots[0].x, movido.slots[0].y]).toEqual([22, 16]);
    expect(movido.marks).toEqual(L.marks);
  });

  it("avisa quando a carta encosta numa marca ou sai da folha", () => {
    expect(avisosDoLayout(AJUSTES_PADRAO)).toEqual([]);
    expect(avisosDoLayout({ ...AJUSTES_PADRAO, offX: -3 })).toEqual([]);
    expect(avisosDoLayout({ ...AJUSTES_PADRAO, offX: -10 })[0].tipo).toBe("aviso");
    expect(avisosDoLayout({ ...AJUSTES_PADRAO, offY: 20 })[0].tipo).toBe("erro");
  });

  it("conta as folhas", () => {
    expect(folhasPara(0)).toBe(1);
    expect(folhasPara(8)).toBe(1);
    expect(folhasPara(9)).toBe(2);
  });
});

describe("gabarito DXF", () => {
  const dxf = gerarDxf(AJUSTES_PADRAO).split("\r\n");
  const conta = (valor: string) => dxf.filter((l) => l === valor).length;

  it("tem a borda da folha e um corte por carta", () => {
    expect(conta("POLYLINE")).toBe(9);
    expect(conta("FOLHA")).toBe(1 + 4 + 1); // polyline, 4 vértices, seqend
    expect(conta("CORTE")).toBe(8 * (1 + 8 + 1));
    expect(dxf.at(-1)).toBe("EOF");
  });

  it("corta 63 × 88 mm com canto de 3,2 mm, com o Y para cima", () => {
    const i = dxf.indexOf("CORTE");
    const vertices: Array<[number, number]> = [];
    for (let k = i; k < dxf.length && vertices.length < 8; k++) {
      if (dxf[k] === "VERTEX") vertices.push([Number(dxf[k + 4]), Number(dxf[k + 6])]);
    }
    const xs = vertices.map((v) => v[0]);
    const ys = vertices.map((v) => v[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(63, 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(88, 3);
    expect(vertices[0]).toEqual([21 + 3.2, 210 - 16.5 - 88]);
    expect(conta("0.414")).toBe(8 * 4);
  });

  it("sem raio vira retângulo de quatro pontos", () => {
    const reto = gerarDxf({ ...AJUSTES_PADRAO, radius: 0 }).split("\r\n");
    expect(reto.filter((l) => l === "CORTE").length).toBe(8 * (1 + 4 + 1));
  });
});

describe("lote de produção", () => {
  const normal = (id: string, face = "front") => `https://cards.scryfall.io/normal/${face}/a/b/${id}.jpg?123`;
  const png = (id: string, face = "front") => `https://cards.scryfall.io/png/${face}/a/b/${id}.png?123`;
  const pedidos: PedidoDoLote[] = [
    {
      code: "PX-AAAA",
      itens: [
        { printId: "simples", nome: "Sol Ring", nomeImpresso: "Anel Solar", lang: "pt", image: normal("simples"), quantidade: 2 },
        { printId: "dupla", nome: "Delver of Secrets // Insectile Aberration", nomeImpresso: null, lang: "en", image: normal("dupla"), quantidade: 1 },
      ],
    },
    { code: "PX-BBBB", itens: [{ printId: "sem-detalhe", nome: "Counterspell", nomeImpresso: null, lang: "en", image: normal("sem-detalhe"), quantidade: 1 }] },
  ];
  const detalhes = new Map<string, DetalheDeImpressao>([
    ["simples", { id: "simples", nome: "Sol Ring", lang: "pt", set: "c21", collectorNumber: "263", faces: [{ nome: "Anel Solar", normal: normal("simples"), png: png("simples") }] }],
    ["dupla", { id: "dupla", nome: "Delver of Secrets // Insectile Aberration", lang: "en", set: "isd", collectorNumber: "51", faces: [
      { nome: "Delver of Secrets", normal: normal("dupla"), png: png("dupla") },
      { nome: "Insectile Aberration", normal: normal("dupla", "back"), png: png("dupla", "back") },
    ] }],
  ]);

  it("abre uma posição por cópia e por face, na ordem dos pedidos", () => {
    const slots = montarSlots(pedidos, detalhes, true);
    expect(slots.map((s) => `${s.nome}|${s.face}|${s.origem}`)).toEqual([
      "Anel Solar|0|PX-AAAA",
      "Anel Solar|0|PX-AAAA",
      "Delver of Secrets|0|PX-AAAA",
      "Insectile Aberration|1|PX-AAAA",
      "Counterspell|0|PX-BBBB",
    ]);
    expect(slots[2].grupo).toBe(slots[3].grupo);
    expect(slots[3].png).toBe(png("dupla", "back"));
    expect(new Set(slots.map((s) => s.uid)).size).toBe(slots.length);
  });

  it("sem os detalhes do Scryfall usa a frente gravada no pedido", () => {
    const slot = montarSlots(pedidos, detalhes, true).at(-1)!;
    expect(slot.thumb).toBe(normal("sem-detalhe"));
    expect(slot.png).toBe(png("sem-detalhe"));
    expect(pngDaImagemNormal("https://cards.scryfall.io/normal/front/1/2/x.jpg")).toBe("https://cards.scryfall.io/png/front/1/2/x.png");
  });

  it("liga e desliga os versos sem perder a ordem do lote", () => {
    const sem = montarSlots(pedidos, detalhes, false);
    expect(sem).toHaveLength(4);
    const reordenado = moverSlot(sem, 2, 0); // a carta de duas faces vai para o começo
    const com = ajustarVersos(reordenado, detalhes, true);
    expect(com.map((s) => s.nome)).toEqual(["Delver of Secrets", "Insectile Aberration", "Anel Solar", "Anel Solar", "Counterspell"]);
    expect(ajustarVersos(com, detalhes, true)).toHaveLength(5); // não duplica o verso
    expect(ajustarVersos(com, detalhes, false).map((s) => s.nome)).toEqual(["Delver of Secrets", "Anel Solar", "Anel Solar", "Counterspell"]);
  });

  it("move posições dentro dos limites", () => {
    const slots = montarSlots(pedidos, detalhes, false);
    expect(moverSlot(slots, 0, 99).at(-1)!.nome).toBe("Anel Solar");
    expect(moverSlot(slots, 5, 0)).toBe(slots);
    expect(moverSlot(slots, 1, 1)).toBe(slots);
  });
});
