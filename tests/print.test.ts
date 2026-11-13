import { describe, expect, it } from "vitest";
import { gerarDxf } from "@/lib/print/dxf";
import { AJUSTES_PADRAO, MARCA, avisosDoLayout, computeLayout, folhasPara } from "@/lib/print/layout";
import {
  completarVersos,
  copiasDaCarta,
  detalheDaFrente,
  duplicarGrupo,
  grupoDe,
  moverUmaPosicao,
  tirarGrupo,
  montarSlots,
  moverSlot,
  pngDaImagemNormal,
  trocarArte,
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
        { printId: "simples", oracleId: "o1", traduzida: false, nome: "Sol Ring", nomeImpresso: "Anel Solar", lang: "pt", image: normal("simples"), quantidade: 2 },
        { printId: "dupla", oracleId: "o2", traduzida: true, nome: "Delver of Secrets // Insectile Aberration", nomeImpresso: null, lang: "en", image: normal("dupla"), quantidade: 1 },
      ],
    },
    { code: "PX-BBBB", itens: [{ printId: "sem-detalhe", oracleId: "o3", traduzida: false, nome: "Counterspell", nomeImpresso: null, lang: "en", image: normal("sem-detalhe"), quantidade: 1 }] },
  ];
  const detalhes = new Map<string, DetalheDeImpressao>([
    ["simples", { id: "simples", nome: "Sol Ring", lang: "pt", set: "c21", collectorNumber: "263", faces: [{ nome: "Anel Solar", normal: normal("simples"), png: png("simples") }] }],
    ["dupla", { id: "dupla", nome: "Delver of Secrets // Insectile Aberration", lang: "en", set: "isd", collectorNumber: "51", faces: [
      { nome: "Delver of Secrets", normal: normal("dupla"), png: png("dupla") },
      { nome: "Insectile Aberration", normal: normal("dupla", "back"), png: png("dupla", "back") },
    ] }],
  ]);

  it("abre uma posição por cópia e por face, na ordem dos pedidos", () => {
    const slots = montarSlots(pedidos, detalhes);
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
    const slot = montarSlots(pedidos, detalhes).at(-1)!;
    expect(slot.thumb).toBe(normal("sem-detalhe"));
    expect(slot.png).toBe(png("sem-detalhe"));
    expect(pngDaImagemNormal("https://cards.scryfall.io/normal/front/1/2/x.jpg")).toBe("https://cards.scryfall.io/png/front/1/2/x.png");
  });

  it("lote guardado sem o verso ganha o verso logo depois da frente, uma vez só", () => {
    const antigo = montarSlots(pedidos, detalhes).filter((s) => s.face === 0);
    expect(antigo).toHaveLength(4);
    const completo = completarVersos(antigo, detalhes);
    expect(completo.map((s) => s.nome)).toEqual(["Anel Solar", "Anel Solar", "Delver of Secrets", "Insectile Aberration", "Counterspell"]);
    expect(completarVersos(completo, detalhes)).toBe(completo);
  });

  const nomes = (slots: ReturnType<typeof montarSlots>) => slots.map((s) => `${s.nome.split(" ")[0]}${s.grupo}`).join(" ");

  it("frente e verso andam juntos ao mover", () => {
    const slots = montarSlots(pedidos, detalhes); // Anel1 Anel2 Delver3 Insectile3 Counterspell4
    expect(grupoDe(slots, 3)).toEqual([2, 3]);
    // arrastar o verso para o começo leva a frente junto
    expect(nomes(moverSlot(slots, 3, 0))).toBe("Delver3 Insectile3 Anel1 Anel2 Counterspell4");
    // soltar uma carta em cima do verso de outra: cai depois do par, nunca no meio
    expect(nomes(moverSlot(slots, 0, 2))).toBe("Anel2 Delver3 Insectile3 Anel1 Counterspell4");
    expect(nomes(moverSlot(slots, 4, 3))).toBe("Anel1 Anel2 Counterspell4 Delver3 Insectile3");
    // soltar em cima do próprio par não muda nada
    expect(moverSlot(slots, 2, 3)).toBe(slots);
    // setas: uma carta de cada vez, pulando o par inteiro
    expect(nomes(moverUmaPosicao(slots, 1, 1))).toBe("Anel1 Delver3 Insectile3 Anel2 Counterspell4");
    expect(nomes(moverUmaPosicao(slots, 2, 1))).toBe("Anel1 Anel2 Counterspell4 Delver3 Insectile3");
    expect(nomes(moverUmaPosicao(slots, 3, -1))).toBe("Anel1 Delver3 Insectile3 Anel2 Counterspell4");
    expect(moverUmaPosicao(slots, 0, -1)).toBe(slots);
    expect(moverUmaPosicao(slots, 4, 1)).toBe(slots);
  });

  it("duplicar e tirar valem para o par", () => {
    const slots = montarSlots(pedidos, detalhes);
    const mais = duplicarGrupo(slots, 3);
    expect(nomes(mais)).toBe("Anel1 Anel2 Delver3 Insectile3 Delver5 Insectile5 Counterspell4");
    expect(new Set(mais.map((s) => s.uid)).size).toBe(mais.length);
    expect(nomes(tirarGrupo(slots, 2))).toBe("Anel1 Anel2 Counterspell4");
    expect(nomes(tirarGrupo(slots, 0))).toBe("Anel2 Delver3 Insectile3 Counterspell4");
  });

  describe("troca de arte", () => {
    const arteEn: DetalheDeImpressao = {
      id: "simples-en", oracleId: "o1", nome: "Sol Ring", lang: "en", set: "lea", collectorNumber: "270",
      faces: [{ nome: "Sol Ring", normal: normal("simples-en"), png: png("simples-en") }],
    };
    const artePt: DetalheDeImpressao = {
      id: "contra-pt", oracleId: "o3", nome: "Counterspell", lang: "pt", set: "4ed", collectorNumber: "65",
      faces: [{ nome: "Contramágica", normal: normal("contra-pt"), png: png("contra-pt") }],
    };
    const duplaNova: DetalheDeImpressao = {
      id: "dupla-nova", oracleId: "o2", nome: "Delver of Secrets // Insectile Aberration", lang: "en", set: "mid", collectorNumber: "47",
      faces: [
        { nome: "Delver of Secrets", normal: normal("dupla-nova"), png: png("dupla-nova") },
        { nome: "Insectile Aberration", normal: normal("dupla-nova", "back"), png: png("dupla-nova", "back") },
      ],
    };
    const resumo = (slots: ReturnType<typeof montarSlots>) => slots.map((s) => `${s.printId}/${s.face}`).join(" ");

    it("troca só a cópia clicada e mantém o lugar e o pedido de origem", () => {
      const slots = montarSlots(pedidos, detalhes);
      const novo = trocarArte(slots, 1, arteEn);
      expect(resumo(novo)).toBe("simples/0 simples-en/0 dupla/0 dupla/1 sem-detalhe/0");
      expect(novo[1]).toMatchObject({ uid: slots[1].uid, grupo: slots[1].grupo, origem: "PX-AAAA", set: "lea", num: "270", thumb: normal("simples-en"), png: png("simples-en") });
      expect(novo[0]).toBe(slots[0]);
    });

    it("com a opção de todas as cópias, troca cada cópia da mesma carta", () => {
      const slots = montarSlots(pedidos, detalhes);
      expect(copiasDaCarta(slots, 0)).toBe(2);
      expect(copiasDaCarta(slots, 3)).toBe(1);
      expect(resumo(trocarArte(slots, 0, arteEn, true))).toBe("simples-en/0 simples-en/0 dupla/0 dupla/1 sem-detalhe/0");
      // cópia que já estava com outra arte continua contando como a mesma carta
      const misto = trocarArte(slots, 0, arteEn);
      expect(copiasDaCarta(misto, 1)).toBe(2);
    });

    it("carta pedida em português numa arte em inglês passa a receber o texto traduzido", () => {
      const slots = montarSlots(pedidos, detalhes); // Anel Solar: impressão oficial em português
      expect(slots[0]).toMatchObject({ lang: "pt", traduzida: false });
      expect(trocarArte(slots, 0, arteEn)[0]).toMatchObject({ lang: "pt", traduzida: true, nome: "Sol Ring", nomeEn: "Sol Ring" });
    });

    it("arte em português sai em português sem tradução por cima; a em inglês mantém o inglês", () => {
      const slots = montarSlots(pedidos, detalhes);
      expect(trocarArte(slots, 4, artePt)[4]).toMatchObject({ lang: "pt", traduzida: false, nome: "Contramágica", printId: "contra-pt" });
      const outraEn = { ...arteEn, id: "contra-en", oracleId: "o3", nome: "Counterspell", faces: [{ nome: "Counterspell", normal: normal("contra-en"), png: png("contra-en") }] };
      expect(trocarArte(slots, 4, outraEn)[4]).toMatchObject({ lang: "en", traduzida: false });
    });

    it("carta de duas faces troca frente e verso juntos, clicando em qualquer uma", () => {
      const slots = montarSlots(pedidos, detalhes);
      const novo = trocarArte(slots, 3, duplaNova);
      expect(resumo(novo)).toBe("simples/0 simples/0 dupla-nova/0 dupla-nova/1 sem-detalhe/0");
      expect(novo[3]).toMatchObject({ grupo: slots[3].grupo, png: png("dupla-nova", "back"), nomeEn: "Insectile Aberration", traduzida: true });
      expect(new Set(novo.map((s) => s.uid)).size).toBe(novo.length);
    });

    it("arte de uma face só no lugar de uma de duas faces tira o verso", () => {
      const slots = montarSlots(pedidos, detalhes);
      const umaFace = { ...duplaNova, id: "dupla-frente", faces: duplaNova.faces.slice(0, 1) };
      expect(resumo(trocarArte(slots, 2, umaFace))).toBe("simples/0 simples/0 dupla-frente/0 sem-detalhe/0");
    });

    it("sem faces ou fora do lote, não muda nada", () => {
      const slots = montarSlots(pedidos, detalhes);
      expect(trocarArte(slots, 0, { ...arteEn, faces: [] })).toBe(slots);
      expect(trocarArte(slots, 99, arteEn)).toBe(slots);
    });

    it("monta os detalhes da frente a partir da busca de artes", () => {
      const d = detalheDaFrente({
        id: "x", oracleId: "o9", name: "Lightning Bolt", printedName: "Raio", lang: "pt", set: "m10", setName: "Magic 2010",
        collectorNumber: "146", image: normal("x"),
      });
      expect(d).toMatchObject({ id: "x", oracleId: "o9", lang: "pt", set: "m10", collectorNumber: "146" });
      expect(d.faces).toEqual([{ nome: "Raio", normal: normal("x"), png: png("x") }]);
    });
  });

  it("move posições dentro dos limites", () => {
    const slots = montarSlots(pedidos, detalhes);
    expect(moverSlot(slots, 0, 99).at(-1)!.nome).toBe("Anel Solar");
    expect(moverSlot(slots, 5, 0)).toBe(slots);
    expect(moverSlot(slots, 1, 1)).toBe(slots);
  });
});
