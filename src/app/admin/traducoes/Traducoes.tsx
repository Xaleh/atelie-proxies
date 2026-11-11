"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CartaPrevia } from "@/components/CartaPrevia";
import { esquecerTraducoes, useTraducoes } from "@/lib/traducao/cliente";
import { ROTULO_DA_FONTE, type MetaDeFace, type Traducao } from "@/lib/traducao/tipos";
import type { CatalogEntry } from "@/lib/types";

type Arquivo = {
  cartas?: Record<string, { nome?: string; tipo?: string; texto?: string }>;
  sabores?: Record<string, string>;
};

export function ImportarArena({ ultimaImportacao }: { ultimaImportacao: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function importar(arquivo: File) {
    setEnviando(true);
    setStatus("Lendo o arquivo…");
    try {
      let dados: Arquivo;
      try {
        dados = JSON.parse(await arquivo.text()) as Arquivo;
      } catch {
        throw new Error("O arquivo não é um JSON válido. Use o traducoes-arena.json gerado pelo agente do Arena.");
      }
      if (!dados.cartas || typeof dados.cartas !== "object") {
        throw new Error("Não achei a lista de cartas. Use o traducoes-arena.json (não o glossario-arena.json).");
      }
      const cartas = Object.entries(dados.cartas)
        .filter(([en, c]) => en.trim() && c?.nome?.trim())
        .map(([en, c]) => [en.slice(0, 200), String(c.nome).slice(0, 200), String(c.tipo ?? "").slice(0, 300), String(c.texto ?? "").slice(0, 4000)] as const);
      const sabores = Object.entries(dados.sabores ?? {})
        .filter(([k, v]) => k.trim() && typeof v === "string" && v.trim())
        .map(([k, v]) => [k.slice(0, 260), v.slice(0, 1000)] as const);
      if (cartas.length < 100) throw new Error(`O arquivo tem só ${cartas.length} cartas. Confira se o agente do Arena rodou até o fim.`);

      const partes: Array<{ cartas: typeof cartas; sabores: typeof sabores }> = [];
      for (let i = 0; i < cartas.length; i += 1000) partes.push({ cartas: cartas.slice(i, i + 1000), sabores: [] });
      for (let i = 0; i < sabores.length; i += 2000) partes.push({ cartas: [], sabores: sabores.slice(i, i + 2000) });

      for (let i = 0; i < partes.length; i++) {
        setStatus(`Enviando parte ${i + 1} de ${partes.length}…`);
        const res = await fetch("/api/admin/traducoes/arena", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limpar: i === 0, ...partes[i] }),
        });
        const r = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(`${r.error ?? "Falha ao enviar."} A importação parou na parte ${i + 1}; envie o arquivo de novo.`);
      }
      esquecerTraducoes();
      setStatus(`Pronto: ${cartas.length.toLocaleString("pt-BR")} cartas e ${sabores.length.toLocaleString("pt-BR")} ambientações importadas.`);
      router.refresh();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="panel flex flex-col gap-3 p-5">
      <h2 className="text-[15px] font-bold">Importar do MTG Arena</h2>
      <p className="text-muted">
        Envie o <span className="font-mono">traducoes-arena.json</span> gerado pelo agente do Arena (
        <span className="font-mono">python arena_extrair.py --sem-enviar</span>). A importação substitui a anterior;
        as revisões do ateliê continuam valendo.
      </p>
      {ultimaImportacao && <p className="text-muted">Última importação: {ultimaImportacao}.</p>}
      <label className="btn btn-ghost cursor-pointer self-start">
        {enviando ? "Importando…" : "Escolher arquivo"}
        <input
          type="file"
          accept=".json,application/json"
          className="sr-only"
          disabled={enviando}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importar(f);
          }}
        />
      </label>
      <p role="status" className="min-h-5 text-muted">
        {status}
      </p>
    </div>
  );
}

type Campos = { nome: string; tipo: string; texto: string; sabor: string };

