import { NextResponse } from "next/server";
import { z } from "zod";
import { buscarPorNomes } from "@/lib/scryfall";

const body = z.object({ names: z.array(z.string().trim().min(1).max(200)).min(1).max(300) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Lista inválida." }, { status: 400 });
  try {
    return NextResponse.json(await buscarPorNomes(parsed.data.names));
  } catch (err) {
    console.error("[cards/collection]", err);
    return NextResponse.json({ error: "A busca de cartas está indisponível agora." }, { status: 502 });
  }
}
