"use client";

import { useState } from "react";

export function CopiarBotao({ texto, rotulo, className }: { texto: string; rotulo: string; className: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        } catch {
          window.prompt("Copie o texto abaixo:", texto);
        }
      }}
    >
      <span aria-live="polite">{copiado ? "Copiado" : rotulo}</span>
    </button>
  );
}

export function MercadoPagoBotao({ token }: { token: string }) {
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        disabled={abrindo}
        className="btn min-h-[50px] border-2 border-ink text-base text-ink hover:bg-ink hover:text-cream"
        onClick={async () => {
          setAbrindo(true);
          setErro(null);
          try {
            const res = await fetch(`/api/orders/${token}/mercadopago`, { method: "POST" });
            const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
            if (!res.ok || !data.url) throw new Error(data.error ?? "Não foi possível abrir o Mercado Pago.");
            window.location.assign(data.url);
          } catch (e) {
            setErro((e as Error).message);
            setAbrindo(false);
          }
        }}
      >
        {abrindo ? "Abrindo o Mercado Pago…" : "Pagar com Mercado Pago"}
      </button>
      <p className="text-[13px] text-paper-muted">
        Cartão, Pix ou boleto. Você paga na página do Mercado Pago e volta para cá; o status muda para Pago
        sozinho.
      </p>
      <p role="alert" className="text-sm font-semibold text-rust">
        {erro}
      </p>
    </div>
  );
}
