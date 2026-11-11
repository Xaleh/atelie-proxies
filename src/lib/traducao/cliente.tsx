"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { PedidoDeTraducao, RespostaDeTraducao } from "./servidor";
import { chaveDoMolde, chaveDoNome, chaveDoSabor, moldeParaUsar, type MetaDeImpressao, type Molde, type Traducao } from "./tipos";

/**
 * Traduções e moldes buscados pelo navegador, guardados enquanto a página
 * estiver aberta e compartilhados entre os componentes.
 */

const traducoes = new Map<string, Traducao | null>();
const sabores = new Map<string, string | null>();
const moldes = new Map<string, Molde | null>();
const pendentes = new Set<string>();
const ouvintes = new Set<() => void>();
let versao = 0;

function avisar() {
  versao++;
  ouvintes.forEach((o) => o());
}

async function pedir(faces: PedidoDeTraducao[]) {
  const novas = faces.filter((f) => {
    const k = chaveDoNome(f.nome) + "|" + chaveDoMolde(f.printId, f.face);
    return !pendentes.has(k) && !(traducoes.has(chaveDoNome(f.nome)) && moldes.has(chaveDoMolde(f.printId, f.face)));
  });
  if (!novas.length) return;
  novas.forEach((f) => pendentes.add(chaveDoNome(f.nome) + "|" + chaveDoMolde(f.printId, f.face)));
  for (let i = 0; i < novas.length; i += 300) {
    const grupo = novas.slice(i, i + 300);
    let r: RespostaDeTraducao = { traducoes: {}, sabores: {}, moldes: {} };
    try {
      const res = await fetch("/api/traducoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faces: grupo }),
      });
      if (res.ok) r = (await res.json()) as RespostaDeTraducao;
    } catch {
      // Sem resposta, as cartas ficam sem tradução nesta visita.
    }
    for (const f of grupo) {
      const nome = chaveDoNome(f.nome);
      traducoes.set(nome, r.traducoes[nome] ?? null);
      const ks = chaveDoSabor(f.nome, f.set, f.num);
      sabores.set(ks, r.sabores[ks] ?? null);
      const km = chaveDoMolde(f.printId, f.face);
      moldes.set(km, r.moldes[km] ?? null);
    }
  }
  avisar();
}

/** Esquece o que já foi buscado; usado no painel depois de salvar. */
export function esquecerTraducoes() {
  traducoes.clear();
  sabores.clear();
  moldes.clear();
  pendentes.clear();
  avisar();
}

export type Consulta = {
  /** undefined = ainda buscando; null = não existe. */
  traducao: (nome: string) => Traducao | null | undefined;
  molde: (printId: string, face: number) => Molde | null | undefined;
  /** Tradução pronta para desenhar, com a ambientação da edição certa. */
  textoPara: (
    nome: string,
    set: string,
    num: string,
  ) => { nome: string; tipo: string; texto: string; sabor: string } | null;
  /** Molde que vale para a face, ou null se a arte não aceita tradução. */
  moldeQueVale: (printId: string, face: number, meta: MetaDeImpressao | undefined) => ReturnType<typeof moldeParaUsar>;
};

export function useTraducoes(faces: PedidoDeTraducao[]): Consulta {
  const v = useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => versao,
    () => 0,
  );
  const chave = faces.map((f) => `${f.printId}#${f.face}`).sort().join(",");
  useEffect(() => {
    if (faces.length) void pedir(faces);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chave` resume as faces
  }, [chave]);

  return useMemo<Consulta>(() => {
    void v;
    return {
      traducao: (nome) => traducoes.get(chaveDoNome(nome)),
      molde: (printId, face) => moldes.get(chaveDoMolde(printId, face)),
      textoPara: (nome, set, num) => {
        const t = traducoes.get(chaveDoNome(nome));
        if (!t) return null;
        const arena = sabores.get(chaveDoSabor(nome, set, num));
        const sabor = t.fonte === "manual" && t.sabor ? t.sabor : (arena ?? t.sabor ?? "");
        return { nome: t.nome, tipo: t.tipo, texto: t.texto, sabor };
      },
      moldeQueVale: (printId, face, meta) => moldeParaUsar(meta, moldes.get(chaveDoMolde(printId, face))),
    };
  }, [v]);
}
