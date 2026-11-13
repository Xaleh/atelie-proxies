import { NextResponse } from "next/server";
import { estaLogado } from "@/lib/session";
import { valoresSchema } from "@/lib/valores";
import { salvarValores } from "@/lib/valores-servidor";

/** Grava os valores da loja (preço por carta, frete e limite do pedido). */
export async function POST(request: Request) {
  if (!(await estaLogado())) return NextResponse.json({ error: "Entre no painel de novo." }, { status: 401 });
  const parsed = valoresSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Valores inválidos." }, { status: 400 });
  }
  try {
    await salvarValores(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/valores]", err);
    return NextResponse.json({ error: "Não consegui gravar no banco." }, { status: 500 });
  }
}
