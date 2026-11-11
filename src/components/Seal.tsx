import type { ModoDoTexto } from "@/lib/types";

/** Selo que mostra em que idioma a carta sai e de onde vem o texto. */
export function Seal({ modo, carregando }: { modo: ModoDoTexto; carregando?: boolean }) {
  if (modo === "oficial") return <span className="seal bg-rust text-cream">PT oficial</span>;
  if (modo === "traduzida") return <span className="seal bg-gold text-ink">PT traduzida</span>;
  if (modo === "en") return <span className="seal border border-muted text-cream">Em inglês</span>;
  if (carregando) return <span className="seal border border-edge text-muted">Verificando PT…</span>;
  return <span className="seal border border-edge text-muted">PT indisponível nesta arte</span>;
}
