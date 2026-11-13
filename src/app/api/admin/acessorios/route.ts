import { NextResponse } from "next/server";
import { acessoriosParaSalvarSchema } from "@/lib/acessorios";
import { FotoRecusada, listarProdutos, salvarAcessorios } from "@/lib/acessorios-servidor";
import { estaLogado } from "@/lib/session";

/** Grava o catálogo de acessórios e os descontos dos combos, e devolve o catálogo como ficou. */
export async function POST(request: Request) {
  if (!(await estaLogado())) return NextResponse.json({ error: "Entre no painel de novo." }, { status: 401 });
  const parsed = acessoriosParaSalvarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  try {
    await salvarAcessorios(parsed.data);
    return NextResponse.json({ ok: true, produtos: await listarProdutos() });
  } catch (err) {
    if (err instanceof FotoRecusada) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[admin/acessorios]", err);
    return NextResponse.json({ error: "Não consegui gravar no banco." }, { status: 500 });
  }
}
