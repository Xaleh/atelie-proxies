import { fotoDoProduto } from "@/lib/acessorios-servidor";

/**
 * Foto de um acessório. O endereço leva um `v` que muda quando a foto muda,
 * então a resposta pode ficar em cache no navegador e na rede por um ano.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) return new Response("Não encontrada", { status: 404 });
  let foto: Awaited<ReturnType<typeof fotoDoProduto>>;
  try {
    foto = await fotoDoProduto(Number(id));
  } catch (err) {
    console.error("[acessorios/imagem]", err);
    return new Response("Indisponível agora", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!foto) return new Response("Não encontrada", { status: 404, headers: { "Cache-Control": "no-store" } });
  // Só guarda para sempre quando o endereço pede exatamente esta versão da foto.
  const versaoCerta = new URL(request.url).searchParams.get("v") === foto.hash;
  return new Response(new Uint8Array(foto.data), {
    headers: {
      "Content-Type": foto.mime,
      "Content-Length": String(foto.data.length),
      "Cache-Control": versaoCerta ? "public, max-age=31536000, immutable" : "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
