import { NextResponse } from "next/server";
import { z } from "zod";
import { buscarTraducoes } from "@/lib/traducao/servidor";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const body = z.object({
  faces: z
    .array(
      z.object({
        oracleId: uuid,
        nome: z.string().trim().min(1).max(200),
        set: z.string().trim().max(10),
        num: z.string().trim().max(20),
        printId: uuid,
        face: z.number().int().min(0).max(3),
      }),
    )
    .min(1)
    .max(300),
});

/** Traduções e moldes das cartas de um carrinho ou de um lote de produção. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  try {
    return NextResponse.json(await buscarTraducoes(parsed.data.faces));
  } catch (err) {
    console.error("[traducoes]", err);
    return NextResponse.json({ error: "As traduções estão indisponíveis agora." }, { status: 502 });
  }
}
