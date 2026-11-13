"use client";

import { useEffect, useRef, useState } from "react";
import type { CardPrint } from "@/lib/types";

/**
 * Janela com todas as artes de uma carta, em inglês e em português. Usada na
 * loja (a cliente troca a arte do pedido) e na produção (o ateliê troca a arte
 * de uma carta do lote). Escolher uma arte fecha a janela.
 */
export function EscolhaDeArte({
  oracleId,
  nome,
  atualId,
  onEscolher,
  onClose,
  children,
}: {
  oracleId: string;
  nome: string;
  /** Impressão em uso, que aparece marcada. */
  atualId: string;
  onEscolher: (print: CardPrint) => void;
  onClose: () => void;
  /** Opções extras, mostradas acima das artes. */
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [prints, setPrints] = useState<CardPrint[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    let vivo = true;
    fetch(`/api/cards/prints?oracleId=${oracleId}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { prints?: CardPrint[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Algo deu errado. Tente de novo.");
        return data.prints ?? [];
      })
      .then((lista) => vivo && setPrints(lista))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [oracleId]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(920px,94vw)] rounded-2xl border border-line bg-surface p-0 text-cream backdrop:bg-black/70"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line p-5">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Artes de {nome}</h2>
        <button type="button" className="btn btn-ghost px-4 text-sm" onClick={() => ref.current?.close()}>
          Fechar
        </button>
      </div>
      {children && <div className="border-b border-line px-5 py-3">{children}</div>}
      <div className="max-h-[70vh] overflow-y-auto p-5">
        {erro && <p className="text-gold-soft">{erro}</p>}
        {!erro && !prints && <p className="text-muted">Carregando artes…</p>}
        {prints?.length === 0 && <p className="text-muted">Não encontrei artes desta carta.</p>}
        {prints && prints.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
            {prints.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={p.id === atualId}
                  aria-label={`${p.setName}, número ${p.collectorNumber}, ${p.lang === "pt" ? "em português" : "em inglês"}`}
                  className={`flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border-2 p-1.5 text-left ${p.id === atualId ? "border-gold" : "border-transparent hover:border-edge"}`}
                  onClick={() => {
                    onEscolher(p);
                    ref.current?.close();
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" loading="lazy" className="aspect-[63/88] w-full rounded-md bg-ink object-cover" />
                  <span className="truncate text-xs text-muted">{p.setName}</span>
                  {/* o idioma fica na linha curta, que nunca é cortada pelo nome da edição */}
                  <span className="truncate font-mono text-[11px] uppercase text-muted">
                    {p.set} #{p.collectorNumber} · {p.lang === "pt" ? "PT" : "EN"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
