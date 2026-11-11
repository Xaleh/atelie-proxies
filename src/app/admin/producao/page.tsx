import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import type { PedidoDoLote } from "@/lib/print/lote";
import { pedidoPorCodigo } from "@/lib/orders";
import { exigirAdmin } from "@/lib/session";
import { Producao } from "./Producao";

export const metadata: Metadata = { title: "Produção", robots: { index: false, follow: false } };

export default async function ProducaoPage({
  searchParams,
}: {
  searchParams: Promise<{ pedidos?: string | string[] }>;
}) {
  await exigirAdmin();
  const sp = await searchParams;
  const bruto = Array.isArray(sp.pedidos) ? sp.pedidos : (sp.pedidos ?? "").split(",");
  const codigos = [...new Set(bruto.map((c) => c.trim().toUpperCase()).filter(Boolean))].slice(0, 30);

  const pedidos: PedidoDoLote[] = [];
  const naoEncontrados: string[] = [];
  for (const code of codigos) {
    const p = await pedidoPorCodigo(code);
    if (!p) {
      naoEncontrados.push(code);
      continue;
    }
    pedidos.push({
      code: p.order.code,
      itens: p.items.map((i) => ({
        printId: i.printId,
        nome: i.name,
        nomeImpresso: i.printedName,
        lang: i.lang,
        image: i.image,
        quantidade: i.quantity,
      })),
    });
  }

  return (
    <AdminShell>
      <Link href="/admin" className="self-start py-2 font-semibold underline hover:text-gold-soft">
        Voltar aos pedidos
      </Link>
      <h1 className="display text-[40px]">Produção</h1>
      {naoEncontrados.length > 0 && (
        <p role="alert" className="panel border-gold p-4">
          Não encontrei {naoEncontrados.length === 1 ? "o pedido" : "os pedidos"} {naoEncontrados.join(", ")}.
        </p>
      )}
      <Producao pedidos={pedidos} />
    </AdminShell>
  );
}
