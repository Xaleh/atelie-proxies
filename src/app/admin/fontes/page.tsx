import type { Metadata } from "next";
import { AdminShell } from "@/components/AdminShell";
import { exigirAdmin } from "@/lib/session";
import type { LetraEnviada } from "@/lib/tipografia";
import { letrasEnviadas } from "@/lib/tipografia-servidor";
import { FormularioDeFontes } from "./FormularioDeFontes";

export const metadata: Metadata = { title: "Fontes", robots: { index: false, follow: false } };

export default async function FontesPage() {
  await exigirAdmin();
  let letras: LetraEnviada[] = [];
  let bancoOk = true;
  try {
    letras = await letrasEnviadas();
  } catch (err) {
    console.error("[admin/fontes]", err);
    bancoOk = false;
  }

  return (
    <AdminShell>
      <h1 className="display text-[40px]">Fontes das cartas</h1>
      <p className="max-w-3xl text-base text-muted">
        As letras do texto em português que o site escreve sobre a arte. Cada parte da carta tem um encaixe: com um
        arquivo enviado, as cartas saem com essa fonte na loja, na produção e no PDF; sem arquivo, saem com a fonte livre
        indicada. O tamanho do texto se ajusta sozinho a cada fonte. Os arquivos ficam guardados no banco do site e não
        vão para o repositório.
      </p>
      {!bancoOk && (
        <p className="panel border-gold p-4">
          O banco não respondeu, então os encaixes abaixo podem aparecer vazios sem estar. Recarregue a página antes de
          enviar.
        </p>
      )}
      <FormularioDeFontes iniciais={letras} podeSalvar={bancoOk} />
    </AdminShell>
  );
}
