import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Sessão do painel: um usuário só, com a senha em ADMIN_PASSWORD.
 * O cookie leva a validade assinada com SESSION_SECRET; não há nada guardado
 * no banco para a sessão.
 */

const COOKIE = "pdr_admin";
const DURACAO_S = 60 * 60 * 24 * 14;

function segredo(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 16 ? s : null;
}

export function painelConfigurado(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && segredo());
}

function assinar(valor: string, chave: string): string {
  return createHmac("sha256", chave).update(valor).digest("base64url");
}

function iguais(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function senhaCorreta(tentativa: string): boolean {
  const senha = process.env.ADMIN_PASSWORD;
  return Boolean(senha) && iguais(tentativa, senha!);
}

export function criarValorDeSessao(agora = Date.now()): string | null {
  const chave = segredo();
  if (!chave) return null;
  const expira = String(Math.floor(agora / 1000) + DURACAO_S);
  return `${expira}.${assinar(expira, chave)}`;
}

export function sessaoValida(valor: string | undefined, agora = Date.now()): boolean {
  const chave = segredo();
  if (!chave || !valor) return false;
  const [expira, assinatura] = valor.split(".");
  if (!expira || !assinatura || !/^\d+$/.test(expira)) return false;
  if (Number(expira) * 1000 < agora) return false;
  return iguais(assinatura, assinar(expira, chave));
}

export async function abrirSessao(): Promise<boolean> {
  const valor = criarValorDeSessao();
  if (!valor) return false;
  (await cookies()).set(COOKIE, valor, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_S,
  });
  return true;
}

export async function fecharSessao(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function estaLogado(): Promise<boolean> {
  return sessaoValida((await cookies()).get(COOKIE)?.value);
}

/** Use no topo de toda página e ação do painel. */
export async function exigirAdmin(): Promise<void> {
  if (!(await estaLogado())) redirect("/admin/login");
}
