"use client";

import { useMemo } from "react";
import { impressaoEscolhida, modoDoTexto, type CardPrint, type CartItem, type ModoDoTexto } from "../types";
import { useTraducoes } from "./cliente";
import type { PedidoDeTraducao } from "./servidor";
import type { MoldeManual } from "./tipos";
import type { TextoParaDesenhar } from "./render";

export type Situacao = {
  modo: ModoDoTexto;
  /** Impressão que vai para o pedido. */
  print: CardPrint;
  /** A arte em inglês aceita o texto em português. */
  podeTraduzir: boolean;
  /** Ainda buscando a tradução desta carta. */
  carregando: boolean;
  tr: TextoParaDesenhar | null;
  molde: MoldeManual | "auto" | null;
};

function nomeDaFrente(p: CardPrint): string {
  return p.meta?.faces[0]?.nome ?? p.name.split(" // ")[0];
}

/** Pedido de tradução da frente da arte em inglês de cada item. */
export function facesDoCarrinho(itens: CartItem[]): PedidoDeTraducao[] {
  return itens.map((i) => ({
    oracleId: i.oracleId,
    nome: nomeDaFrente(i.en),
    set: i.en.set,
    num: i.en.collectorNumber,
    printId: i.en.id,
    face: 0,
  }));
}

/** Como cada carta do carrinho sai: idioma, arte e o que desenhar. */
export function useSituacoes(itens: CartItem[]) {
  const faces = useMemo(() => facesDoCarrinho(itens), [itens]);
  const t = useTraducoes(faces);
  return useMemo(() => {
    const situacao = (item: CartItem): Situacao => {
      const nome = nomeDaFrente(item.en);
      const carregando = t.traducao(nome) === undefined;
      const tr = t.textoPara(nome, item.en.set, item.en.collectorNumber);
      const molde = t.moldeQueVale(item.en.id, 0, item.en.meta);
      const podeTraduzir = Boolean(tr && molde && item.en.meta);
      return {
        modo: modoDoTexto(item, podeTraduzir),
        print: impressaoEscolhida(item),
        podeTraduzir,
        carregando,
        tr,
        molde,
      };
    };
    const emPortugues = itens.reduce((n, i) => {
      const m = situacao(i).modo;
      return n + (m === "oficial" || m === "traduzida" ? i.qty : 0);
    }, 0);
    return { situacao, emPortugues };
  }, [itens, t]);
}
