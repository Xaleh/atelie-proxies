import type { Metadata } from "next";
import { AdminShell } from "@/components/AdminShell";
import { COMBOS_PADRAO, type Combos, type Produto } from "@/lib/acessorios";
import { combosDaLoja, listarProdutos } from "@/lib/acessorios-servidor";
import { exigirAdmin } from "@/lib/session";
import { VALORES_PADRAO } from "@/lib/valores";
import { valoresDaLoja } from "@/lib/valores-servidor";
import { FormularioDeAcessorios } from "./FormularioDeAcessorios";

export const metadata: Metadata = { title: "Acessórios", robots: { index: false, follow: false } };

export default async function AcessoriosPage() {
  await exigirAdmin();
  let produtos: Produto[] = [];
  let combos: Combos = COMBOS_PADRAO;
  let valores = VALORES_PADRAO;
  let bancoOk = true;
  try {
    [produtos, combos, { valores }] = await Promise.all([listarProdutos(), combosDaLoja(), valoresDaLoja()]);
  } catch (err) {
    console.error("[admin/acessorios]", err);
    bancoOk = false;
  }

  return (
    <AdminShell>
      <h1 className="display text-[40px]">Acessórios</h1>
      <p className="max-w-3xl text-base text-muted">
        Sleeves e deckboxes que a cliente pode levar junto com as cartas, e o desconto de cada combo. Só aparece na loja o
        que estiver marcado como disponível. Pedidos já feitos mantêm o nome e o preço de quando foram fechados.
      </p>
      {!bancoOk && (
        <p className="panel border-gold p-4">
          O banco não respondeu, então a lista abaixo pode estar vazia sem estar. Recarregue a página antes de salvar.
        </p>
      )}
      <FormularioDeAcessorios produtos={produtos} combos={combos} valores={valores} podeSalvar={bancoOk} />
    </AdminShell>
  );
}
