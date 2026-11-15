"use client";

import { useMemo } from "react";
import { impressaoEscolhida, modoDoTexto, type CardPrint, type CartItem, type ModoDoTexto } from "../types";
import { useTraducoes } from "./cliente";
import { useDiagramacao, type PedidoDeConferencia } from "./diagramacao";
import type { PedidoDeTraducao } from "./servidor";
import type { MoldeManual } from "./tipos";
import type { TextoParaDesenhar } from "./render";

export type Situacao = {
  modo: ModoDoTexto;
  /** Impressão que vai para o pedido. */
  print: CardPrint;
  /** A arte em inglês aceita o texto em português. */
  podeTraduzir: boolean;
  /** Ainda buscando a tradução desta carta ou conferindo a arte. */
  carregando: boolean;
  /** A arte tem diagramação especial: o texto em português não cabe nela. */
  arteEspecial: boolean;
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
  // Cartas pedidas em português numa arte em inglês que vai receber o molde
  // automático: a imagem é conferida antes de a loja prometer a tradução.
  const aConferir = useMemo(() => {
    const out: PedidoDeConferencia[] = [];
    for (const item of itens) {
      const meta = item.en.meta;
      if (item.lang !== "pt" || impressaoEscolhida(item).lang === "pt" || !meta) continue;
      if (!t.textoPara(nomeDaFrente(item.en), item.en.set, item.en.collectorNumber)) continue;
      if (t.moldeQueVale(item.en.id, 0, meta) === "auto") out.push({ printId: item.en.id, url: item.en.image, meta });
    }
    return out;
  }, [itens, t]);
  const conferida = useDiagramacao(aConferir);
  return useMemo(() => {
    const esperando = new Set(aConferir.map((p) => p.printId));
    const situacao = (item: CartItem): Situacao => {
      const nome = nomeDaFrente(item.en);
      const tr = t.textoPara(nome, item.en.set, item.en.collectorNumber);
      let molde = t.moldeQueVale(item.en.id, 0, item.en.meta);
      const ok = molde === "auto" ? conferida(item.en.id) : true;
      const arteEspecial = ok === false;
      if (arteEspecial) molde = null;
      // enquanto a arte é conferida, a carta aparece como "verificando", não como traduzida
      const conferindo = ok === undefined && esperando.has(item.en.id);
      const podeTraduzir = Boolean(tr && molde && item.en.meta) && !conferindo;
      return {
        modo: modoDoTexto(item, podeTraduzir),
        print: impressaoEscolhida(item),
        podeTraduzir,
        carregando: t.traducao(nome) === undefined || conferindo,
        arteEspecial,
        tr,
        molde,
      };
    };
    const emPortugues = itens.reduce((n, i) => {
      const m = situacao(i).modo;
      return n + (m === "oficial" || m === "traduzida" ? i.qty : 0);
    }, 0);
    return { situacao, emPortugues };
  }, [itens, t, aConferir, conferida]);
}
