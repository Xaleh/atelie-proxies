"use client";

import { useState } from "react";
import {
  COMBOS,
  LIMITES_DE_ACESSORIOS,
  NOME_DO_TIPO,
  ROTULO_DO_COMBO,
  TIPOS,
  acessoriosParaSalvarSchema,
  percentualDe,
  type Combo,
  type Combos,
  type Linha,
  type Produto,
  type ProdutoParaSalvar,
  type Tipo,
} from "@/lib/acessorios";
import { brl } from "@/lib/format";
import { calcularPedido } from "@/lib/pricing";
import { centavosDe, reaisDe, type Valores } from "@/lib/valores";

type LinhaDoForm = { chave: number; id?: number; tipo: Tipo; nome: string; descricao: string; reais: string; disponivel: boolean };
type ComboDoForm = { tipo: "percentual" | "fixo"; texto: string };
type Dados = { produtos: ProdutoParaSalvar[]; combos: Combos };

const paraLinhas = (produtos: Produto[]): LinhaDoForm[] =>
  produtos.map((p, i) => ({ chave: i, id: p.id, tipo: p.tipo, nome: p.nome, descricao: p.descricao, reais: reaisDe(p.centavos), disponivel: p.disponivel }));
const paraCombos = (combos: Combos): Record<Combo, ComboDoForm> =>
  Object.fromEntries(
    COMBOS.map((c) => [
      c,
      { tipo: combos[c].tipo, texto: combos[c].tipo === "percentual" ? String(combos[c].valor / 100).replace(".", ",") : reaisDe(combos[c].valor) },
    ]),
  ) as Record<Combo, ComboDoForm>;

/** Lê o formulário. Devolve os dados prontos para salvar ou o primeiro problema encontrado. */
function ler(linhas: LinhaDoForm[], combos: Record<Combo, ComboDoForm>): { dados: Dados } | { erro: string } {
  const produtos: ProdutoParaSalvar[] = [];
  for (const l of linhas) {
    const quem = l.nome.trim() ? `"${l.nome.trim()}"` : `um item de ${NOME_DO_TIPO[l.tipo].varios.toLowerCase()} sem nome`;
    if (l.nome.trim().length < 2) return { erro: `Dê um nome a ${quem}, ou remova a linha.` };
    const centavos = centavosDe(l.reais);
    if (centavos == null) return { erro: `Informe o preço de ${quem} em reais, como 25,00.` };
    if (centavos < 1) return { erro: `O preço de ${quem} precisa ser maior que zero.` };
    produtos.push({ id: l.id, tipo: l.tipo, nome: l.nome.trim(), descricao: l.descricao.trim(), centavos, disponivel: l.disponivel });
  }
  const lidos = {} as Combos;
  for (const c of COMBOS) {
    const { tipo, texto } = combos[c];
    const valor = texto.trim() === "" ? 0 : tipo === "percentual" ? percentualDe(texto) : centavosDe(texto);
    if (valor == null) {
      return { erro: tipo === "percentual" ? `Combo ${ROTULO_DO_COMBO[c]}: informe o desconto de 0 a 100, como 10 ou 7,5.` : `Combo ${ROTULO_DO_COMBO[c]}: informe o desconto em reais, como 5,00.` };
    }
    lidos[c] = { tipo, valor };
  }
  const conferido = acessoriosParaSalvarSchema.safeParse({ produtos, combos: lidos });
  if (!conferido.success) {
    const campo = String(conferido.error.issues[0].path[0]);
    return { erro: campo === "combos" ? `O desconto de um combo passa do limite (${brl(LIMITES_DE_ACESSORIOS.centavos)}).` : `Confira nomes (até 80 letras), descrições (até 160) e preços (até ${brl(LIMITES_DE_ACESSORIOS.centavos)}).` };
  }
  return { dados: conferido.data };
}

