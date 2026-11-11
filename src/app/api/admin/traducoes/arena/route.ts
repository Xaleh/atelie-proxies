import { NextResponse } from "next/server";
import { z } from "zod";
import { estaLogado } from "@/lib/session";
import { importarArena } from "@/lib/traducao/servidor";

const txt = (max: number) => z.string().max(max);
const body = z.object({
  limpar: z.boolean(),
  cartas: z.array(z.tuple([txt(200).min(1), txt(200).min(1), txt(300), txt(4000)])).max(1000),
  sabores: z.array(z.tuple([txt(260).min(1), txt(1000)])).max(2000),
});

/** Recebe uma parte do traducoes-arena.json, já lido no navegador. */
export async function POST(request: Request) {
  if (!(await estaLogado())) return NextResponse.json({ error: "Entre no painel de novo." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Parte do arquivo em formato inesperado." }, { status: 400 });
  try {
    await importarArena(parsed.data);
    return NextResponse.json({ ok: true, cartas: parsed.data.cartas.length, sabores: parsed.data.sabores.length });
  } catch (err) {
    console.error("[admin/traducoes/arena]", err);
    return NextResponse.json({ error: "Não consegui gravar no banco." }, { status: 500 });
  }
}
