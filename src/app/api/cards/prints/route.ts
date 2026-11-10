import { NextResponse } from "next/server";
import { buscarImpressoes } from "@/lib/scryfall";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("oracleId") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Carta inválida." }, { status: 400 });
  try {
    return NextResponse.json({ prints: await buscarImpressoes(id) });
  } catch (err) {
    console.error("[cards/prints]", err);
    return NextResponse.json({ error: "A busca de artes está indisponível agora." }, { status: 502 });
  }
}
