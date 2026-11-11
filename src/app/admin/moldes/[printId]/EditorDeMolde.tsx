"use client";

import { useMemo, useRef, useState } from "react";
import { CartaPrevia } from "@/components/CartaPrevia";
import type { DetalheDeImpressao } from "@/lib/print/lote";
import { esquecerTraducoes, useTraducoes } from "@/lib/traducao/cliente";
import { aceitaMoldeAutomatico, type Molde, type MoldeManual, type Ret } from "@/lib/traducao/tipos";

type Campo = "nome" | "tipo" | "texto";
const CAMPOS: Array<[Campo, string]> = [
  ["nome", "Nome"],
  ["tipo", "Linha de tipo"],
  ["texto", "Caixa de texto"],
];
const COR: Record<Campo, string> = { nome: "#d99f59", tipo: "#5fb3c9", texto: "#e8b97d" };

// Começa nas posições da moldura padrão, que o Augusto só precisa ajustar.
const PADRAO: MoldeManual = {
  modo: "manual",
  nome: { x: 0.072, y: 0.053, w: 0.86, h: 0.046 },
  tipo: { x: 0.072, y: 0.567, w: 0.784, h: 0.046 },
  texto: { x: 0.07, y: 0.629, w: 0.851, h: 0.295 },
  fundo: "cor",
  corTexto: "auto",
};

const EXEMPLO = {
  nome: "Nome da Carta",
  tipo: "Criatura — Elfo Druida",
  texto: "{T}: Adicione {G}.\nQuando esta criatura entrar, compre um card.",
  sabor: "",
};

const limitar = (n: number) => Math.max(0, Math.min(1, n));

