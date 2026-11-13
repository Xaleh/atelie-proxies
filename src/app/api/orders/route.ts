import { NextResponse } from "next/server";
import { avisarPedidoNovo } from "@/lib/notify";
import { PedidoRecusado, criarPedido, pedidoSchema } from "@/lib/orders";
import { tabelaDaLoja } from "@/lib/acessorios-servidor";

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
    const tabela = await tabelaDaLoja();
    try {
      const order = await criarPedido(parsed.data, tabela);
      await avisarPedidoNovo(order.code, order.quantity, order.accessoriesCents > 0);
      return NextResponse.json({ code: order.code, token: order.token }, { status: 201 });
    } catch (err) {
      if (!(err instanceof PedidoRecusado)) throw err;
      if (err.motivo === "limite") {
        return NextResponse.json({ error: "Confira os dados do pedido.", erros: { itens: err.message }, tabela }, { status: 400 });
      }
      // preço ou catálogo mudou: devolve a tabela em vigor para a tela refazer a conta
      return NextResponse.json({ error: err.message, tabela }, { status: 409 });
    }
  } catch (err) {
    console.error("[orders]", err);
    return NextResponse.json(
      { error: "Não foi possível registrar o pedido. Tente de novo em instantes." },
      { status: 500 },
    );
  }
}
