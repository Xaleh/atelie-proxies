import { NextResponse } from "next/server";
import { avisarPedidoNovo } from "@/lib/notify";
import { criarPedido, pedidoSchema } from "@/lib/orders";

export async function POST(request: Request) {
  const parsed = pedidoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const erros: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const campo = String(issue.path[0] ?? "pedido");
      erros[campo] ??= issue.message;
    }
    return NextResponse.json({ error: "Confira os dados do pedido.", erros }, { status: 400 });
  }
  try {
    const order = await criarPedido(parsed.data);
    await avisarPedidoNovo(order.code, order.quantity);
    return NextResponse.json({ code: order.code, token: order.token }, { status: 201 });
  } catch (err) {
    console.error("[orders]", err);
    return NextResponse.json(
      { error: "Não foi possível registrar o pedido. Tente de novo em instantes." },
      { status: 500 },
    );
  }
}
