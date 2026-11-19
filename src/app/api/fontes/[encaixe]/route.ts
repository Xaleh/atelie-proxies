import { ehEncaixe } from "@/lib/tipografia";
import { arquivoDaLetra } from "@/lib/tipografia-servidor";

/**
 * Arquivo de fonte de um encaixe das cartas traduzidas. O endereço leva um `v`
 * que muda quando o arquivo muda, então a resposta pode ficar em cache no
 * navegador e na rede por um ano.
 */
export async function GET(request: Request, { params }: { params: Promise<{ encaixe: string }> }) {
  const { encaixe } = await params;
  if (!ehEncaixe(encaixe)) return new Response("Não encontrada", { status: 404 });
  let letra: Awaited<ReturnType<typeof arquivoDaLetra>>;
  try {
    letra = await arquivoDaLetra(encaixe);
  } catch (err) {
    console.error("[fontes/arquivo]", err);
    return new Response("Indisponível agora", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!letra) return new Response("Não encontrada", { status: 404, headers: { "Cache-Control": "no-store" } });
  // Só guarda para sempre quando o endereço pede exatamente esta versão do arquivo.
  const versaoCerta = new URL(request.url).searchParams.get("v") === letra.hash;
  return new Response(new Uint8Array(letra.data), {
    headers: {
      "Content-Type": letra.mime,
      "Content-Length": String(letra.data.length),
      "Cache-Control": versaoCerta ? "public, max-age=31536000, immutable" : "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
