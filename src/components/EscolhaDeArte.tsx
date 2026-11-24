"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { colecoesDasArtes, filtrarPorColecao, rotuloDaColecao } from "@/lib/colecoes";
import type { CardPrint } from "@/lib/types";

/** Quantas artes aparecem de cada vez; rolar até o fim da lista mostra mais. */
const POR_VEZ = 60;

/**
 * Artes já buscadas nesta aba, por carta. Passar de uma carta para outra e
 * voltar não busca de novo. O filtro por coleção vale sobre esta lista, então
 * a chave é só a carta (os idiomas são sempre inglês e português).
 */
const cache = new Map<string, Promise<CardPrint[]>>();

function buscarArtes(oracleId: string): Promise<CardPrint[]> {
  let p = cache.get(oracleId);
  if (!p) {
    p = fetch(`/api/cards/prints?oracleId=${oracleId}`).then(async (res) => {
      const data = (await res.json().catch(() => ({}))) as { prints?: CardPrint[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Algo deu errado. Tente de novo.");
      return data.prints ?? [];
    });
    // uma busca que falhou não fica guardada: a próxima tentativa busca de novo
    p.catch(() => cache.delete(oracleId));
    cache.set(oracleId, p);
  }
  return p;
}

/** Passar de carta sem fechar a janela (setas ◀ ▶ e teclas ← →). */
export type NavegacaoDeArtes = {
  /** Posição da carta aberta, começando em 0. */
  posicao: number;
  total: number;
  irPara: (posicao: number) => void;
};

/**
 * Janela com todas as artes de uma carta, em inglês e em português. Usada na
 * loja (a cliente troca a arte do pedido) e na produção (o ateliê troca a arte
 * de uma carta do lote). Um campo filtra as artes pela coleção.
 *
 * Com `navegacao`, as setas passam para a carta anterior ou a próxima sem
 * fechar: escolher uma arte marca a escolhida e a janela continua aberta. Sem
 * ela (ou com uma carta só), escolher uma arte fecha a janela.
 */
export function EscolhaDeArte({
  oracleId,
  nome,
  atualId,
  onEscolher,
  onClose,
  navegacao,
  children,
}: {
  oracleId: string;
  nome: string;
  /** Impressão em uso, que aparece marcada. */
  atualId: string;
  onEscolher: (print: CardPrint) => void;
  onClose: () => void;
  navegacao?: NavegacaoDeArtes;
  /** Opções extras, mostradas acima das artes. */
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fimDaLista = useRef<HTMLDivElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const [resultado, setResultado] = useState<{ oracleId: string; prints?: CardPrint[]; erro?: string } | null>(null);
  // o filtro continua ao passar de carta; começa limpo ao abrir a janela
  const [colecao, setColecao] = useState("");
  const [mostrar, setMostrar] = useState({ chave: "", n: POR_VEZ });
  const [escolhida, setEscolhida] = useState<{ oracleId: string; texto: string } | null>(null);
  const id = useId();
  const varias = Boolean(navegacao && navegacao.total > 1);

  const prints = resultado?.oracleId === oracleId ? (resultado.prints ?? null) : null;
  const erro = resultado?.oracleId === oracleId ? (resultado.erro ?? null) : null;
  const colecoes = useMemo(() => colecoesDasArtes(prints ?? []), [prints]);
  const filtradas = useMemo(() => filtrarPorColecao(prints ?? [], colecao), [prints, colecao]);
  const filtrando = colecao.trim() !== "";
  // ao trocar de carta ou de filtro, volta às primeiras artes
  const chaveDaLista = `${oracleId}|${colecao}`;
  const quantas = mostrar.chave === chaveDaLista ? mostrar.n : POR_VEZ;
  const visiveis = filtradas.slice(0, quantas);
  const aviso = escolhida?.oracleId === oracleId ? escolhida.texto : null;

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  useEffect(() => {
    let vivo = true;
    buscarArtes(oracleId)
      .then((lista) => vivo && setResultado({ oracleId, prints: lista }))
      .catch((e: Error) => vivo && setResultado({ oracleId, erro: e.message }));
    rolagem.current?.scrollTo({ top: 0 });
    return () => {
      vivo = false;
    };
  }, [oracleId]);

  // carrega mais artes sozinho quando o fim da lista aparece na tela
  useEffect(() => {
    const alvo = fimDaLista.current;
    if (!alvo || visiveis.length >= filtradas.length) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) setMostrar({ chave: chaveDaLista, n: quantas + POR_VEZ });
      },
      { root: rolagem.current, rootMargin: "400px" },
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [chaveDaLista, quantas, visiveis.length, filtradas.length]);

  // teclas ← → passam de carta (menos quando o cursor está num campo de texto)
  useEffect(() => {
    if (!varias || !navegacao) return;
    const { posicao, total, irPara } = navegacao;
    const tecla = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (ev.key === "ArrowLeft" && posicao > 0) {
        ev.preventDefault();
        irPara(posicao - 1);
      } else if (ev.key === "ArrowRight" && posicao < total - 1) {
        ev.preventDefault();
        irPara(posicao + 1);
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [varias, navegacao]);

  const escolher = (p: CardPrint) => {
    onEscolher(p);
    if (!varias) {
      ref.current?.close();
      return;
    }
    setEscolhida({ oracleId, texto: `Arte escolhida: ${p.set.toUpperCase()} #${p.collectorNumber}. Use ▶ para ir à próxima carta.` });
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(920px,94vw)] rounded-2xl border border-line bg-surface p-0 text-cream backdrop:bg-black/70"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line p-5">
        <h2 className="min-w-0 font-display text-2xl font-bold uppercase tracking-wide">Artes de {nome}</h2>
        <div className="flex items-center gap-2">
          {varias && navegacao && (
            <div className="flex items-center gap-1" role="group" aria-label="Passar de carta">
              <button
                type="button"
                className="btn btn-ghost h-11 w-11 p-0 text-base"
                aria-label="Carta anterior"
                disabled={navegacao.posicao === 0}
                onClick={() => navegacao.irPara(navegacao.posicao - 1)}
              >
                ◀
              </button>
              <span className="min-w-[5.5rem] text-center text-sm text-muted" aria-live="polite">
                {navegacao.posicao + 1} de {navegacao.total}
              </span>
              <button
                type="button"
                className="btn btn-ghost h-11 w-11 p-0 text-base"
                aria-label="Próxima carta"
                disabled={navegacao.posicao >= navegacao.total - 1}
                onClick={() => navegacao.irPara(navegacao.posicao + 1)}
              >
                ▶
              </button>
            </div>
          )}
          <button type="button" className="btn btn-ghost px-4 text-sm" onClick={() => ref.current?.close()}>
            Fechar
          </button>
        </div>
      </div>
      {children && <div className="border-b border-line px-5 py-3">{children}</div>}
      {aviso && (
        <p role="status" className="border-b border-line px-5 py-3 text-gold-soft">
          {aviso}
        </p>
      )}
      {/* com uma coleção só não há o que filtrar; com filtro ativo o campo fica, para poder limpar */}
      {(colecoes.length > 1 || filtrando) && (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-line px-5 py-3">
          <div className="min-w-0 flex-[1_1_260px]">
            <label htmlFor={`${id}-colecao`} className="label">
              Filtrar por coleção
            </label>
            <input
              id={`${id}-colecao`}
              type="search"
              list={`${id}-colecoes`}
              autoComplete="off"
              spellCheck={false}
              className="field"
              placeholder="Nome ou sigla (ex.: Dominaria, DOM)"
              value={colecao}
              onChange={(e) => setColecao(e.target.value)}
            />
            <datalist id={`${id}-colecoes`}>
              {colecoes.map((c) => (
                <option key={c.codigo} value={rotuloDaColecao(c)} />
              ))}
            </datalist>
          </div>
          {filtrando && (
            <button type="button" className="btn btn-ghost px-4 text-sm" onClick={() => setColecao("")}>
              Todas as coleções
            </button>
          )}
          <p aria-live="polite" className="flex min-h-11 items-center text-sm text-muted">
            {filtrando
              ? `${filtradas.length} de ${prints?.length ?? 0} artes`
              : `${prints?.length ?? 0} artes em ${colecoes.length} coleções`}
          </p>
        </div>
      )}
      <div ref={rolagem} className="max-h-[70vh] overflow-y-auto p-5">
        {erro && <p className="text-gold-soft">{erro}</p>}
        {!erro && !prints && <p className="text-muted">Carregando artes…</p>}
        {prints?.length === 0 && <p className="text-muted">Não encontrei artes desta carta.</p>}
        {prints && prints.length > 0 && filtradas.length === 0 && (
          <p className="text-muted">Esta carta não tem arte em nenhuma coleção com esse nome ou essa sigla.</p>
        )}
        {visiveis.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
            {visiveis.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={p.id === atualId}
                  aria-label={`${p.setName}, número ${p.collectorNumber}, ${p.lang === "pt" ? "em português" : "em inglês"}`}
                  className={`flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border-2 p-1.5 text-left ${p.id === atualId ? "border-gold" : "border-transparent hover:border-edge"}`}
                  onClick={() => escolher(p)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" loading="lazy" data-lupa className="aspect-[63/88] w-full rounded-md bg-ink object-cover" />
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
        {visiveis.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            {visiveis.length < filtradas.length
              ? `Mostrando ${visiveis.length} de ${filtradas.length} impressões. Role até o fim para ver mais, ou filtre por coleção.`
              : `Mostrando ${filtradas.length} ${filtradas.length === 1 ? "impressão" : "impressões"}.`}
          </p>
        )}
        <div ref={fimDaLista} aria-hidden="true" className="h-px" />
      </div>
    </dialog>
  );
}
