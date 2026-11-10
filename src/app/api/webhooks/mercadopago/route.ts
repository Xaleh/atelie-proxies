import { NextResponse } from "next/server";
import { assinaturaValida } from "@/lib/mercadopago";
import { conciliarPagamentoMP } from "@/lib/orders";

/**
 * Webhook do Mercado Pago. Só confia na notificação depois de conferir a
 * assinatura, e mesmo assim busca o pagamento na API antes de mudar o pedido.
 */
export async function POST(request: Request) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook não configurado" }, { status: 503 });

  const url = new URL(request.url);
  const body = (await request.json().catch(() => null)) as { type?: string; data?: { id?: string | number } } | null;
  const dataId = url.searchParams.get("data.id") ?? (body?.data?.id != null ? String(body.data.id) : null);
  const tipo = url.searchParams.get("type") ?? body?.type ?? null;

  const ok = assinaturaValida({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId: url.searchParams.get("data.id"),
    secret,
  });
  if (!ok) return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });

  // Outros tipos de aviso (merchant_order etc.) são só confirmados.
  if (tipo !== "payment" || !dataId) return NextResponse.json({ ok: true });

  try {
    const resultado = await conciliarPagamentoMP(dataId);
    return NextResponse.json({ ok: true, resultado });
  } catch (err) {
    // Resposta de erro faz o Mercado Pago reenviar mais tarde.
    console.error("[webhooks/mercadopago]", err);
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 });
  }
}
