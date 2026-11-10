import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { criarValorDeSessao, senhaCorreta, sessaoValida } from "@/lib/session";

beforeEach(() => {
  process.env.SESSION_SECRET = "um-segredo-com-mais-de-16-caracteres";
  process.env.ADMIN_PASSWORD = "senha-do-painel";
});

describe("sessão do painel", () => {
  it("aceita o cookie que ela mesma emitiu, até vencer", () => {
    const agora = Date.UTC(2026, 10, 10);
    const valor = criarValorDeSessao(agora)!;
    expect(sessaoValida(valor, agora)).toBe(true);
    expect(sessaoValida(valor, agora + 15 * 24 * 3600 * 1000)).toBe(false);
  });

  it("recusa cookie adulterado ou assinado com outro segredo", () => {
    const valor = criarValorDeSessao()!;
    const [expira, assinatura] = valor.split(".");
    expect(sessaoValida(`${Number(expira) + 999}.${assinatura}`)).toBe(false);
    expect(sessaoValida(undefined)).toBe(false);
    process.env.SESSION_SECRET = "outro-segredo-com-mais-de-16-caracteres";
    expect(sessaoValida(valor)).toBe(false);
  });

  it("não funciona sem segredo forte", () => {
    process.env.SESSION_SECRET = "curto";
    expect(criarValorDeSessao()).toBeNull();
  });

  it("confere a senha", () => {
    expect(senhaCorreta("senha-do-painel")).toBe(true);
    expect(senhaCorreta("senha-do-paine")).toBe(false);
    expect(senhaCorreta("")).toBe(false);
  });
});
