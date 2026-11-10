import type { CartItem } from "@/lib/types";

/** Selo que mostra em que idioma a carta sai e de onde vem o texto. */
export function Seal({ item }: { item: Pick<CartItem, "lang" | "pt"> }) {
  if (item.lang === "pt" && item.pt) return <span className="seal bg-rust text-cream">PT oficial</span>;
  if (!item.pt) return <span className="seal border border-edge text-muted">PT indisponível</span>;
  return <span className="seal border border-muted text-cream">Em inglês</span>;
}
