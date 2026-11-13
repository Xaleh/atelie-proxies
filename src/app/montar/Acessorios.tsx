"use client";

import { COMBOS, NOME_DO_TIPO, ROTULO_DO_COMBO, TIPOS, comboDoPedido, descontoPorExtenso, type Linha } from "@/lib/acessorios";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import type { Tabela } from "@/lib/pricing";

/** Sleeves e deckbox para levar junto com as cartas. Some da loja se não houver nenhum disponível. */
export function Acessorios({ tabela, linhas }: { tabela: Tabela; linhas: Linha[] }) {
  const { acessorios, mudarAcessorio, quantidade } = useCart();
  if (!tabela.produtos.length) return null;
  const formado = comboDoPedido(quantidade, linhas);
  const combos = COMBOS.filter((c) => tabela.combos[c].valor > 0);
  // só anuncia combo que dá para montar com o que está disponível
  const tem = (tipo: "sleeve" | "deckbox") => tabela.produtos.some((p) => p.tipo === tipo);
  const possiveis = combos.filter((c) => (c === "sleeves" ? tem("sleeve") : c === "deckbox" ? tem("deckbox") : tem("sleeve") && tem("deckbox")));

  return (
    <section aria-labelledby="titulo-acessorios" className="flex flex-col gap-4">
      <h2 id="titulo-acessorios" className="font-display text-[28px] font-bold uppercase tracking-wide">
        Acessórios
      </h2>
      {possiveis.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Descontos de combo">
          {possiveis.map((c) => (
            <li
              key={c}
              className={`rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-semibold ${formado === c ? "border-gold bg-gold text-ink" : "border-edge text-muted"}`}
            >
              {ROTULO_DO_COMBO[c]}: {descontoPorExtenso(tabela.combos[c])} de desconto{formado === c ? " · aplicado" : ""}
            </li>
          ))}
        </ul>
      )}
      {TIPOS.map((tipo) => {
        const produtos = tabela.produtos.filter((p) => p.tipo === tipo);
        if (!produtos.length) return null;
        return (
          <div key={tipo} className="flex flex-col gap-2.5">
            <h3 className="text-[15px] font-bold uppercase tracking-[0.08em] text-muted">{NOME_DO_TIPO[tipo].varios}</h3>
            <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
              {produtos.map((p) => {
                const qty = acessorios.find((e) => e.id === p.id)?.qty ?? 0;
                return (
                  <li key={p.id} className={`panel flex flex-col gap-3 rounded-[14px] p-4 ${qty ? "border-gold" : ""}`}>
                    <div className="min-w-0">
                      <div className="font-bold">{p.nome}</div>
                      {p.descricao && <div className="text-[13px] text-muted">{p.descricao}</div>}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3">
                      <span className="font-display text-2xl font-bold text-gold">{brl(p.centavos)}</span>
                      {qty === 0 ? (
                        <button type="button" className="btn btn-ghost px-4 text-sm" aria-label={`Adicionar ${p.nome}`} onClick={() => mudarAcessorio(p.id, 1)}>
                          Adicionar
                        </button>
                      ) : (
                        <div role="group" aria-label={`Quantidade de ${p.nome}`} className="flex items-center gap-2.5">
                          <button
                            type="button"
                            aria-label={qty === 1 ? `Tirar ${p.nome}` : `Diminuir ${p.nome}`}
                            className="h-11 w-11 cursor-pointer rounded-[10px] border-[1.5px] border-edge text-lg font-bold"
                            onClick={() => mudarAcessorio(p.id, qty - 1)}
                          >
                            −
                          </button>
                          <span className="min-w-6 text-center font-bold" aria-live="polite">
                            {qty}
                          </span>
                          <button
                            type="button"
                            aria-label={`Aumentar ${p.nome}`}
                            className="h-11 w-11 cursor-pointer rounded-[10px] border-[1.5px] border-edge text-lg font-bold"
                            onClick={() => mudarAcessorio(p.id, qty + 1)}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
