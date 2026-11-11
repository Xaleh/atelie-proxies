import { describe, expect, it } from "vitest";
import { crc16, gerarPixCopiaECola } from "@/lib/pix";

describe("crc16", () => {
  it("bate com o valor de referência do CRC-16/CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
});

describe("gerarPixCopiaECola", () => {
  const codigo = gerarPixCopiaECola({
    chave: "contato@exemplo.com",
    recebedor: "Ateliê São João",
    cidade: "Cidade Exemplo",
    centavos: 7250,
    txid: "PX-7K3D",
  });

  it("termina com o CRC do próprio conteúdo", () => {
    expect(codigo.slice(-8, -4)).toBe("6304");
    expect(crc16(codigo.slice(0, -4))).toBe(codigo.slice(-4));
  });

  it("leva chave, valor, moeda e identificador", () => {
    expect(codigo.startsWith("000201")).toBe(true);
    expect(codigo).toContain("0014br.gov.bcb.pix0119contato@exemplo.com");
    expect(codigo).toContain("5303986");
    expect(codigo).toContain("540572.50");
    expect(codigo).toContain("5802BR");
    expect(codigo).toContain("0506PX7K3D");
  });

  it("tira acentos e respeita os limites de nome e cidade", () => {
    expect(codigo).toContain("5915Atelie Sao Joao");
    expect(codigo).toContain("6014Cidade Exemplo");
    const longo = gerarPixCopiaECola({
      chave: "x",
      recebedor: "Um Nome de Recebedor Muito Comprido Mesmo",
      cidade: "Uma Cidade de Nome Enorme",
      centavos: 100,
      txid: "A",
    });
    expect(longo).toContain("5925Um Nome de Recebedor Muit");
    expect(longo).toContain("6015Uma Cidade de N");
  });
});
