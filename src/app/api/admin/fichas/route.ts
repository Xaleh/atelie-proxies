import { NextResponse } from "next/server";
import { z } from "zod";
import { fichasDasCartas } from "@/lib/scryfall";
import { estaLogado } from "@/lib/session";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const body = z.object({
  ids: z.array(uuid).min(1).max(600),
  /** Idioma pedido de cada carta (id da impressão → "en" ou "pt"). */
  idiomas: z.record(z.string(), z.string()).optional(),
});

/** Fichas (tokens) que as cartas de um lote criam. Só para o painel. */
export async function POST(request: Request) {
  if (!(await estaLogado())) return NextResponse.json({ error: "Entre no painel de novo." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Lista de cartas inválida." }, { status: 400 });
  try {
    return NextResponse.json({ fichas: await fichasDasCartas(parsed.data.ids, parsed.data.idiomas) });
  } catch (err) {
    console.error("[admin/fichas]", err);
    return NextResponse.json({ error: "O Scryfall não respondeu." }, { status: 502 });
  }
}
