import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { atualizarStatus } from "@/app/admin/actions";
import { CopiarBotao } from "@/app/pedido/[token]/Pagamento";
import { AdminShell } from "@/components/AdminShell";
import { StatusPill } from "@/components/StatusPill";
import type { Status } from "@/lib/db/schema";
import { NOME_DO_TIPO, ROTULO_DO_COMBO, type Combo } from "@/lib/acessorios";
import { brl, dataHora } from "@/lib/format";
import { pedidoPorCodigo } from "@/lib/orders";
import { folhas } from "@/lib/pricing";
import { exigirAdmin } from "@/lib/session";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Pedido", robots: { index: false, follow: false } };

function Acao({ code, status, rotulo, destaque }: { code: string; status: Status; rotulo: string; destaque?: boolean }) {
  return (
    <form action={atualizarStatus}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={`btn w-full ${destaque ? "btn-gold" : "btn-ghost"}`}>
        {rotulo}
      </button>
    </form>
  );
}

export default async function PedidoAdminPage({ params }: { params: Promise<{ code: string }> }) {
  await exigirAdmin();
  const { code } = await params;
  const pedido = await pedidoPorCodigo(code);
  if (!pedido) notFound();
  const { order, items, accessories, payments } = pedido;

  const emPortugues = items.reduce((n, i) => n + (i.lang === "pt" ? i.quantity : 0), 0);
  // Lista em texto, uma carta por linha, para colar em outra ferramenta se precisar.
  const lista = items.map((i) => `${i.quantity} ${i.name}`).join("\n");
  const linkCliente = `${siteUrl()}/pedido/${order.token}`;

  return (
    <AdminShell>
      <Link href="/admin" className="self-start py-2 font-semibold underline hover:text-gold-soft">
        Voltar aos pedidos
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-[40px]">
          Pedido <span className="text-gold">{order.code}</span>
        </h1>
        <StatusPill status={order.status} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">Cartas</h2>
            <span className="text-muted">
              {order.quantity} cartas · {emPortugues} em português · {folhas(order.quantity)} folhas A4
            </span>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt="" loading="lazy" className="aspect-[63/88] w-full rounded-lg bg-surface object-cover" />
                <span className="truncate font-semibold">
                  {item.quantity}× {item.printedName ?? item.name}
                </span>
                <span className="truncate text-xs text-muted">
                  {item.translated ? `PT traduzida · ${item.name}` : item.lang === "pt" ? `PT oficial · ${item.name}` : "EN"} · {item.setCode.toUpperCase()} {item.collectorNumber}
                </span>
              </li>
            ))}
          </ul>
          <Link href={`/admin/producao?pedidos=${order.code}`} className="btn btn-gold self-start">
            Abrir na produção (folhas, PDF e gabarito)
          </Link>
          {accessories.length > 0 && (
            <div className="panel flex flex-col gap-3 border-gold p-5">
              <h3 className="text-[15px] font-bold">Acessórios para separar</h3>
              <ul className="flex flex-col">
                {accessories.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 border-t border-line py-2 first:border-t-0">
                    <span className="min-w-0">
                      <strong>
                        {a.quantity} × {a.name}
                      </strong>
                      <span className="block text-muted">
                        {NOME_DO_TIPO[a.kind].um}
                        {a.description ? ` · ${a.description}` : ""}
                      </span>
                    </span>
                    <span>{brl(a.unitCents * a.quantity)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="panel flex flex-col gap-3 p-5">
            <h3 className="text-[15px] font-bold">Lista do pedido em texto</h3>
            <textarea readOnly rows={Math.min(10, items.length + 1)} value={lista} aria-label="Lista de cartas do pedido" className="field py-3 font-mono text-[13px]" />
            <CopiarBotao texto={lista} rotulo="Copiar lista" className="btn btn-ghost self-start" />
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <div className="panel flex flex-col gap-2 p-5">
            <h2 className="text-[15px] font-bold">Cliente</h2>
            <p>{order.customerName}</p>
            <p className="text-muted">{order.customerContact}</p>
            <p>
              {order.delivery === "envio" ? "Envio pelos Correios" : "Retirada no ateliê"}
              {order.delivery === "envio" && (
                <span className="block text-muted">
                  {order.address} · CEP {order.cep}
                </span>
              )}
            </p>
            {order.notes && <p className="border-t border-line pt-2 text-muted">Observações: {order.notes}</p>}
            <CopiarBotao texto={linkCliente} rotulo="Copiar link da cliente" className="btn btn-ghost mt-1" />
          </div>

          <div className="panel flex flex-col gap-2 p-5">
            <h2 className="text-[15px] font-bold">Valores</h2>
            <p className="flex justify-between gap-3">
              <span className="text-muted">
                {order.quantity} × {brl(order.unitCents)}
              </span>
              <span>{brl(order.subtotalCents)}</span>
            </p>
            {order.accessoriesCents > 0 && (
              <p className="flex justify-between gap-3">
                <span className="text-muted">Acessórios</span>
                <span>{brl(order.accessoriesCents)}</span>
              </p>
            )}
            {order.discountCents > 0 && (
              <p className="flex justify-between gap-3">
                <span className="text-muted">
                  Desconto do combo{order.combo && order.combo in ROTULO_DO_COMBO ? ` (${ROTULO_DO_COMBO[order.combo as Combo]})` : ""}
                </span>
                <span>− {brl(order.discountCents)}</span>
              </p>
            )}
            <p className="flex justify-between gap-3">
              <span className="text-muted">Frete</span>
              <span>{brl(order.shippingCents)}</span>
            </p>
            <p className="flex justify-between gap-3 text-lg font-bold">
              <span>Total</span>
              <span>{brl(order.totalCents)}</span>
            </p>
            <p className="text-muted">Recebido em {dataHora(order.createdAt + "Z")}</p>
            {payments.map((p) => (
              <p key={p.id} className="border-t border-line pt-2 text-muted">
                {p.provider === "mercadopago" ? `Mercado Pago nº ${p.providerPaymentId}` : "Pix direto"} ·{" "}
                {brl(p.amountCents)} · {p.status} · {dataHora(p.createdAt + "Z")}
              </p>
            ))}
          </div>

          <div className="panel flex flex-col gap-2.5 p-5">
            <h2 className="text-[15px] font-bold">Andamento</h2>
            {order.status === "recebido" && <Acao code={order.code} status="pago" rotulo="Marcar como pago (Pix conferido)" destaque />}
            {order.status === "pago" && <Acao code={order.code} status="producao" rotulo="Iniciar produção" destaque />}
            {(order.status === "pago" || order.status === "producao") && (
              <form action={atualizarStatus} className="flex flex-col gap-2.5">
                <input type="hidden" name="code" value={order.code} />
                <input type="hidden" name="status" value="enviado" />
                <div>
                  <label htmlFor="tracking" className="label">
                    Código de rastreio (opcional)
                  </label>
                  <input id="tracking" name="tracking" className="field font-mono" maxLength={40} />
                </div>
                <button type="submit" className={`btn ${order.status === "producao" ? "btn-gold" : "btn-ghost"}`}>
                  Marcar como enviado
                </button>
              </form>
            )}
            {order.status === "enviado" && (
              <p className="text-muted">
                Enviado{order.shippedAt ? ` em ${dataHora(order.shippedAt + "Z")}` : ""}
                {order.tracking ? ` · rastreio ${order.tracking}` : ""}.
              </p>
            )}
            {order.status !== "cancelado" && order.status !== "enviado" && (
              <Acao code={order.code} status="cancelado" rotulo="Cancelar pedido" />
            )}
            {order.status === "cancelado" && <Acao code={order.code} status="recebido" rotulo="Reabrir pedido" />}
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}
