import { NextResponse } from "next/server";
import { buscarCartas } from "@/lib/scryfall";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 80) return NextResponse.json({ entries: [] });
  try {
    return NextResponse.json({ entries: await buscarCartas(q) });
  } catch (err) {
    console.error("[cards/search]", err);
    return NextResponse.json({ error: "A busca de cartas está indisponível agora." }, { status: 502 });
  }
}
