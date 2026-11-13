import type { Metadata } from "next";
import { AdminShell } from "@/components/AdminShell";
import { dataHora } from "@/lib/format";
import { exigirAdmin } from "@/lib/session";
import { VALORES_PADRAO } from "@/lib/valores";
import { valoresDaLoja, type ValoresSalvos } from "@/lib/valores-servidor";
import { FormularioDeValores } from "./FormularioDeValores";

export const metadata: Metadata = { title: "Valores", robots: { index: false, follow: false } };

export default async function ValoresPage() {
  await exigirAdmin();
  let atual: ValoresSalvos = { valores: VALORES_PADRAO, salvoEm: null };
  let bancoOk = true;
  try {
    atual = await valoresDaLoja();
  } catch (err) {
    console.error("[admin/valores]", err);
    bancoOk = false;
  }

  return (
    <AdminShell>
      <h1 className="display text-[40px]">Valores</h1>
      <p className="max-w-3xl text-base text-muted">
        O que a cliente paga: preço por carta, frete e o limite de cartas por pedido. A mudança vale para os próximos
        pedidos assim que você salva; pedidos já feitos mantêm o valor de quando foram fechados.
      </p>
      {!bancoOk && (
        <p className="panel border-gold p-4">
          O banco não respondeu. Os valores abaixo são os do arquivo de configuração e podem não ser os que estão em vigor;
          recarregue a página antes de salvar.
        </p>
      )}
      <FormularioDeValores
        iniciais={atual.valores}
        salvoEm={atual.salvoEm ? dataHora(atual.salvoEm + "Z") : null}
        podeSalvar={bancoOk}
      />
    </AdminShell>
  );
}
