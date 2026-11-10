"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { STATUS, type Status } from "@/lib/db/schema";
import { mudarStatus } from "@/lib/orders";
import { abrirSessao, exigirAdmin, fecharSessao, painelConfigurado, senhaCorreta } from "@/lib/session";

export async function entrar(_anterior: string | null, form: FormData): Promise<string | null> {
  if (!painelConfigurado()) return "O painel ainda não está configurado (ADMIN_PASSWORD e SESSION_SECRET).";
  // Atraso fixo para encarecer tentativas em série.
  await new Promise((r) => setTimeout(r, 600));
  if (!senhaCorreta(String(form.get("senha") ?? ""))) return "Senha incorreta.";
  await abrirSessao();
  redirect("/admin");
}

export async function sair(): Promise<void> {
  await fecharSessao();
  redirect("/admin/login");
}

export async function atualizarStatus(form: FormData): Promise<void> {
  await exigirAdmin();
  const code = String(form.get("code") ?? "");
  const status = String(form.get("status") ?? "") as Status;
  if (!STATUS.includes(status)) throw new Error("Status inválido");
  await mudarStatus(code, status, String(form.get("tracking") ?? ""));
  revalidatePath("/admin");
  revalidatePath(`/admin/pedidos/${code}`);
}