function FormularioDaFace({
  entry,
  face,
  info,
  atual,
  carregando,
  molde,
}: {
  entry: CatalogEntry;
  face: number;
  info: MetaDeFace;
  atual: Traducao | null;
  carregando: boolean;
  molde: ReturnType<ReturnType<typeof useTraducoes>["moldeQueVale"]>;
}) {
  const vazio: Campos = { nome: "", tipo: "", texto: "", sabor: "" };
  const deAtual = (t: Traducao | null): Campos => (t ? { nome: t.nome, tipo: t.tipo, texto: t.texto, sabor: t.sabor } : vazio);
  const [campos, setCampos] = useState<{ base: string; valores: Campos }>({ base: JSON.stringify(atual), valores: deAtual(atual) });
  const [status, setStatus] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  // Quando a tradução chega do servidor (ou muda depois de salvar), o formulário acompanha.
  const base = JSON.stringify(atual);
  const valores = campos.base === base ? campos.valores : deAtual(atual);
  const mudar = (k: keyof Campos, v: string) => setCampos({ base, valores: { ...valores, [k]: v } });

  async function enviar(acao: "salvar" | "remover") {
    setGravando(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/traducoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(acao === "salvar" ? { acao, nomeEn: info.nome, traducao: valores } : { acao, nomeEn: info.nome }),
      });
      const r = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(r.error ?? "Não consegui gravar.");
      esquecerTraducoes();
      setStatus(acao === "salvar" ? "Revisão salva. Vale para todos os pedidos daqui em diante." : "Revisão removida.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setGravando(false);
    }
  }

  const id = (c: string) => `${c}-${face}`;
  return (
    <div className="panel flex flex-wrap items-start gap-5 p-5">
      <div className="flex min-w-0 flex-[999_1_360px] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold">{info.nome}</h3>
          <span className="text-xs text-muted">
            {carregando ? "Buscando tradução…" : atual ? `Agora: ${ROTULO_DA_FONTE[atual.fonte]}` : "Ainda sem tradução"}
          </span>
        </div>
        <div className="rounded-[10px] border border-line p-3 text-muted">
          <div className="text-xs font-bold uppercase tracking-wider">Original em inglês</div>
          <div className="mt-1 text-cream">{info.tipo}</div>
          <p className="mt-1 whitespace-pre-line">{info.texto || "Sem texto de regras."}</p>
        </div>
        <div>
          <label htmlFor={id("nome")} className="label">
            Nome
          </label>
          <input id={id("nome")} className="field min-h-11" value={valores.nome} onChange={(e) => mudar("nome", e.target.value)} />
        </div>
        <div>
          <label htmlFor={id("tipo")} className="label">
            Linha de tipo
          </label>
          <input id={id("tipo")} className="field min-h-11" value={valores.tipo} onChange={(e) => mudar("tipo", e.target.value)} />
        </div>
        <div>
          <label htmlFor={id("texto")} className="label">
            Texto de regras (uma habilidade por linha; símbolos como {"{T}"} e {"{G}"})
          </label>
          <textarea id={id("texto")} rows={6} className="field py-3" value={valores.texto} onChange={(e) => mudar("texto", e.target.value)} />
        </div>
        <div>
          <label htmlFor={id("sabor")} className="label">
            Ambientação (só aparece em artes que têm ambientação)
          </label>
          <textarea id={id("sabor")} rows={2} className="field py-3" value={valores.sabor} onChange={(e) => mudar("sabor", e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className="btn btn-gold" disabled={gravando || !valores.nome.trim()} onClick={() => enviar("salvar")}>
            Salvar revisão
          </button>
          {atual?.fonte === "manual" && (
            <button type="button" className="btn btn-ghost" disabled={gravando} onClick={() => enviar("remover")}>
              Remover revisão
            </button>
          )}
        </div>
        <p role="status" className="min-h-5 text-muted">
          {status}
        </p>
      </div>
      {face === 0 && (
        <div className="flex w-[230px] max-w-full flex-col gap-2">
          <CartaPrevia
            url={entry.en.image}
            alt={`Prévia de ${valores.nome || info.nome}`}
            className="aspect-[63/88] w-full rounded-lg bg-ink object-cover"
            meta={entry.en.meta}
            tr={valores.nome ? valores : null}
            molde={molde}
          />
          <p className="text-xs text-muted">
            {molde ? `Prévia na arte de ${entry.en.setName}.` : "Esta arte não tem molde: a prévia mostra a carta original."}
          </p>
          <Link href={`/admin/moldes/${entry.en.id}?face=0`} target="_blank" className="py-2 text-xs font-semibold underline hover:text-gold-soft">
            Marcar o molde desta arte
          </Link>
        </div>
      )}
    </div>
  );
}

function CartaEmRevisao({ entry }: { entry: CatalogEntry }) {
  const faces: MetaDeFace[] = useMemo(
    () => entry.en.meta?.faces ?? [{ nome: entry.name, tipo: "", texto: "", sabor: false, mana: "", temPT: false }],
    [entry],
  );
  const pedidos = useMemo(
    () =>
      faces.map((f, i) => ({
        oracleId: entry.oracleId,
        nome: f.nome,
        set: entry.en.set,
        num: entry.en.collectorNumber,
        printId: entry.en.id,
        face: i,
      })),
    [faces, entry],
  );
  const t = useTraducoes(pedidos);
  return (
    <div className="flex flex-col gap-4">
      {faces.map((f, i) => (
        <FormularioDaFace
          key={`${entry.oracleId}-${i}`}
          entry={entry}
          face={i}
          info={f}
          atual={t.traducao(f.nome) ?? null}
          carregando={t.traducao(f.nome) === undefined}
          molde={t.moldeQueVale(entry.en.id, i, entry.en.meta)}
        />
      ))}
    </div>
  );
}

export function EditorDeTraducao({ nomeInicial }: { nomeInicial: string }) {
  const [termo, setTermo] = useState(nomeInicial);
  const [resultados, setResultados] = useState<CatalogEntry[]>([]);
  const [escolhida, setEscolhida] = useState<CatalogEntry | null>(null);
  const [estado, setEstado] = useState("");

  useEffect(() => {
    const q = termo.trim();
    if (q.length < 2) return;
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      setEstado("Buscando…");
      try {
        const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`, { signal: controle.signal });
        const data = (await res.json()) as { entries?: CatalogEntry[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "A busca falhou.");
        const lista = data.entries ?? [];
        setResultados(lista);
        setEstado(lista.length ? "" : "Nenhuma carta com esse nome.");
        // Vindo de um link com o nome exato, abre a carta direto.
        const exata = lista.find((e) => e.name.toLowerCase() === q.toLowerCase() || e.en.meta?.faces.some((f) => f.nome.toLowerCase() === q.toLowerCase()));
        if (exata && q === nomeInicial.trim()) setEscolhida(exata);
      } catch (e) {
        if (!controle.signal.aborted) setEstado((e as Error).message);
      }
    }, 350);
    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [termo, nomeInicial]);

  return (
    <div className="flex flex-col gap-4">
      <div className="panel flex flex-col gap-3 p-5">
        <label htmlFor="busca-traducao" className="label">
          Nome da carta, em inglês ou em português
        </label>
        <input id="busca-traducao" type="search" autoComplete="off" className="field" value={termo} onChange={(e) => setTermo(e.target.value)} />
        <div aria-live="polite" className="min-h-5 text-muted">
          {estado}
        </div>
        {termo.trim().length >= 2 && resultados.length > 0 && (
          <ul className="flex max-h-56 flex-col overflow-y-auto rounded-[10px] border border-line">
            {resultados.map((e) => (
              <li key={e.oracleId} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  aria-pressed={escolhida?.oracleId === e.oracleId}
                  className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-3 text-left ${escolhida?.oracleId === e.oracleId ? "bg-surface-2" : "hover:bg-surface-2"}`}
                  onClick={() => setEscolhida(e)}
                >
                  <span className="truncate font-semibold">{e.name}</span>
                  {e.pt?.printedName && <span className="truncate text-muted">{e.pt.printedName}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {escolhida && <CartaEmRevisao key={escolhida.oracleId} entry={escolhida} />}
    </div>
  );
}
