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
      // Carrinhos antigos não tinham a escolha de arte: viram "padrao".
      const lidos = salvo ? (JSON.parse(salvo) as Array<Omit<CartItem, "arte"> & { arte?: CartItem["arte"] }>) : [];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do navegador ao montar
      if (lidos.length) setItens(lidos.map((i) => ({ ...i, arte: i.arte ?? "padrao" })));
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
            lang: idioma,
            arte: "padrao",
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
    return {
      itens,
      pronto,
      quantidade,
      adicionar,
      mudarQuantidade: (id, qty) => alterar(id, (x) => ({ ...x, qty: limitar(qty) })),
      // Voltar para o inglês com a impressão em português escolhida volta para a arte em inglês.
      mudarIdioma: (id, lang) =>
        alterar(id, (x) => ({ ...x, lang, arte: lang === "en" && x.arte === "pt" ? "padrao" : x.arte })),
      // Arte em português leva o texto junto; arte em inglês mantém o idioma escolhido.
      escolherArte: (id, print) =>
        alterar(id, (x) =>
          print.lang === "pt" ? { ...x, pt: print, arte: "pt", lang: "pt" } : { ...x, en: print, arte: "en" },
        ),
      remover: (id) => setItens((atual) => atual.filter((x) => x.oracleId !== id)),
      tudoEmPortugues: () => setItens((atual) => atual.map((x) => ({ ...x, lang: "pt" }))),
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
