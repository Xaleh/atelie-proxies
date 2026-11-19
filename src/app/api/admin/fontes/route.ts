import { NextResponse } from "next/server";
import { estaLogado } from "@/lib/session";
import { TAMANHO_MAXIMO, tamanhoLegivel } from "@/lib/tipografia";
import { LetraRecusada, letrasEnviadas, removerLetra, salvarLetra } from "@/lib/tipografia-servidor";

const recusar = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Grava a fonte de um encaixe (formulário com `encaixe` e `arquivo`) e devolve a lista como ficou. */
export async function POST(request: Request) {
  if (!(await estaLogado())) return recusar("Entre no painel de novo.", 401);
  // corta antes de ler o corpo quando o navegador já avisa que é grande demais
  if (Number(request.headers.get("content-length") ?? 0) > TAMANHO_MAXIMO + 64 * 1024) {
    return recusar(`O arquivo passa de ${tamanhoLegivel(TAMANHO_MAXIMO)}.`, 413);
  }
  const form = await request.formData().catch(() => null);
  const encaixe = form?.get("encaixe"), arquivo = form?.get("arquivo");
  if (typeof encaixe !== "string" || !(arquivo instanceof File)) return recusar("Escolha um arquivo de fonte.");
  if (arquivo.size > TAMANHO_MAXIMO) return recusar(`O arquivo passa de ${tamanhoLegivel(TAMANHO_MAXIMO)}.`, 413);
  try {
    await salvarLetra(encaixe, arquivo.name, new Uint8Array(await arquivo.arrayBuffer()));
    return NextResponse.json({ ok: true, letras: await letrasEnviadas() });
  } catch (err) {
    if (err instanceof LetraRecusada) return recusar(err.message);
    console.error("[admin/fontes]", err);
    return recusar("Não consegui gravar no banco.", 500);
  }
}

/** Tira a fonte de um encaixe (`?encaixe=`); as cartas voltam à fonte livre. */
export async function DELETE(request: Request) {
  if (!(await estaLogado())) return recusar("Entre no painel de novo.", 401);
  try {
    await removerLetra(new URL(request.url).searchParams.get("encaixe") ?? "");
    return NextResponse.json({ ok: true, letras: await letrasEnviadas() });
  } catch (err) {
    if (err instanceof LetraRecusada) return recusar(err.message);
    console.error("[admin/fontes]", err);
    return recusar("Não consegui gravar no banco.", 500);
  }
}
