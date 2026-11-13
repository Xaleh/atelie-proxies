import { ROTULO_DO_COMBO, type Linha } from "@/lib/acessorios";
import { brl } from "@/lib/format";
import type { TotaisDoPedido } from "@/lib/pricing";

/** Linhas de acessórios e do desconto do combo, iguais na loja e no fechamento. */
export function LinhasDeAcessorios({ linhas, totais }: { linhas: Linha[]; totais: TotaisDoPedido }) {
  if (!linhas.length) return null;
  return (
    <>
      {linhas.map((l) => (
        <div key={l.produto.id} className="flex justify-between gap-3">
          <dt className="min-w-0">
            {l.qty} × {l.produto.nome}
          </dt>
          <dd className="whitespace-nowrap font-bold">{brl(l.produto.centavos * l.qty)}</dd>
        </div>
      ))}
      {totais.combo && (
        <div className="flex justify-between gap-3 text-rust">
          <dt>Desconto do combo ({ROTULO_DO_COMBO[totais.combo]})</dt>
          <dd className="whitespace-nowrap font-bold">− {brl(totais.desconto)}</dd>
        </div>
      )}
    </>
  );
}
