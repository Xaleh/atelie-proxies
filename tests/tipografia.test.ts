import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { ENCAIXES, TAMANHO_MAXIMO, ehEncaixe, formatoDaLetra } from "@/lib/tipografia";

const dir = mkdtempSync(join(tmpdir(), "pdr-letras-"));
process.env.TURSO_DATABASE_URL = `file:${join(dir, "teste.db")}`;
const srv = await import("@/lib/tipografia-servidor");

/** Um arquivo com o começo de cada formato e bytes quaisquer depois. */
const arquivo = (marca: number[], tamanho = 64) => Uint8Array.from({ length: tamanho }, (_, i) => marca[i] ?? i % 251);
const TTF = [0x00, 0x01, 0x00, 0x00], OTF = [0x4f, 0x54, 0x54, 0x4f], WOFF2 = [0x77, 0x4f, 0x46, 0x32];

beforeAll(async () => {
  const client = createClient({ url: process.env.TURSO_DATABASE_URL! });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  client.close();
});

describe("formato do arquivo", () => {
  it("reconhece as fontes pelos primeiros bytes", () => {
    expect(formatoDaLetra(arquivo(TTF))).toEqual({ formato: "truetype", mime: "font/ttf" });
    expect(formatoDaLetra(arquivo(OTF))).toEqual({ formato: "opentype", mime: "font/otf" });
    expect(formatoDaLetra(arquivo([0x77, 0x4f, 0x46, 0x46]))).toEqual({ formato: "woff", mime: "font/woff" });
    expect(formatoDaLetra(arquivo(WOFF2))).toEqual({ formato: "woff2", mime: "font/woff2" });
  });

  it("recusa o que não é fonte, mesmo curto ou com cara de imagem", () => {
    expect(formatoDaLetra(arquivo([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(formatoDaLetra(new TextEncoder().encode("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(formatoDaLetra(arquivo(TTF, 8))).toBeNull();
  });

  it("só aceita os quatro encaixes", () => {
    expect(ENCAIXES).toEqual(["titulo", "regras", "regras-italico", "rodape"]);
    expect(ehEncaixe("regras-italico")).toBe(true);
    expect(ehEncaixe("../segredo")).toBe(false);
    expect(ehEncaixe(null)).toBe(false);
  });
});

describe("letras no banco", () => {
  it("começa vazio: as cartas usam as fontes livres", async () => {
    expect(await srv.letrasEnviadas()).toEqual([]);
    expect(await srv.arquivoDaLetra("titulo")).toBeNull();
  });

  it("grava, lista sem os bytes e entrega o arquivo igual", async () => {
    const bytes = arquivo(TTF, 300);
    await srv.salvarLetra("titulo", "C:\\fontes\\Titulo Bold.ttf", bytes);
    const [l] = await srv.letrasEnviadas();
    expect(l).toMatchObject({ encaixe: "titulo", arquivo: "Titulo Bold.ttf", bytes: 300, formato: "truetype" });
    expect(l.url).toBe(`/api/fontes/titulo?v=${l.hash}`);
    expect(l.hash).toMatch(/^[0-9a-f]{16}$/);
    const guardado = await srv.arquivoDaLetra("titulo");
    expect(guardado?.mime).toBe("font/ttf");
    expect(new Uint8Array(guardado!.data)).toEqual(bytes);
  });

  it("trocar o arquivo muda o endereço; a lista segue a ordem dos encaixes", async () => {
    const [antes] = await srv.letrasEnviadas();
    await srv.salvarLetra("rodape", "rodape.woff2", arquivo(WOFF2, 200));
    await srv.salvarLetra("regras-italico", "italico.otf", arquivo(OTF, 200));
    await srv.salvarLetra("titulo", "outro.otf", arquivo(OTF, 400));
    const lista = await srv.letrasEnviadas();
    expect(lista.map((l) => l.encaixe)).toEqual(["titulo", "regras-italico", "rodape"]);
    expect(lista[0]).toMatchObject({ arquivo: "outro.otf", bytes: 400, formato: "opentype" });
    expect(lista[0].hash).not.toBe(antes.hash);
  });

  it("recusa encaixe desconhecido, arquivo que não é fonte e arquivo grande demais", async () => {
    await expect(srv.salvarLetra("capa", "a.ttf", arquivo(TTF))).rejects.toBeInstanceOf(srv.LetraRecusada);
    await expect(srv.salvarLetra("regras", "foto.ttf", arquivo([0xff, 0xd8, 0xff, 0xe0]))).rejects.toBeInstanceOf(srv.LetraRecusada);
    await expect(srv.salvarLetra("regras", "enorme.ttf", arquivo(TTF, TAMANHO_MAXIMO + 1))).rejects.toBeInstanceOf(srv.LetraRecusada);
    expect((await srv.letrasEnviadas()).some((l) => l.encaixe === "regras")).toBe(false);
  });

  it("remover devolve o encaixe à fonte livre", async () => {
    await srv.removerLetra("titulo");
    expect(await srv.arquivoDaLetra("titulo")).toBeNull();
    expect((await srv.letrasEnviadas()).map((l) => l.encaixe)).toEqual(["regras-italico", "rodape"]);
    await expect(srv.removerLetra("capa")).rejects.toBeInstanceOf(srv.LetraRecusada);
  });
});
