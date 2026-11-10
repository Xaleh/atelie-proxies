import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { StatusPill } from "@/components/StatusPill";
import { brl, dataHora } from "@/lib/format";
import { listarPedidos, type Filtro } from "@/lib/orders";
import { exigirAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Pedidos", robots: { index: false, follow: false } };

const FILTROS: Array<[Filtro, string]> = [
  ["abertos", "Abertos"],
  ["enviados", "Enviados"],
  ["todos", "Todos"],
];

const PAGAMENTO = { pix: "Pix direto", mercadopago: "Mercado Pago" } as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  await exigirAdmin();
  const sp = await searchParams;
  const filtro: Filtro = sp.filtro === "enviados" || sp.filtro === "todos" ? sp.filtro : "abertos";
  const pedidos = await listarPedidos(filtro);

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <h1 className="display text-[40px]">Pedidos</h1>
        <nav aria-label="Filtrar por status" className="flex flex-wrap gap-2">
          {FILTROS.map(([valor, rotulo]) => (
            <Link
              key={valor}
              href={valor === "abertos" ? "/admin" : `/admin?filtro=${valor}`}
              aria-current={filtro === valor ? "page" : undefined}
              className={`btn px-4 text-sm ${filtro === valor ? "bg-cream text-ink" : "btn-ghost"}`}
            >
              {rotulo}
            </Link>
          ))}
        </nav>
      </div>

      {pedidos.length === 0 ? (
        <p className="panel p-8 text-center text-muted">Nenhum pedido neste filtro.</p>
      ) : (
        <div className="panel overflow-x-auto rounded-[14px]">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted">
                {["Código", "Cliente", "Cartas", "Em PT", "Total", "Status", "Recebido em", ""].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidos.map(({ order, emPortugues }) => (
                <tr key={order.id} className="border-t border-line">
                  <td className="px-4 py-3 font-mono">{order.code}</td>
                  <td className="px-4 py-3">{order.customerName}</td>
                  <td className="px-4 py-3">{order.quantity}</td>
                  <td className="px-4 py-3">{emPortugues}</td>
                  <td className="px-4 py-3">{brl(order.totalCents)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={order.status} />
                    {order.paymentMethod && <span className="ml-2 text-xs text-muted">{PAGAMENTO[order.paymentMethod]}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">{dataHora(order.createdAt + "Z")}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/pedidos/${order.code}`} className="inline-block py-2.5 font-semibold underline hover:text-gold-soft">
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
