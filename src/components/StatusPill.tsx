import type { Status } from "@/lib/db/schema";

const ROTULO: Record<Status, string> = {
  recebido: "Recebido",
  pago: "Pago",
  producao: "Em produção",
  enviado: "Enviado",
  cancelado: "Cancelado",
};

const COR: Record<Status, string> = {
  recebido: "bg-gold text-ink",
  pago: "bg-rust text-cream",
  producao: "bg-cream text-ink",
  enviado: "border border-muted text-cream",
  cancelado: "border border-edge text-muted",
};

export function StatusPill({ status }: { status: Status }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${COR[status]}`}>{ROTULO[status]}</span>;
}
