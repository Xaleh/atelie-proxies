import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { detalhesDasImpressoes } from "@/lib/scryfall";
import { exigirAdmin } from "@/lib/session";
import { moldeDe } from "@/lib/traducao/servidor";
import { EditorDeMolde } from "./EditorDeMolde";

export const metadata: Metadata = { title: "Molde da arte", robots: { index: false, follow: false } };

export default async function MoldePage({
  params,
  searchParams,
}: {
  params: Promise<{ printId: string }>;
  searchParams: Promise<{ face?: string }>;
}) {
  await exigirAdmin();
  const { printId } = await params;
  const { face: faceTexto } = await searchParams;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(printId)) notFound();
  const [detalhe] = await detalhesDasImpressoes([printId]);
  if (!detalhe || !detalhe.faces.length) notFound();
  const face = Math.max(0, Math.min(detalhe.faces.length - 1, Number(faceTexto) || 0));
  let inicial = null;
  let bancoOk = true;
  try {
    inicial = await moldeDe(printId, face);
  } catch (err) {
    console.error("[admin/moldes]", err);
    bancoOk = false;
  }

  return (
    <AdminShell>
      <h1 className="display text-[40px]">Molde da arte</h1>
      <p className="max-w-3xl text-base text-muted">
        {detalhe.faces[face].nome} · {detalhe.set.toUpperCase()} {detalhe.collectorNumber}
        {detalhe.faces.length > 1 ? ` · face ${face + 1} de ${detalhe.faces.length}` : ""}. Marque onde ficam o nome, o tipo e o
        texto nesta arte. O molde vale para todos os pedidos desta impressão.
      </p>
      {!bancoOk && <p className="panel border-gold p-4">O banco não respondeu; não dá para salvar agora.</p>}
      <EditorDeMolde detalhe={detalhe} face={face} inicial={inicial} />
    </AdminShell>
  );
}
