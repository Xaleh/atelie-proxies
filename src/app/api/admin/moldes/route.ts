import { NextResponse } from "next/server";
import { z } from "zod";
import { estaLogado } from "@/lib/session";
import { removerMolde, salvarMolde } from "@/lib/traducao/servidor";
import { moldeSchema } from "@/lib/traducao/tipos";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const body = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("salvar"), printId: uuid, face: z.number().int().min(0).max(3), molde: moldeSchema }),
  z.object({ acao: z.literal("remover"), printId: uuid, face: z.number().int().min(0).max(3) }),
]);

/** Molde manual de uma arte, marcado no painel. */
export async function POST(request: Request) {
  if (!(await estaLogado())) return NextResponse.json({ error: "Entre no painel de novo." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Molde inválido." }, { status: 400 });
  try {
    if (parsed.data.acao === "salvar") await salvarMolde(parsed.data.printId, parsed.data.face, parsed.data.molde);
    else await removerMolde(parsed.data.printId, parsed.data.face);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/moldes]", err);
    return NextResponse.json({ error: "Não consegui gravar no banco." }, { status: 500 });
  }
}
