import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loja } from "@/config/loja";
import { estaLogado } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await estaLogado()) redirect("/admin");
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-320.png" alt={loja.nome} width={120} height={160} className="h-40 w-auto self-center" />
      <h1 className="display text-center text-4xl">Painel do ateliê</h1>
      <LoginForm />
    </main>
  );
}
