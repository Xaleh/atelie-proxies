import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { tabelaParaMostrar } from "@/lib/acessorios-servidor";
import { Montador } from "./Montador";

export const metadata: Metadata = { title: "Montar pedido" };

// Preços, acessórios e combos vêm do banco e podem mudar pelo painel a qualquer hora.
export const dynamic = "force-dynamic";

export default async function MontarPage() {
  const tabela = await tabelaParaMostrar();
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 pb-20 pt-11">
        <h1 className="display text-[clamp(44px,5.6vw,72px)]">Monte seu pedido</h1>
        <Montador tabela={tabela} />
      </main>
      <Footer />
    </>
  );
}
