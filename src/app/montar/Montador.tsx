"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CartaPrevia } from "@/components/CartaPrevia";
import { EscolhaDeArte } from "@/components/EscolhaDeArte";
import { Seal } from "@/components/Seal";
import { useCart } from "@/lib/cart";
import { parseDecklist } from "@/lib/decklist";
import { brl } from "@/lib/format";
import { LinhasDeAcessorios } from "@/components/ContaDoPedido";
import { linhasDe, type Linha } from "@/lib/acessorios";
import { calcularPedido, folhas, proximaFaixa, type Tabela } from "@/lib/pricing";
import { facesFisicas } from "@/lib/traducao/tipos";
import { Acessorios } from "./Acessorios";
import { useSituacoes, type Situacao } from "@/lib/traducao/carrinho";
import type { CartItem, CatalogEntry } from "@/lib/types";

async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Algo deu errado. Tente de novo.");
  return data;
}

function Busca() {
  const { adicionar } = useCart();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<CatalogEntry[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const q = termo.trim();
    if (q.length < 2) return;
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      setCarregando(true);
      setErro(null);
      try {
        const data = await json<{ entries: CatalogEntry[] }>(
          await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`, { signal: controle.signal }),
        );
        setResultados(data.entries);
      } catch (e) {
        if (!controle.signal.aborted) setErro((e as Error).message);
      } finally {
        if (!controle.signal.aborted) setCarregando(false);
      }
    }, 350);
    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [termo]);

  const visiveis = termo.trim().length >= 2 ? resultados : null;

  return (
    <section className="panel flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 p-5">
      <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
        <span className="text-gold">01</span> Busque a carta
      </h2>
      <div>
        <label htmlFor="busca" className="label">
          Nome em inglês ou em português
        </label>
        <input
          id="busca"
          type="search"
          autoComplete="off"
          className="field"
          placeholder="Ex.: raio, sol ring"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
        />
      </div>
      <div aria-live="polite" className="min-h-6 text-sm text-muted">
        {carregando && "Buscando…"}
        {erro && <span className="text-gold-soft">{erro}</span>}
        {!carregando && !erro && visiveis?.length === 0 && "Nenhuma carta com esse nome."}
      </div>
      {visiveis && visiveis.length > 0 && (
        <ul className="max-h-[340px] overflow-y-auto rounded-[10px] border border-line">
          {visiveis.map((entry) => (
            <li key={entry.oracleId} className="flex items-center gap-3 border-b border-line p-2.5 last:border-b-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={entry.en.image} alt="" loading="lazy" className="h-14 w-10 rounded-[3px] object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{entry.pt?.printedName ?? entry.name}</div>
                <div className="truncate text-[13px] text-muted">
                  {entry.pt?.printedName ? entry.name : "Só em inglês"}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost px-4 text-sm"
                onClick={() => adicionar([{ entry, qty: 1 }], "pt")}
              >
                Adicionar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Lista() {
  const { adicionar } = useCart();
  const [texto, setTexto] = useState("");
  const [idioma, setIdioma] = useState<"pt" | "en">("pt");
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function importar() {
    const linhas = parseDecklist(texto);
    if (linhas.length === 0) {
      setAviso("Cole pelo menos uma carta, uma por linha.");
      return;
    }
    setCarregando(true);
    setAviso(null);
    try {
      const data = await json<{ entries: CatalogEntry[]; notFound: string[] }>(
        await fetch("/api/cards/collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: linhas.map((l) => l.name) }),
        }),
      );
      // O Scryfall devolve as cartas na ordem pedida, pulando as que não achou.
      const naoAchadas = new Set(data.notFound.map((n) => n.toLowerCase()));
      const achadas = linhas.filter((l) => !naoAchadas.has(l.name.toLowerCase()));
      adicionar(
        data.entries.map((entry, i) => ({ entry, qty: achadas[i]?.qty ?? 1 })),
        idioma,
      );
      setTexto(data.notFound.join("\n"));
      setAviso(
        data.notFound.length
          ? `Não encontrei ${data.notFound.length} ${data.notFound.length === 1 ? "carta" : "cartas"}. Elas ficaram no campo para você corrigir o nome.`
          : `${data.entries.length} ${data.entries.length === 1 ? "carta adicionada" : "cartas adicionadas"}.`,
      );
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className="panel flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 p-5">
      <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
        <span className="text-gold">02</span> Cole sua lista
      </h2>
      <div>
        <label htmlFor="lista" className="label">
          Uma carta por linha, com a quantidade na frente
        </label>
        <textarea
          id="lista"
          rows={6}
          className="field py-3 font-mono text-[13px] leading-relaxed"
          placeholder={"1 Sol Ring\n4 Lightning Bolt\n4 Llanowar Elves"}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>
      <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <legend className="label">Idioma das cartas da lista</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="idioma-lista" checked={idioma === "pt"} onChange={() => setIdioma("pt")} />
          Português, quando existir
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="idioma-lista" checked={idioma === "en"} onChange={() => setIdioma("en")} />
          Inglês
        </label>
      </fieldset>
      <button type="button" className="btn bg-cream text-ink hover:bg-white" disabled={carregando} onClick={importar}>
        {carregando ? "Buscando cartas…" : "Buscar cartas da lista"}
      </button>
      <div aria-live="polite" className="min-h-5 text-sm text-muted">
        {aviso}
      </div>
    </section>
  );
}

function Tile({ item, sit }: { item: CartItem; sit: Situacao }) {
  const { escolherArte, mudarIdioma, mudarQuantidade, remover } = useCart();
  const [artes, setArtes] = useState(false);
  const { print, modo } = sit;
  const emPt = item.lang === "pt";
  const nomePt = modo === "traduzida" ? sit.tr?.nome : modo === "oficial" ? print.printedName : (item.pt?.printedName ?? sit.tr?.nome);
  const ptPossivel = Boolean(item.pt) || sit.podeTraduzir;
  const traduzida = modo === "traduzida";

  return (
    <article className="panel flex min-w-0 flex-col gap-2.5 rounded-[14px] p-3">
      <div className="group relative">
        <CartaPrevia
          url={print.image}
          alt={`Carta ${nomePt && emPt ? nomePt : item.name}`}
          className="aspect-[63/88] w-full rounded-[9px] bg-ink object-cover"
          meta={traduzida ? print.meta : undefined}
          tr={traduzida ? sit.tr : null}
          molde={traduzida ? sit.molde : null}
        />
        {/* a carta inteira abre a troca de arte */}
        <button
          type="button"
          aria-label={`Trocar a arte de ${item.name}`}
          className="absolute inset-0 flex cursor-pointer items-start justify-end rounded-[9px] p-2"
          onClick={() => setArtes(true)}
        >
          <span
            aria-hidden="true"
            className="rounded-full bg-ink/85 px-2.5 py-1 text-[11px] font-bold text-cream opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          >
            Trocar arte
          </span>
        </button>
      </div>
      <div className="min-w-0">
        <div className="truncate font-bold">{emPt && nomePt ? nomePt : item.name}</div>
        <div className="truncate text-[13px] text-muted">{emPt && nomePt ? item.name : (nomePt ?? print.setName)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Seal modo={modo} carregando={sit.carregando} />
        {facesFisicas(print.meta) > 1 && (
          <span className="text-[12px] text-muted" title="Carta de duas faces: o verso é impresso junto, como uma carta a mais na folha">
            + verso
          </span>
        )}
      </div>
      <div role="group" aria-label={`Idioma de ${item.name}`} className="flex overflow-hidden rounded-[10px] border-[1.5px] border-edge">
        <button
          type="button"
          aria-pressed={!emPt}
          className={`min-h-11 flex-1 cursor-pointer text-sm ${!emPt ? "bg-cream font-bold text-ink" : "font-semibold text-muted"}`}
          onClick={() => mudarIdioma(item.oracleId, "en")}
        >
          EN
        </button>
        <button
          type="button"
          aria-pressed={emPt}
          disabled={!ptPossivel && !emPt}
          title={ptPossivel ? undefined : sit.carregando ? "Verificando se existe tradução" : "Esta carta ainda não tem texto em português"}
          className={`min-h-11 flex-1 text-sm ${emPt ? "bg-rust font-bold text-cream" : "font-semibold text-muted"} ${ptPossivel || emPt ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}
          onClick={() => mudarIdioma(item.oracleId, "pt")}
        >
          PT
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <div className="flex items-center gap-1">
          <button type="button" aria-label={`Diminuir ${item.name}`} className="h-11 w-11 cursor-pointer rounded-[10px] border-[1.5px] border-edge text-lg font-bold" onClick={() => (item.qty > 1 ? mudarQuantidade(item.oracleId, item.qty - 1) : remover(item.oracleId))}>
            −
          </button>
          <span className="min-w-7 text-center font-bold" aria-label={`${item.qty} cópias`}>
            {item.qty}
          </span>
          <button type="button" aria-label={`Aumentar ${item.name}`} className="h-11 w-11 cursor-pointer rounded-[10px] border-[1.5px] border-edge text-lg font-bold" onClick={() => mudarQuantidade(item.oracleId, item.qty + 1)}>
            +
          </button>
        </div>
        <button type="button" className="min-h-11 cursor-pointer whitespace-nowrap px-1.5 text-[13px] font-semibold underline" onClick={() => setArtes(true)}>
          Trocar arte
        </button>
      </div>
      {artes && (
        <EscolhaDeArte
          oracleId={item.oracleId}
          nome={item.name}
          atualId={print.id}
          onEscolher={(p) => escolherArte(item.oracleId, p)}
          onClose={() => setArtes(false)}
        />
      )}
    </article>
  );
}

function Resumo({ emPortugues, semPt, versos, tabela, linhas }: { emPortugues: number; semPt: number; versos: number; tabela: Tabela; linhas: Linha[] }) {
  const { quantidade } = useCart();
  const { valores } = tabela;
  const totais = calcularPedido(tabela, quantidade, "retirada", linhas);
  const proxima = proximaFaixa(valores, quantidade);

  return (
    <aside aria-label="Resumo do pedido" className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 rounded-2xl bg-cream p-6 text-ink lg:sticky lg:top-6">
      <h2 className="display text-3xl">Resumo</h2>
      <dl className="flex flex-col gap-2.5">
        {[
          ["Cartas", quantidade],
          ["Em português", emPortugues],
          ["Folhas A4", folhas(quantidade + versos)],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="flex justify-between gap-3">
            <dt>{rotulo}</dt>
            <dd className="font-bold">{valor}</dd>
          </div>
        ))}
      </dl>
      {versos > 0 && (
        <p className="-mt-2 text-[13px] text-paper-muted">
          As folhas incluem {versos} {versos === 1 ? "verso" : "versos"} de cartas de duas faces, que {versos === 1 ? "sai" : "saem"} junto com a frente.
        </p>
      )}
      <div className="flex flex-col gap-2 border-t border-paper-line pt-4">
        <div className="flex justify-between gap-3">
          <span>Preço por carta</span>
          <span className="font-bold">{brl(totais.unitario)}</span>
        </div>
        {proxima && quantidade > 0 && (
          <p className="text-[13px] text-paper-muted">
            Faltam {proxima.faltam} {proxima.faltam === 1 ? "carta" : "cartas"} para pagar {brl(proxima.centavos)} por carta.
          </p>
        )}
      </div>
      <dl className="flex flex-col gap-2.5 border-t border-paper-line pt-4">
        {linhas.length > 0 && (
          <div className="flex justify-between gap-3">
            <dt>Cartas</dt>
            <dd className="font-bold">{brl(totais.subtotal)}</dd>
          </div>
        )}
        <LinhasDeAcessorios linhas={linhas} totais={totais} />
        <div className="flex justify-between gap-3">
          <dt>Subtotal</dt>
          <dd className="font-bold">{brl(totais.total)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Frete</dt>
          <dd className="text-paper-muted">no fechamento</dd>
        </div>
      </dl>
      {quantidade > 0 ? (
        <Link href="/fechar" className="btn btn-dark min-h-14 text-[17px]">
          Fechar pedido
        </Link>
      ) : (
        <p className="rounded-[10px] border border-paper-line p-3 text-sm text-paper-muted">
          {linhas.length > 0
            ? "Os acessórios vão junto com um pedido de cartas. Busque uma carta ou cole sua lista para fechar."
            : "Busque uma carta ou cole sua lista para começar."}
        </p>
      )}
      {semPt > 0 && (
        <p className="text-[13px] text-paper-muted">
          {semPt} {semPt === 1 ? "carta pedida em português ainda não tem" : "cartas pedidas em português ainda não têm"} texto
          em português nesta arte e {semPt === 1 ? "sai" : "saem"} em inglês.
        </p>
      )}
      {quantidade > valores.maxCartasPorPedido && (
        <p className="text-[13px] font-semibold text-rust">
          O limite é de {valores.maxCartasPorPedido} cartas por pedido.
        </p>
      )}
    </aside>
  );
}

export function Montador({ tabela }: { tabela: Tabela }) {
  const { itens, pronto, quantidade, acessorios, tudoEmPortugues, limpar } = useCart();
  const linhas = linhasDe(acessorios, tabela.produtos);
  const { situacao, emPortugues } = useSituacoes(itens);
  const semPt = itens.filter((i) => situacao(i).modo === "indisponivel" && !situacao(i).carregando).length;
  // o verso das cartas de duas faces ocupa uma vaga na folha, mas não entra na conta de cartas pedidas
  const versos = itens.reduce((n, i) => n + i.qty * (facesFisicas(situacao(i).print.meta) - 1), 0);

  return (
    <>
      <div className="flex flex-wrap gap-5">
        <Busca />
        <Lista />
      </div>

      <div className="flex flex-wrap items-start gap-7">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
        <section aria-label="Cartas do pedido" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3.5">
            <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">
              Cartas do pedido <span className="text-muted">{pronto ? quantidade : ""}</span>
            </h2>
            {itens.length > 0 && (
              <div className="flex flex-wrap gap-2.5">
                <button type="button" className="btn border-[1.5px] border-gold px-4 text-sm text-gold hover:bg-gold hover:text-ink" onClick={tudoEmPortugues}>
                  Tudo em português
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-4 text-sm"
                  onClick={() => {
                    if (window.confirm("Esvaziar o pedido?")) limpar();
                  }}
                >
                  Esvaziar
                </button>
              </div>
            )}
          </div>
          {pronto && itens.length === 0 && (
            <p className="panel p-8 text-center text-muted">Seu pedido está vazio.</p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-3.5">
            {itens.map((item) => (
              <Tile key={item.oracleId} item={item} sit={situacao(item)} />
            ))}
          </div>
        </section>
        <Acessorios tabela={tabela} linhas={linhas} />
        </div>
        <Resumo emPortugues={emPortugues} semPt={semPt} versos={versos} tabela={tabela} linhas={linhas} />
      </div>
    </>
  );
}