export function FormularioDeAcessorios({ produtos, combos, valores, podeSalvar }: { produtos: Produto[]; combos: Combos; valores: Valores; podeSalvar: boolean }) {
  const [linhas, setLinhas] = useState<LinhaDoForm[]>(() => paraLinhas(produtos));
  const [descontos, setDescontos] = useState(() => paraCombos(combos));
  const [proximaChave, setProximaChave] = useState(produtos.length);
  const [salvo, setSalvo] = useState(() => JSON.stringify(ler(paraLinhas(produtos), paraCombos(combos))));
  const [gravando, setGravando] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; texto: string } | null>(null);

  const lido = ler(linhas, descontos);
  const dados = "dados" in lido ? lido.dados : null;
  const mudou = JSON.stringify(lido) !== salvo;
  const mudar = (chave: number, campos: Partial<LinhaDoForm>) => {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...campos } : l)));
    setStatus(null);
  };

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!dados) {
      setStatus({ ok: false, texto: "erro" in lido ? lido.erro : "Confira os campos." });
      return;
    }
    setGravando(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/acessorios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      const r = (await res.json().catch(() => ({}))) as { error?: string; produtos?: Produto[] };
      if (!res.ok || !r.produtos) throw new Error(r.error ?? "Não consegui gravar.");
      // os produtos novos voltam com o número que ganharam no banco
      const novas = paraLinhas(r.produtos);
      setLinhas(novas);
      setProximaChave(novas.length);
      setSalvo(JSON.stringify(ler(novas, descontos)));
      setStatus({ ok: true, texto: "Acessórios salvos. A loja já mostra a lista nova." });
    } catch (err) {
      setStatus({ ok: false, texto: (err as Error).message });
    } finally {
      setGravando(false);
    }
  }

  // Exemplo com 60 cartas e o primeiro item disponível de cada tipo, para conferir os descontos.
  const exemplo = (() => {
    if (!dados) return null;
    const primeiro = (tipo: Tipo): Linha[] => {
      const p = dados.produtos.find((x) => x.tipo === tipo && x.disponivel);
      return p ? [{ produto: { ...p, id: p.id ?? 0 }, qty: 1 }] : [];
    };
    const sleeve = primeiro("sleeve"), deckbox = primeiro("deckbox");
    const casos: Array<[Combo, Linha[]]> = [
      ["sleeves", sleeve],
      ["deckbox", deckbox],
      ["completo", sleeve.length && deckbox.length ? [...sleeve, ...deckbox] : []],
    ];
    const tabela = { valores, produtos: [], combos: dados.combos };
    return casos.filter(([, l]) => l.length).map(([c, l]) => ({ combo: c, itens: l, totais: calcularPedido(tabela, 60, "retirada", l) }));
  })();

  return (
    <form onSubmit={salvar} noValidate className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
        {TIPOS.map((tipo) => {
          const doTipo = linhas.filter((l) => l.tipo === tipo);
          return (
            <section key={tipo} className="panel flex flex-col gap-4 p-6">
              <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">{NOME_DO_TIPO[tipo].varios}</h2>
              {doTipo.length === 0 && <p className="text-muted">Nenhum item cadastrado. Enquanto estiver assim, a loja não oferece {NOME_DO_TIPO[tipo].varios.toLowerCase()}.</p>}
              <ul className="flex flex-col gap-4">
                {doTipo.map((l) => (
                  <li key={l.chave} className="flex flex-wrap items-end gap-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
                    <div className="min-w-0 flex-[2_1_200px]">
                      <label htmlFor={`a-${l.chave}-nome`} className="label">
                        Nome
                      </label>
                      <input id={`a-${l.chave}-nome`} className="field" maxLength={80} value={l.nome} onChange={(e) => mudar(l.chave, { nome: e.target.value })} />
                    </div>
                    <div className="min-w-0 flex-[3_1_220px]">
                      <label htmlFor={`a-${l.chave}-desc`} className="label">
                        Detalhe (cor, quantidade no pacote)
                      </label>
                      <input id={`a-${l.chave}-desc`} className="field" maxLength={160} value={l.descricao} onChange={(e) => mudar(l.chave, { descricao: e.target.value })} />
                    </div>
                    <div className="w-[130px]">
                      <label htmlFor={`a-${l.chave}-preco`} className="label">
                        Preço (R$)
                      </label>
                      <input id={`a-${l.chave}-preco`} inputMode="decimal" className="field" value={l.reais} onChange={(e) => mudar(l.chave, { reais: e.target.value })} />
                    </div>
                    <label className="flex min-h-[52px] items-center gap-2.5">
                      <input type="checkbox" checked={l.disponivel} onChange={(e) => mudar(l.chave, { disponivel: e.target.checked })} />
                      Disponível
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost px-4 text-sm"
                      aria-label={`Remover ${l.nome.trim() || "item sem nome"}`}
                      onClick={() => {
                        setLinhas((ls) => ls.filter((o) => o.chave !== l.chave));
                        setStatus(null);
                      }}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
              {linhas.length < LIMITES_DE_ACESSORIOS.produtos && (
                <button
                  type="button"
                  className="btn btn-ghost self-start px-4 text-sm"
                  onClick={() => {
                    setLinhas([...linhas, { chave: proximaChave, tipo, nome: "", descricao: "", reais: "", disponivel: true }]);
                    setProximaChave(proximaChave + 1);
                    setStatus(null);
                  }}
                >
                  Adicionar {NOME_DO_TIPO[tipo].um.toLowerCase()}
                </button>
              )}
            </section>
          );
        })}

        <section className="panel flex flex-col gap-4 p-6">
          <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">Desconto dos combos</h2>
          <p className="text-muted">
            O combo vale quando o pedido tem cartas e pelo menos um acessório do tipo. O desconto incide sobre cartas +
            acessórios; o frete fica de fora. Deixe 0 para não dar desconto.
          </p>
          <ul className="flex flex-col gap-3">
            {COMBOS.map((c) => (
              <li key={c} className="flex flex-wrap items-end gap-3">
                <span className="min-w-[220px] flex-1 pb-3.5 font-semibold first-letter:uppercase">{ROTULO_DO_COMBO[c]}</span>
                <div className="w-[170px]">
                  <label htmlFor={`combo-${c}-tipo`} className="label">
                    Tipo de desconto
                  </label>
                  <select
                    id={`combo-${c}-tipo`}
                    className="field"
                    value={descontos[c].tipo}
                    onChange={(e) => {
                      setDescontos({ ...descontos, [c]: { tipo: e.target.value as ComboDoForm["tipo"], texto: "" } });
                      setStatus(null);
                    }}
                  >
                    <option value="percentual">Percentual (%)</option>
                    <option value="fixo">Valor fixo (R$)</option>
                  </select>
                </div>
                <div className="w-[140px]">
                  <label htmlFor={`combo-${c}-valor`} className="label">
                    {descontos[c].tipo === "percentual" ? "Desconto (%)" : "Desconto (R$)"}
                  </label>
                  <input
                    id={`combo-${c}-valor`}
                    inputMode="decimal"
                    className="field"
                    placeholder="0"
                    aria-label={`Desconto do combo ${ROTULO_DO_COMBO[c]}`}
                    value={descontos[c].texto}
                    onChange={(e) => {
                      setDescontos({ ...descontos, [c]: { ...descontos[c], texto: e.target.value } });
                      setStatus(null);
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className="btn btn-gold" disabled={gravando || !podeSalvar}>
            Salvar acessórios
          </button>
          <p role="status" className={status?.ok === false ? "font-semibold text-gold-soft" : "text-muted"}>
            {status?.texto ?? (mudou ? "Há mudanças que ainda não foram salvas." : "")}
          </p>
        </div>
      </div>

      <aside className="panel flex min-w-0 flex-[1_1_340px] flex-col gap-3 p-6" aria-label="Como fica para a cliente">
        <h2 className="text-[15px] font-bold">Como fica para a cliente</h2>
        {!dados ? (
          <p className="font-semibold text-gold-soft">{"erro" in lido ? lido.erro : ""}</p>
        ) : exemplo && exemplo.length > 0 ? (
          <>
            <p className="text-[13px] text-muted">Exemplo com 60 cartas ({brl(exemplo[0].totais.subtotal)}), retirada, e o primeiro item disponível de cada tipo.</p>
            <ul className="flex flex-col">
              {exemplo.map(({ combo, itens, totais }) => (
                <li key={combo} className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0">
                  <strong className="first-letter:uppercase">{ROTULO_DO_COMBO[combo]}</strong>
                  <span className="text-muted">
                    {itens.map((l) => `${l.produto.nome} ${brl(l.produto.centavos)}`).join(" + ")}
                  </span>
                  <span>
                    {totais.desconto > 0 ? `Desconto de ${brl(totais.desconto)}: ` : "Sem desconto: "}
                    <strong>{brl(totais.total)}</strong>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted">Cadastre um item disponível para ver o exemplo.</p>
        )}
        <p className="text-[13px] text-muted">O exemplo usa o que está nos campos, mesmo antes de salvar.</p>
      </aside>
    </form>
  );
}
