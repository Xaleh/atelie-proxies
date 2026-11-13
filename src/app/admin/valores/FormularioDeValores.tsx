"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { brl } from "@/lib/format";
import { calcularTotais } from "@/lib/pricing";
import { LIMITES, centavosDe, reaisDe, valoresSchema, type Valores } from "@/lib/valores";

type Linha = { id: number; aPartirDe: string; reais: string };

const paraLinhas = (v: Valores): Linha[] => v.faixasDePreco.map((f, i) => ({ id: i, aPartirDe: String(f.aPartirDe), reais: reaisDe(f.centavos) }));
const inteiro = (texto: string) => (/^\d+$/.test(texto.trim()) ? Number(texto.trim()) : null);

/** Lê o formulário. Devolve os valores prontos para salvar ou o primeiro problema encontrado. */
function ler(linhas: Linha[], frete: string, limite: string): { valores: Valores } | { erro: string } {
  const faixas = [];
  for (const [i, l] of linhas.entries()) {
    const aPartirDe = inteiro(l.aPartirDe), centavos = centavosDe(l.reais);
    if (aPartirDe == null) return { erro: `Faixa ${i + 1}: informe a quantidade de cartas em números.` };
    if (centavos == null) return { erro: `Faixa ${i + 1}: informe o preço em reais, como 3,50.` };
    faixas.push({ aPartirDe, centavos });
  }
  const freteFixoCentavos = centavosDe(frete);
  if (freteFixoCentavos == null) return { erro: "Informe o frete em reais, como 20,00. Para frete grátis, use 0." };
  const maxCartasPorPedido = inteiro(limite);
  if (maxCartasPorPedido == null) return { erro: "Informe o limite de cartas por pedido em números." };
  const lido = valoresSchema.safeParse({ faixasDePreco: faixas, freteFixoCentavos, maxCartasPorPedido });
  if (!lido.success) {
    const problema = lido.error.issues[0];
    const campo = String(problema.path[0]);
    if (problema.code === "custom") return { erro: problema.message + "." };
    if (campo === "freteFixoCentavos") return { erro: `O frete pode ir de R$ 0,00 a ${brl(LIMITES.centavos)}.` };
    if (campo === "maxCartasPorPedido") return { erro: `O limite de cartas por pedido pode ir de 1 a ${LIMITES.cartasPorPedido}.` };
    return { erro: `O preço por carta pode ir de R$ 0,01 a ${brl(LIMITES.centavos)}, e a quantidade de 1 a ${LIMITES.cartasPorPedido}.` };
  }
  return { valores: lido.data };
}

