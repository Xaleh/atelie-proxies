"use client";

import { useEffect, useState } from "react";
import { ErroDeDiagramacao, previaTraduzida, type TextoParaDesenhar } from "@/lib/traducao/render";
import type { MetaDeImpressao, MoldeManual } from "@/lib/traducao/tipos";

/**
 * Imagem da carta. Com tradução e molde, mostra a prévia com o texto em
 * português desenhado no navegador; enquanto ela não fica pronta, a arte original.
 */
export function CartaPrevia({
  url,
  alt,
  className,
  meta,
  face = 0,
  tr,
  molde,
}: {
  url: string;
  alt: string;
  className?: string;
  meta?: MetaDeImpressao;
  face?: number;
  tr?: TextoParaDesenhar | null;
  molde?: MoldeManual | "auto" | null;
}) {
  const [previa, setPrevia] = useState<{ chave: string; src: string } | null>(null);
  const [falha, setFalha] = useState<{ chave: string; especial: boolean } | null>(null);
  const chave = tr && molde && meta ? JSON.stringify([url, face, tr, molde]) : null;

  useEffect(() => {
    if (!chave || !tr || !molde || !meta) return;
    let vivo = true;
    previaTraduzida(url, meta, face, tr, molde)
      .then((src) => vivo && setPrevia({ chave, src }))
      .catch((e: unknown) => vivo && setFalha({ chave, especial: e instanceof ErroDeDiagramacao }));
    return () => {
      vivo = false;
    };
  }, [chave, url, meta, face, tr, molde]);

  const pronta = chave && previa?.chave === chave ? previa.src : null;
  const falhou = chave && falha?.chave === chave ? falha : null;
  const gerando = Boolean(chave && !pronta && !falhou);
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pronta ?? url} alt={alt} loading="lazy" className={className} />
      {gerando && (
        <span className="absolute inset-x-2 bottom-2 rounded-md bg-ink/85 px-2 py-1 text-center text-[11px] font-semibold text-cream">
          Gerando prévia em português…
        </span>
      )}
      {falhou && (
        <span className="absolute inset-x-2 bottom-2 rounded-md bg-ink/85 px-2 py-1 text-center text-[11px] font-semibold text-gold-soft">
          {falhou.especial ? "Arte com diagramação especial: o molde automático não serve" : "Não consegui gerar a prévia"}
        </span>
      )}
    </div>
  );
}
