import { NextResponse } from "next/server";
import { loja } from "@/config/loja";
import { criarPreferencia, mercadoPagoConfigurado } from "@/lib/mercadopago";
import { pedidoPorToken } from "@/lib/orders";
import { siteUrl } from "@/lib/site";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!mercadoPagoConfigurado()) {
    return NextResponse.json({ error: "Pagamento pelo Mercado Pago indisponível." }, { status: 503 });
  }
  const pedido = await pedidoPorToken(token);
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  if (pedido.order.status !== "recebido") {
    return NextResponse.json({ error: "Este pedido não está aguardando pagamento." }, { status: 409 });
  }
  try {
    const url = await criarPreferencia({
      codigo: pedido.order.code,
      titulo: `${loja.nome} · pedido ${pedido.order.code} · ${pedido.order.quantity} cartas`,
      centavos: pedido.order.totalCents,
      siteUrl: siteUrl(),
      retorno: `/pedido/${pedido.order.token}`,
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[mercadopago/preference]", err);
    return NextResponse.json(
      { error: "Não foi possível abrir o Mercado Pago. Tente de novo ou pague por Pix." },
      { status: 502 },
    );
  }
}