export function FormularioDeValores({ iniciais, salvoEm, podeSalvar }: { iniciais: Valores; salvoEm: string | null; podeSalvar: boolean }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Linha[]>(() => paraLinhas(iniciais));
  const [frete, setFrete] = useState(reaisDe(iniciais.freteFixoCentavos));
  const [limite, setLimite] = useState(String(iniciais.maxCartasPorPedido));
  const [proximoId, setProximoId] = useState(iniciais.faixasDePreco.length);
  const [gravando, setGravando] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; texto: string } | null>(null);

  const lido = ler(linhas, frete, limite);
  const valores = "valores" in lido ? lido.valores : null;
  // preço que sobe com a quantidade costuma ser erro de digitação
  const sobe = valores?.faixasDePreco.find((f, i, todas) => i > 0 && f.centavos > todas[i - 1].centavos);
  const mudou = !valores || JSON.stringify(valores) !== JSON.stringify(iniciais);
  const mudar = (id: number, campo: "aPartirDe" | "reais", v: string) => {
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: v } : l)));
    setStatus(null);
  };

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!valores) {
      setStatus({ ok: false, texto: "erro" in lido ? lido.erro : "Confira os valores." });
      return;
    }
    setGravando(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/valores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valores),
      });
      const r = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(r.error ?? "Não consegui gravar.");
      setStatus({ ok: true, texto: "Valores salvos. Já valem para os próximos pedidos." });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, texto: (err as Error).message });
    } finally {
      setGravando(false);
    }
  }

  const exemplos = valores ? [...new Set([1, ...valores.faixasDePreco.map((f) => f.aPartirDe), 100])].filter((q) => q <= valores.maxCartasPorPedido).sort((a, b) => a - b) : [];

  return (
    <form onSubmit={salvar} noValidate className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-6">
        <section className="panel flex flex-col gap-4 p-6">
          <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">Preço por carta</h2>
          <p className="text-muted">
            O preço depende do total de cartas do pedido. Cada faixa vale da quantidade indicada até a faixa seguinte.
          </p>
          <ul className="flex flex-col gap-3">
            {linhas.map((l, i) => (
              <li key={l.id} className="flex flex-wrap items-end gap-3">
                <div className="w-[150px]">
                  <label htmlFor={`faixa-${l.id}-qtd`} className="label">
                    A partir de (cartas)
                  </label>
                  <input
                    id={`faixa-${l.id}-qtd`}
                    inputMode="numeric"
                    className="field disabled:opacity-60"
                    value={l.aPartirDe}
                    disabled={i === 0}
                    title={i === 0 ? "A primeira faixa sempre começa em 1 carta" : undefined}
                    onChange={(e) => mudar(l.id, "aPartirDe", e.target.value)}
                  />
                </div>
                <div className="w-[170px]">
                  <label htmlFor={`faixa-${l.id}-preco`} className="label">
                    Preço por carta (R$)
                  </label>
                  <input id={`faixa-${l.id}-preco`} inputMode="decimal" className="field" value={l.reais} onChange={(e) => mudar(l.id, "reais", e.target.value)} />
                </div>
                {i > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost px-4 text-sm"
                    aria-label={`Remover a faixa a partir de ${l.aPartirDe || "?"} cartas`}
                    onClick={() => {
                      setLinhas((ls) => ls.filter((o) => o.id !== l.id));
                      setStatus(null);
                    }}
                  >
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
          {linhas.length < LIMITES.faixas && (
            <button
              type="button"
              className="btn btn-ghost self-start px-4 text-sm"
              onClick={() => {
                const ultima = linhas[linhas.length - 1];
                setLinhas([...linhas, { id: proximoId, aPartirDe: String((inteiro(ultima.aPartirDe) ?? 0) + 20), reais: ultima.reais }]);
                setProximoId(proximoId + 1);
                setStatus(null);
              }}
            >
              Adicionar faixa
            </button>
          )}
          {sobe && (
            <p className="font-semibold text-gold-soft">
              Atenção: a partir de {sobe.aPartirDe} cartas o preço por carta sobe para {brl(sobe.centavos)}. Confira se é isso mesmo.
            </p>
          )}
        </section>

        <section className="panel flex flex-col gap-4 p-6">
          <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">Envio e limite</h2>
          <div className="flex flex-wrap gap-4">
            <div className="w-[220px] max-w-full">
              <label htmlFor="frete" className="label">
                Frete do envio (R$)
              </label>
              <input
                id="frete"
                inputMode="decimal"
                className="field"
                value={frete}
                aria-describedby="frete-ajuda"
                onChange={(e) => {
                  setFrete(e.target.value);
                  setStatus(null);
                }}
              />
              <p id="frete-ajuda" className="mt-1.5 text-[13px] text-muted">
                Valor único por pedido. Retirada não paga frete.
              </p>
            </div>
            <div className="w-[220px] max-w-full">
              <label htmlFor="limite" className="label">
                Limite de cartas por pedido
              </label>
              <input
                id="limite"
                inputMode="numeric"
                className="field"
                value={limite}
                onChange={(e) => {
                  setLimite(e.target.value);
                  setStatus(null);
                }}
              />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className="btn btn-gold" disabled={gravando || !podeSalvar}>
            Salvar valores
          </button>
          <p role="status" className={status?.ok === false ? "font-semibold text-gold-soft" : "text-muted"}>
            {status?.texto ??
              (mudou
                ? "Há mudanças que ainda não foram salvas."
                : salvoEm
                  ? `Última alteração: ${salvoEm}.`
                  : "Ainda valem os valores iniciais do site.")}
          </p>
        </div>
      </div>

      <aside className="panel flex min-w-0 flex-[1_1_320px] flex-col gap-3 p-6" aria-label="Como fica para a cliente">
        <h2 className="text-[15px] font-bold">Como fica para a cliente</h2>
        {valores ? (
          <table className="w-full text-left">
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Cartas
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Por carta
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Retirada
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Com envio
                </th>
              </tr>
            </thead>
            <tbody>
              {exemplos.map((q) => {
                const retirada = calcularTotais(valores, q, "retirada"), envio = calcularTotais(valores, q, "envio");
                return (
                  <tr key={q} className="border-t border-line">
                    <td className="py-2 pr-3">{q}</td>
                    <td className="py-2 pr-3">{brl(retirada.unitario)}</td>
                    <td className="py-2 pr-3">{brl(retirada.total)}</td>
                    <td className="py-2 pr-3">{brl(envio.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="font-semibold text-gold-soft">{"erro" in lido ? lido.erro : ""}</p>
        )}
        <p className="text-[13px] text-muted">A tabela usa o que está nos campos, mesmo antes de salvar.</p>
      </aside>
    </form>
  );
}
