import { NextResponse } from "next/server";
import { z } from "zod";
import { detalhesDasImpressoes } from "@/lib/scryfall";
import { estaLogado } from "@/lib/session";

const body = z.object({
  ids: z.array(z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)).min(1).max(600),
});

/** Faces e imagens de impressão das cartas de um lote. Só para o painel. */
export async function POST(request: Request) {
  if (!(await estaLogado())) return NextResponse.json({ error: "Entre no painel de novo." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Lista de cartas inválida." }, { status: 400 });
  try {
    return NextResponse.json({ prints: await detalhesDasImpressoes(parsed.data.ids) });
  } catch (err) {
    console.error("[admin/prints]", err);
    return NextResponse.json({ error: "O Scryfall não respondeu." }, { status: 502 });
  }
}
