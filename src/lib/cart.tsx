"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loja } from "@/config/loja";
import type { CardPrint, CartItem, CatalogEntry, Lang } from "./types";

const CHAVE = "proxy-do-reis:carrinho:v1";

type Carrinho = {
  itens: CartItem[];
  /** Falso até o carrinho salvo no navegador ser lido. */
  pronto: boolean;
  quantidade: number;
  emPortugues: number;
  adicionar: (entradas: Array<{ entry: CatalogEntry; qty: number }>, idioma: Lang) => void;
  mudarQuantidade: (oracleId: string, qty: number) => void;
  mudarIdioma: (oracleId: string, lang: Lang) => void;
  escolherArte: (oracleId: string, print: CardPrint) => void;
  remover: (oracleId: string) => void;
  tudoEmPortugues: () => void;
  limpar: () => void;
};

const Ctx = createContext<Carrinho | null>(null);

function limitar(qty: number): number {
  return Math.max(1, Math.min(loja.maxCopiasPorCarta, Math.round(qty) || 1));
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<CartItem[]>([]);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(CHAVE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do navegador ao montar
      if (salvo) setItens(JSON.parse(salvo) as CartItem[]);
    } catch {
      // Carrinho ilegível ou armazenamento bloqueado: começa vazio.
    }
    setPronto(true);
  }, []);

  useEffect(() => {
    if (!pronto) return;
    try {
      window.localStorage.setItem(CHAVE, JSON.stringify(itens));
    } catch {
      // Sem armazenamento, o carrinho vale só enquanto a aba estiver aberta.
    }
  }, [itens, pronto]);

  const adicionar = useCallback<Carrinho["adicionar"]>((entradas, idioma) => {
    setItens((atual) => {
      const proximo = [...atual];
      for (const { entry, qty } of entradas) {
        const i = proximo.findIndex((x) => x.oracleId === entry.oracleId);
        if (i >= 0) proximo[i] = { ...proximo[i], qty: limitar(proximo[i].qty + qty) };
        else
          proximo.push({
            oracleId: entry.oracleId,
            name: entry.name,
            en: entry.en,
            pt: entry.pt,
            lang: idioma === "pt" && entry.pt ? "pt" : "en",
            qty: limitar(qty),
          });
      }
      return proximo;
    });
  }, []);

  const alterar = useCallback((oracleId: string, fn: (item: CartItem) => CartItem) => {
    setItens((atual) => atual.map((x) => (x.oracleId === oracleId ? fn(x) : x)));
  }, []);

  const valor = useMemo<Carrinho>(() => {
    const quantidade = itens.reduce((n, i) => n + i.qty, 0);
    const emPortugues = itens.reduce((n, i) => n + (i.lang === "pt" && i.pt ? i.qty : 0), 0);
    return {
      itens,
      pronto,
      quantidade,
      emPortugues,
      adicionar,
      mudarQuantidade: (id, qty) => alterar(id, (x) => ({ ...x, qty: limitar(qty) })),
      mudarIdioma: (id, lang) => alterar(id, (x) => ({ ...x, lang: lang === "pt" && x.pt ? "pt" : "en" })),
      escolherArte: (id, print) =>
        alterar(id, (x) => (print.lang === "pt" ? { ...x, pt: print, lang: "pt" } : { ...x, en: print, lang: "en" })),
      remover: (id) => setItens((atual) => atual.filter((x) => x.oracleId !== id)),
      tudoEmPortugues: () => setItens((atual) => atual.map((x) => (x.pt ? { ...x, lang: "pt" } : x))),
      limpar: () => setItens([]),
    };
  }, [itens, pronto, adicionar, alterar]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCart(): Carrinho {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart precisa estar dentro de <CartProvider>");
  return ctx;
}