export function EditorDeMolde({ detalhe, face, inicial }: { detalhe: DetalheDeImpressao; face: number; inicial: Molde | null }) {
  const [modo, setModo] = useState<"auto" | "manual" | "bloqueado">(inicial?.modo ?? "auto");
  const [manual, setManual] = useState<MoldeManual>(inicial?.modo === "manual" ? inicial : PADRAO);
  const [ativo, setAtivo] = useState<Campo>("texto");
  const [status, setStatus] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);

  const imagem = detalhe.faces[face].normal;
  const meta = detalhe.meta;
  const nomeEn = meta?.faces[face]?.nome ?? detalhe.faces[face].nome;
  const pedidos = useMemo(
    () =>
      detalhe.oracleId
        ? [{ oracleId: detalhe.oracleId, nome: nomeEn, set: detalhe.set, num: detalhe.collectorNumber, printId: detalhe.id, face }]
        : [],
    [detalhe, nomeEn, face],
  );
  const t = useTraducoes(pedidos);
  const tr = t.textoPara(nomeEn, detalhe.set, detalhe.collectorNumber) ?? EXEMPLO;
  const automaticoServe = aceitaMoldeAutomatico(meta);
  const moldeDaPrevia = modo === "manual" ? manual : modo === "auto" && automaticoServe ? "auto" : null;

  const rect = manual[ativo];
  const mudarRet = (campo: Campo, r: Ret | null) => setManual((m) => ({ ...m, [campo]: r }));

  function pontoNaArte(e: React.PointerEvent) {
    const b = area.current!.getBoundingClientRect();
    return { x: limitar((e.clientX - b.left) / b.width), y: limitar((e.clientY - b.top) / b.height) };
  }

  async function salvar() {
    setGravando(true);
    setStatus(null);
    try {
      const corpo =
        modo === "auto"
          ? { acao: "remover", printId: detalhe.id, face }
          : { acao: "salvar", printId: detalhe.id, face, molde: modo === "manual" ? manual : { modo: "bloqueado" } };
      const res = await fetch("/api/admin/moldes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const r = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(r.error ?? "Não consegui gravar.");
      esquecerTraducoes();
      setStatus("Molde salvo. Recarregue a loja ou a produção para ver a mudança.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setGravando(false);
    }
  }

  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
        <fieldset className="panel flex flex-col gap-2 p-5">
          <legend className="sr-only">Como esta arte recebe o texto em português</legend>
          {(
            [
              ["auto", "Automático", automaticoServe ? "Usa a moldura padrão." : "Esta moldura não é a padrão: sem molde, a arte não recebe tradução."],
              ["manual", "Molde manual", "Você marca os retângulos abaixo."],
              ["bloqueado", "Não traduzir esta arte", "A arte sai sempre em inglês; a loja não oferece PT nela."],
            ] as const
          ).map(([valor, rotulo, ajuda]) => (
            <label key={valor} className={`flex cursor-pointer items-start gap-3 rounded-[10px] border-[1.5px] p-3 ${modo === valor ? "border-gold" : "border-edge"}`}>
              <input type="radio" name="modo" className="mt-1" checked={modo === valor} onChange={() => setModo(valor)} />
              <span>
                <strong>{rotulo}</strong>
                <span className="block text-muted">{ajuda}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {modo === "manual" && (
          <div className="panel flex flex-col gap-4 p-5">
            <p className="text-muted">Escolha o campo e arraste sobre a arte para marcar onde ele fica.</p>
            <div role="group" aria-label="Campo" className="flex flex-wrap gap-2">
              {CAMPOS.map(([c, rotulo]) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={ativo === c}
                  className={`btn px-4 text-sm ${ativo === c ? "bg-cream text-ink" : "btn-ghost"}`}
                  onClick={() => setAtivo(c)}
                >
                  <span aria-hidden="true" className="mr-2 inline-block h-3 w-3 rounded-sm" style={{ background: COR[c] }} />
                  {rotulo}
                </button>
              ))}
            </div>
            <div
              ref={area}
              className="relative w-full max-w-[380px] cursor-crosshair touch-none select-none"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                inicio.current = pontoNaArte(e);
              }}
              onPointerMove={(e) => {
                if (!inicio.current) return;
                const p = pontoNaArte(e), a = inicio.current;
                const r = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) };
                if (r.w > 0.01 && r.h > 0.01) mudarRet(ativo, r);
              }}
              onPointerUp={() => (inicio.current = null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagem} alt={`Arte de ${nomeEn}`} draggable={false} className="aspect-[63/88] w-full rounded-lg bg-ink object-cover" />
              {CAMPOS.map(([c, rotulo]) => {
                const r = manual[c];
                return r ? (
                  <div
                    key={c}
                    aria-hidden="true"
                    className="pointer-events-none absolute"
                    style={{
                      left: pct(r.x),
                      top: pct(r.y),
                      width: pct(r.w),
                      height: pct(r.h),
                      border: `2px solid ${COR[c]}`,
                      background: ativo === c ? `${COR[c]}33` : "transparent",
                    }}
                  >
                    <span className="absolute -top-5 left-0 rounded px-1 text-[10px] font-bold text-ink" style={{ background: COR[c] }}>
                      {rotulo}
                    </span>
                  </div>
                ) : null;
              })}
            </div>

            <label className="flex min-h-11 items-center gap-2.5">
              <input type="checkbox" checked={rect !== null} onChange={(e) => mudarRet(ativo, e.target.checked ? (PADRAO[ativo] as Ret) : null)} />
              Substituir {CAMPOS.find(([c]) => c === ativo)?.[1].toLowerCase()} nesta arte
            </label>
            {ativo === "nome" && (
              <p className="text-muted">Desmarque quando o nome faz parte do desenho: ele continua em inglês.</p>
            )}
            {rect && (
              <div className="grid grid-cols-4 gap-2">
                {(["x", "y", "w", "h"] as const).map((k) => (
                  <div key={k}>
                    <label htmlFor={`ret-${k}`} className="label">
                      {{ x: "Esquerda", y: "Topo", w: "Largura", h: "Altura" }[k]} (%)
                    </label>
                    <input
                      id={`ret-${k}`}
                      type="number"
                      step={0.1}
                      min={0}
                      max={100}
                      className="field min-h-11 px-2"
                      value={+(rect[k] * 100).toFixed(1)}
                      onChange={(e) => {
                        const v = limitar((parseFloat(e.target.value) || 0) / 100);
                        const novo = { ...rect, [k]: v };
                        if (novo.x + novo.w > 1) novo.w = 1 - novo.x;
                        if (novo.y + novo.h > 1) novo.h = 1 - novo.y;
                        if (novo.w >= 0.01 && novo.h >= 0.01) mudarRet(ativo, novo);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2.5">
              <div className="min-w-0 flex-1">
                <label htmlFor="fundo" className="label">
                  Fundo do texto
                </label>
                <select id="fundo" className="field min-h-11" value={manual.fundo} onChange={(e) => setManual((m) => ({ ...m, fundo: e.target.value as MoldeManual["fundo"] }))}>
                  <option value="cor">Cor da própria caixa</option>
                  <option value="desfoque">Arte desfocada e escurecida</option>
                </select>
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor="cor-texto" className="label">
                  Cor das letras
                </label>
                <select id="cor-texto" className="field min-h-11" value={manual.corTexto} onChange={(e) => setManual((m) => ({ ...m, corTexto: e.target.value as MoldeManual["corTexto"] }))}>
                  <option value="auto">Automática</option>
                  <option value="escuro">Escuras</option>
                  <option value="claro">Claras</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-gold" disabled={gravando} onClick={salvar}>
            Salvar molde
          </button>
          <p role="status" className="text-muted">
            {status}
          </p>
        </div>
      </section>

      <aside className="flex w-[300px] max-w-full flex-col gap-2">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Prévia</h2>
        <CartaPrevia
          url={imagem}
          alt="Prévia da carta com o texto em português"
          className="aspect-[63/88] w-full rounded-lg bg-ink object-cover"
          meta={meta}
          face={face}
          tr={moldeDaPrevia ? tr : null}
          molde={moldeDaPrevia}
        />
        <p className="text-xs text-muted">
          {!moldeDaPrevia
            ? "Sem molde: a carta sai em inglês."
            : tr === EXEMPLO
              ? "Esta carta ainda não tem tradução; a prévia usa um texto de exemplo."
              : "Prévia com a tradução atual da carta."}
        </p>
      </aside>
    </div>
  );
}
