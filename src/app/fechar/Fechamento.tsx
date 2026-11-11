"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import { calcularTotais, type Entrega } from "@/lib/pricing";
import { useSituacoes } from "@/lib/traducao/carrinho";

type Erros = Partial<Record<"nome" | "contato" | "cep" | "endereco" | "itens" | "pedido", string>>;

function Erro({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} className="mt-1.5 text-[13px] font-semibold text-gold-soft">
      {texto}
    </p>
  );
}

export function Fechamento() {
  const router = useRouter();
  const { itens, pronto, quantidade, limpar } = useCart();
  const { situacao, emPortugues } = useSituacoes(itens);
  const verificando = itens.some((i) => i.lang === "pt" && situacao(i).carregando);
  const [entrega, setEntrega] = useState<Entrega>("envio");
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<Erros>({});
  const [falha, setFalha] = useState<string | null>(null);
  const totais = calcularTotais(quantidade, entrega);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setEnviando(true);
    setErros({});
    setFalha(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.get("nome"),
          contato: form.get("contato"),
          entrega,
          cep: form.get("cep") ?? "",
          endereco: form.get("endereco") ?? "",
          observacoes: form.get("observacoes") ?? "",
          site: form.get("site") ?? "",
          itens: itens.map((item) => {
            const { print: p, modo, tr } = situacao(item);
            const traduzida = modo === "traduzida";
            return {
              printId: p.id,
              oracleId: item.oracleId,
              name: item.name,
              printedName: traduzida ? (tr?.nome ?? null) : p.printedName,
              set: p.set,
              collectorNumber: p.collectorNumber,
              lang: modo === "oficial" || traduzida ? "pt" : "en",
              traduzida,
              image: p.image,
              qty: item.qty,
            };
          }),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string; erros?: Erros };
      if (!res.ok || !data.token) {
        setErros(data.erros ?? {});
        setFalha(data.error ?? "Não foi possível registrar o pedido. Tente de novo.");
        return;
      }
      limpar();
      router.push(`/pedido/${data.token}`);
    } catch {
      setFalha("Sem conexão com o site. Confira sua internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (pronto && itens.length === 0) {
    return (
      <div className="panel flex flex-col items-start gap-4 p-8">
        <p className="text-muted">Seu pedido está vazio.</p>
        <Link href="/montar" className="btn btn-gold">
          Montar pedido
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-wrap items-start gap-7">
      <section className="panel flex min-w-0 flex-[999_1_480px] flex-col gap-5 p-7">
        <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">Seus dados</h2>
        <div className="flex flex-wrap gap-4">
          <div className="min-w-0 flex-[1_1_240px]">
            <label htmlFor="nome" className="label">
              Nome
            </label>
            <input id="nome" name="nome" required autoComplete="name" className="field" aria-describedby="erro-nome" aria-invalid={Boolean(erros.nome)} />
            <Erro id="erro-nome" texto={erros.nome} />
          </div>
          <div className="min-w-0 flex-[1_1_240px]">
            <label htmlFor="contato" className="label">
              E-mail ou telefone
            </label>
            <input id="contato" name="contato" required className="field" aria-describedby="erro-contato" aria-invalid={Boolean(erros.contato)} />
            <Erro id="erro-contato" texto={erros.contato} />
          </div>
        </div>

        <fieldset>
          <legend className="label">Entrega</legend>
          <div className="flex flex-wrap gap-2.5">
            {(
              [
                ["envio", "Envio pelos Correios"],
                ["retirada", "Retirada no ateliê"],
              ] as const
            ).map(([valor, rotulo]) => (
              <label key={valor} className={`flex min-h-[46px] flex-[1_1_200px] cursor-pointer items-center gap-2.5 rounded-[10px] border-[1.5px] px-3.5 ${entrega === valor ? "border-gold" : "border-edge"}`}>
                <input type="radio" name="entrega" checked={entrega === valor} onChange={() => setEntrega(valor)} />
                {rotulo}
              </label>
            ))}
          </div>
        </fieldset>

        {entrega === "envio" && (
          <div className="flex flex-wrap gap-4">
            <div className="min-w-0 flex-[1_1_140px]">
              <label htmlFor="cep" className="label">
                CEP
              </label>
              <input id="cep" name="cep" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" className="field" aria-describedby="erro-cep" aria-invalid={Boolean(erros.cep)} />
              <Erro id="erro-cep" texto={erros.cep} />
            </div>
            <div className="min-w-0 flex-[3_1_300px]">
              <label htmlFor="endereco" className="label">
                Endereço, número, complemento, cidade e estado
              </label>
              <input id="endereco" name="endereco" autoComplete="street-address" className="field" aria-describedby="erro-endereco" aria-invalid={Boolean(erros.endereco)} />
              <Erro id="erro-endereco" texto={erros.endereco} />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="observacoes" className="label">
            Observações para o ateliê (opcional)
          </label>
          <textarea id="observacoes" name="observacoes" rows={3} className="field py-3" />
        </div>

        {/* Campo-isca contra robôs: fica fora da tela e fora da navegação por teclado. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Não preencha este campo
            <input name="site" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <p className="text-[13px] text-muted">Seus dados são usados só para produzir e entregar este pedido.</p>
      </section>

      <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-2xl bg-cream p-7 text-ink">
        <h2 className="display text-3xl">Resumo</h2>
        <dl className="flex flex-col gap-2.5">
          <div className="flex justify-between gap-3">
            <dt>
              {quantidade} {quantidade === 1 ? "carta" : "cartas"} × {brl(totais.unitario)}
            </dt>
            <dd className="font-bold">{brl(totais.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Em português</dt>
            <dd className="font-bold">{emPortugues}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Frete</dt>
            <dd className="font-bold">{totais.frete ? brl(totais.frete) : "sem frete"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-paper-line pt-3 text-xl font-bold">
            <dt>Total</dt>
            <dd>{brl(totais.total)}</dd>
          </div>
        </dl>
        <button type="submit" className="btn btn-dark min-h-14 text-[17px]" disabled={enviando || !pronto || verificando}>
          {enviando ? "Registrando…" : "Confirmar pedido"}
        </button>
        <div role="alert" className="min-h-5 text-sm font-semibold text-rust">
          {falha}
          {erros.itens && ` ${erros.itens}`}
        </div>
        <p className="text-[13px] text-paper-muted">
          O pagamento vem na próxima tela: Pix direto ou Mercado Pago.
        </p>
        <Link href="/montar" className="py-2 text-sm font-semibold underline">
          Voltar e ajustar as cartas
        </Link>
      </aside>
    </form>
  );
}
