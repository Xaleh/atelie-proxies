"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { conferirDiagramacao } from "./render";
import type { MetaDeImpressao } from "./tipos";

/**
 * Conferência da diagramação das artes que vão receber o molde automático.
 * A moldura certa não garante que a arte tenha as barras e caixas no lugar
 * (moldura de quadrinho, arte que ocupa a carta toda…), então o site olha a
 * imagem antes de prometer a tradução. O resultado vale enquanto a página
 * estiver aberta e é compartilhado entre os componentes.
 */

export type PedidoDeConferencia = {
  printId: string;
  /** Imagem da frente da carta, no tamanho de exibição. */
  url: string;
  meta: MetaDeImpressao;
};

const resultados = new Map<string, boolean>();
const pendentes = new Set<string>();
const ouvintes = new Set<() => void>();
let versao = 0;

function conferir(p: PedidoDeConferencia) {
  if (resultados.has(p.printId) || pendentes.has(p.printId)) return;
  pendentes.add(p.printId);
  conferirDiagramacao(p.url, p.meta)
    .catch(() => true) // sem conseguir conferir, o renderizador confere de novo na hora de desenhar
    .then((ok) => {
      resultados.set(p.printId, ok);
      pendentes.delete(p.printId);
      versao++;
      ouvintes.forEach((o) => o());
    });
}

/**
 * Devolve a consulta por impressão: `true` se o molde automático reconhece a
 * arte, `false` se a arte tem diagramação especial e `undefined` enquanto a
 * conferência não termina (ou se ninguém pediu).
 */
export function useDiagramacao(pedidos: PedidoDeConferencia[]): (printId: string) => boolean | undefined {
  const v = useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => versao,
    () => 0,
  );
  const chave = pedidos.map((p) => p.printId).sort().join(",");
  useEffect(() => {
    pedidos.forEach(conferir);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chave` resume os pedidos
  }, [chave]);

  return useMemo(() => {
    void v;
    return (printId: string) => resultados.get(printId);
  }, [v]);
}
