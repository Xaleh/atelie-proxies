import type { Metadata } from "next";
import { AdminShell } from "@/components/AdminShell";
import { dataHora } from "@/lib/format";
import { exigirAdmin } from "@/lib/session";
import { resumoDasTraducoes, revisoesRecentes } from "@/lib/traducao/servidor";
import { EditorDeTraducao, ImportarArena } from "./Traducoes";

export const metadata: Metadata = { title: "Traduções", robots: { index: false, follow: false } };

export default async function TraducoesPage({ searchParams }: { searchParams: Promise<{ nome?: string }> }) {
  await exigirAdmin();
  const { nome } = await searchParams;
  let resumo: Awaited<ReturnType<typeof resumoDasTraducoes>> | null = null;
  let revisoes: Awaited<ReturnType<typeof revisoesRecentes>> = [];
  try {
    [resumo, revisoes] = await Promise.all([resumoDasTraducoes(), revisoesRecentes()]);
  } catch (err) {
    console.error("[admin/traducoes]", err);
  }

  return (
    <AdminShell>
      <h1 className="display text-[40px]">Traduções</h1>
      <p className="max-w-3xl text-base text-muted">
        O site usa, nesta ordem: a revisão feita aqui, o texto oficial do MTG Arena e o texto da carta impressa em
        português. Carta sem nenhum dos três sai em inglês.
      </p>

      <div className="flex flex-wrap gap-4">
        {[
          ["Cartas do Arena", resumo?.arena ?? 0],
          ["Ambientações do Arena", resumo?.sabores ?? 0],
          ["Revisões do ateliê", resumo?.manual ?? 0],
          ["Moldes marcados", resumo?.moldes ?? 0],
        ].map(([rotulo, n]) => (
          <div key={rotulo} className="panel min-w-[180px] flex-1 p-4">
            <div className="font-display text-4xl font-extrabold text-gold">{Number(n).toLocaleString("pt-BR")}</div>
            <div className="text-muted">{rotulo}</div>
          </div>
        ))}
      </div>
      {!resumo && <p className="panel border-gold p-4">O banco não respondeu; os números acima podem estar desatualizados.</p>}

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">Revisar uma carta</h2>
          <EditorDeTraducao nomeInicial={nome ?? ""} />
        </section>
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <ImportarArena ultimaImportacao={resumo?.arenaEm ? dataHora(resumo.arenaEm + "Z") : null} />
          <div className="panel flex flex-col gap-2 p-5">
            <h2 className="text-[15px] font-bold">Revisões recentes</h2>
            {revisoes.length === 0 ? (
              <p className="text-muted">Nenhuma revisão ainda.</p>
            ) : (
              <ul className="flex flex-col">
                {revisoes.map((r) => (
                  <li key={r.nameEn} className="border-t border-line first:border-t-0">
                    <a href={`/admin/traducoes?nome=${encodeURIComponent(r.nameEn)}`} className="flex min-h-11 items-center justify-between gap-3 py-1.5 hover:text-gold-soft">
                      <span className="truncate font-semibold">{r.nome}</span>
                      <span className="shrink-0 text-xs text-muted">{dataHora(r.updatedAt + "Z")}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}
