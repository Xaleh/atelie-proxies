const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function brl(centavos: number): string {
  return brlFmt.format(centavos / 100);
}

export function dataHora(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}
