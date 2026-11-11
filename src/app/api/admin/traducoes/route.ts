import { NextResponse } from "next/server";
import { z } from "zod";
import { estaLogado } from "@/lib/session";
import { removerRevisao, salvarRevisao } from "@/lib/traducao/servidor";
import { traducaoSchema } from "@/lib/traducao/tipos";

const body = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("salvar"), nomeEn: z.string().trim().min(1).max(200), traducao: traducaoSchema }),
  z.object({ acao: z.literal("remover"), nomeEn: z.string().trim().min(1).max(200) }),
]);

/** Revisão de tradução feita no painel. */
export async function POST(request: Request) {
  if (!(await estaLogado())) return NextResponse.json({ error: "Entre no painel de novo." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira os campos da tradução." }, { status: 400 });
  try {
    if (parsed.data.acao === "salvar") await salvarRevisao(parsed.data.nomeEn, parsed.data.traducao);
    else await removerRevisao(parsed.data.nomeEn);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/traducoes]", err);
    return NextResponse.json({ error: "Não consegui gravar no banco." }, { status: 500 });
  }
}
