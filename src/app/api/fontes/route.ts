import { NextResponse } from "next/server";
import { letrasEnviadas } from "@/lib/tipografia-servidor";

/**
 * Quais encaixes têm fonte enviada pelo painel, para o renderizador das cartas
 * traduzidas. Sem banco, ou com a lista vazia, as cartas usam as fontes livres.
 */
export async function GET() {
  try {
    return NextResponse.json({ letras: await letrasEnviadas() }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (err) {
    console.error("[fontes]", err);
    return NextResponse.json({ letras: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
