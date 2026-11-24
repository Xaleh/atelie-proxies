"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EscolhaDeArte } from "@/components/EscolhaDeArte";
import { gerarDxf } from "@/lib/print/dxf";
import {
  AJUSTES_PADRAO,
  CARD_H,
  CARD_W,
  POR_FOLHA,
  avisosDoLayout,
  computeLayout,
  folhasPara,
  type Ajustes,
} from "@/lib/print/layout";
import {
  completarVersos,
  copiasDaCarta,
  detalheDaFrente,
  duplicarGrupo,
  grupoDe,
  juntarFichas,
  montarSlots,
  moverSlot,
  moverUmaPosicao,
  pngDaImagemNormal,
  proximoGrupo,
  tirarGrupo,
  trocarArte,
  ORIGEM_FICHA,
  type DetalheDeImpressao,
  type PedidoDoLote,
  type Slot,
} from "@/lib/print/lote";
import {
  DPI_MINIMO,
  PREFIXO,
  apagarImagensFora,
  ehImagemPropria,
  guardarImagem,
  lerImagens,
  prepararImagem,
  slotDaImagem,
  type Encaixe,
  type Sangria,
} from "@/lib/print/imagens-proprias";
import { baixarArquivo, gerarPdf, type TraducaoDoSlot } from "@/lib/print/pdf";
import { conferirSimbolos, ehAventura, facesFisicas } from "@/lib/traducao/tipos";
import { pedidosDaFace, useTraducoes } from "@/lib/traducao/cliente";
import { useDiagramacao, type PedidoDeConferencia } from "@/lib/traducao/diagramacao";
import { previaTraduzida } from "@/lib/traducao/render";
import type { CardPrint, CatalogEntry } from "@/lib/types";

const CHAVE_AJUSTES = "proxy-do-reis:producao:ajustes:v1";
const PREFIXO_DO_LOTE = "proxy-do-reis:producao:lote:v2:";
const chaveDoLote = (pedidos: PedidoDoLote[]) => PREFIXO_DO_LOTE + (pedidos.map((p) => p.code).sort().join("+") || "avulso");
/** "Incluir as fichas dessas cartas", lembrado entre visitas. */
const CHAVE_FICHAS = "addTokens";

/** Imagens próprias usadas em algum lote guardado neste navegador (as outras podem sair do IndexedDB). */
function imagensEmUso(): Set<string> {
  const ids = new Set<string>();
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k?.startsWith(PREFIXO_DO_LOTE)) continue;
      for (const sl of ler<Slot[]>(k) ?? []) if (sl.printId?.startsWith(PREFIXO)) ids.add(sl.printId);
    }
  } catch {
    // sem armazenamento: nada para limpar
  }
  return ids;
}

function ler<T>(chave: string): T | null {
  try {
    const v = window.localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function gravar(chave: string, valor: unknown) {
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem armazenamento, o lote vale só enquanto a aba estiver aberta.
  }
}

/** Faces e imagens de impressão no Scryfall, pelo painel. */
async function buscarDetalhes(ids: string[]): Promise<DetalheDeImpressao[]> {
  const res = await fetch("/api/admin/prints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const data = (await res.json()) as { prints?: DetalheDeImpressao[]; error?: string };
  if (!res.ok) throw new Error(data.error);
  return data.prints ?? [];
}

function Numero({
  id,
  rotulo,
  valor,
  passo,
  min,
  max,
  onChange,
}: {
  id: string;
  rotulo: string;
  valor: number;
  passo: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="label">
        {rotulo}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={passo}
        min={min}
        max={max}
        value={valor}
        onChange={(e) => onChange(Math.max(min, Math.min(max, parseFloat(e.target.value) || 0)))}
        className="field min-h-11"
      />
    </div>
  );
}

function Folha({
  slots,
  folha,
  ajustes,
  imagemDe,
  onClicar,
}: {
  slots: Slot[];
  folha: number;
  ajustes: Ajustes;
  imagemDe: (sl: Slot) => string;
  /** Clique numa carta da prévia; `null` quando a carta não tem o que abrir. */
  onClicar: (sl: Slot) => (() => void) | null;
}) {
  const L = computeLayout(ajustes);
  const b = ajustes.bleed;
  const pagina = slots.slice(folha * POR_FOLHA, (folha + 1) * POR_FOLHA);
  return (
    <svg
      viewBox={`0 0 ${L.W} ${L.H}`}
      role="img"
      aria-label={`Prévia da folha ${folha + 1} como sai na impressão`}
      className="w-full rounded-md bg-white"
    >
      <rect x="0" y="0" width={L.W} height={L.H} fill="#fff" />
      <defs>
        {L.slots.map((p, k) => (
          <clipPath key={k} id={`corte-${k}`}>
            <rect x={p.x} y={p.y} width={CARD_W} height={CARD_H} rx={ajustes.radius} />
          </clipPath>
        ))}
      </defs>
      {L.slots.map((p, k) => {
        const sl = pagina[k];
        return (
          <g key={k}>
            {b > 0 && (
              <rect x={p.x - b} y={p.y - b} width={CARD_W + 2 * b} height={CARD_H + 2 * b} fill={sl ? "#222" : "#eef1f3"} />
            )}
            {sl ? (
              <image
                href={imagemDe(sl)}
                x={p.x}
                y={p.y}
                width={CARD_W}
                height={CARD_H}
                preserveAspectRatio="none"
                clipPath={`url(#corte-${k})`}
                className={onClicar(sl) ? "cursor-pointer" : undefined}
                onClick={onClicar(sl) ?? undefined}
              >
                <title>{onClicar(sl) ? `${sl.nome}: clique para trocar a arte` : sl.nome}</title>
              </image>
            ) : (
              <rect x={p.x} y={p.y} width={CARD_W} height={CARD_H} rx={ajustes.radius} fill="#f6f7f8" />
            )}
            <rect x={p.x} y={p.y} width={CARD_W} height={CARD_H} rx={ajustes.radius} fill="none" stroke="#8c2703" strokeWidth="0.5" strokeDasharray="2 1.2" />
          </g>
        );
      })}
      {L.marks.map((m, i) => (
        <rect key={i} x={m.x} y={m.y} width={m.w} height={m.h} fill="#000" />
      ))}
    </svg>
  );
}

function Avulsa({
  onAdd,
  comFichas,
  onComFichas,
}: {
  onAdd: (entry: CatalogEntry, lang: "en" | "pt") => void;
  comFichas: boolean;
  onComFichas: (v: boolean) => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<CatalogEntry[]>([]);
  const [estado, setEstado] = useState("");

  useEffect(() => {
    const q = termo.trim();
    if (q.length < 2) return;
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      setEstado("Buscando…");
      try {
        const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`, { signal: controle.signal });
        const data = (await res.json()) as { entries?: CatalogEntry[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "A busca falhou.");
        setResultados(data.entries ?? []);
        setEstado(data.entries?.length ? "" : "Nenhuma carta com esse nome.");
      } catch (e) {
        if (!controle.signal.aborted) setEstado((e as Error).message);
      }
    }, 350);
    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [termo]);

  const visiveis = termo.trim().length >= 2 ? resultados : [];

  return (
    <div className="panel flex flex-col gap-3 p-5">
      <h2 className="text-[15px] font-bold">Adicionar carta avulsa</h2>
      <p className="text-muted">Para completar as vagas da última folha ou incluir algo que a cliente esqueceu.</p>
      <div>
        <label htmlFor="avulsa" className="label">
          Nome da carta
        </label>
        <input id="avulsa" type="search" autoComplete="off" className="field min-h-11" value={termo} onChange={(e) => setTermo(e.target.value)} />
      </div>
      <label className="flex min-h-11 items-center gap-2.5">
        <input type="checkbox" checked={comFichas} onChange={(e) => onComFichas(e.target.checked)} />
        Incluir as fichas dessas cartas
      </label>
      <div aria-live="polite" className="min-h-5 text-muted">
        {estado}
      </div>
      {visiveis.length > 0 && (
        <ul className="max-h-64 overflow-y-auto rounded-[10px] border border-line">
          {visiveis.map((entry) => (
            <li key={entry.oracleId} className="flex items-center gap-2 border-b border-line p-2 last:border-b-0">
              <span className="min-w-0 flex-1 truncate">{entry.pt?.printedName ?? entry.name}</span>
              <button type="button" className="btn btn-ghost min-h-11 px-3 text-xs" onClick={() => onAdd(entry, "en")}>
                + EN
              </button>
              {entry.pt && (
                <button type="button" className="btn btn-ghost min-h-11 px-3 text-xs" onClick={() => onAdd(entry, "pt")}>
                  + PT
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Seção "Imagens próprias": a arte pronta de uma carta, enviada do computador. */
function ImagensProprias({ onAdd }: { onAdd: (imagens: { id: string; nome: string; url: string }[], copias: number) => void }) {
  const [copias, setCopias] = useState(1);
  const [sangria, setSangria] = useState<Sangria>("auto");
  const [encaixe, setEncaixe] = useState<Encaixe>("cortar");
  const [sobre, setSobre] = useState(false);
  const [trabalhando, setTrabalhando] = useState(false);
  const [mensagens, setMensagens] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  async function receber(lista: FileList | File[]) {
    const arquivos = [...lista];
    if (!arquivos.length) return;
    setTrabalhando(true);
    setMensagens([`Preparando ${arquivos.length} ${arquivos.length === 1 ? "imagem" : "imagens"}…`]);
    const prontas: { id: string; nome: string; url: string }[] = [];
    const baixas: string[] = [];
    const ruins: string[] = [];
    for (const arq of arquivos) {
      if (!/^image\/(png|jpeg|webp)$/.test(arq.type) && !/\.(jpe?g|png|webp)$/i.test(arq.name)) {
        ruins.push(arq.name);
        continue;
      }
      try {
        const img = await prepararImagem(arq, sangria, encaixe);
        await guardarImagem(img).catch(() => undefined); // sem IndexedDB, a imagem vale só nesta aba
        prontas.push({ id: img.id, nome: img.nome, url: URL.createObjectURL(img.blob) });
        if (img.dpi < DPI_MINIMO) baixas.push(`${arq.name} (${img.dpi} dpi)`);
      } catch {
        ruins.push(arq.name);
      }
    }
    if (prontas.length) onAdd(prontas, copias);
    const n = prontas.length * copias;
    const msgs: string[] = [];
    if (n) msgs.push(`${n} ${n === 1 ? "carta adicionada" : "cartas adicionadas"} no fim do lote.`);
    if (baixas.length)
      msgs.push(`Resolução baixa: ${baixas.join(", ")}. O ideal é a partir de 300 dpi (cerca de 745 × 1040 pixels); abaixo disso a carta pode sair borrada.`);
    if (ruins.length) msgs.push(`Não consegui abrir: ${ruins.join(", ")}. Envie em JPG, PNG ou WEBP.`);
    setMensagens(msgs);
    setTrabalhando(false);
  }

  return (
    <div className="panel flex flex-col gap-3 p-5">
      <h2 className="text-[15px] font-bold">Imagens próprias</h2>
      <p className="text-muted">A arte pronta de uma carta, do seu computador. Ela entra no fim do lote como está, sem tradução.</p>
      <div
        className={`flex flex-col items-center gap-1 rounded-xl border-2 border-dashed p-5 text-center ${sobre ? "border-gold bg-gold/10" : "border-edge"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSobre(false);
          if (!trabalhando) void receber(e.dataTransfer.files);
        }}
      >
        <button type="button" className="btn btn-ghost px-4 text-sm" disabled={trabalhando} onClick={() => input.current?.click()}>
          Escolher imagens
        </button>
        <span className="text-sm text-muted">ou arraste os arquivos para cá</span>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-label="Imagens das cartas"
          onChange={(e) => {
            if (e.target.files) void receber(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <Numero id="copias-img" rotulo="Cópias de cada" valor={copias} passo={1} min={1} max={99} onChange={(n) => setCopias(Math.round(n) || 1)} />
      <div>
        <label htmlFor="sangria-img" className="label">
          Sangria na imagem
        </label>
        <select id="sangria-img" className="field min-h-11" value={sangria} onChange={(e) => setSangria(e.target.value as Sangria)}>
          <option value="auto">Automática</option>
          <option value="sem">Sem sangria</option>
          <option value="mpc">Com 3 mm (MPC)</option>
        </select>
      </div>
      <div>
        <label htmlFor="encaixe-img" className="label">
          Se a imagem não tiver o formato de carta
        </label>
        <select id="encaixe-img" className="field min-h-11" value={encaixe} onChange={(e) => setEncaixe(e.target.value as Encaixe)}>
          <option value="cortar">Cortar as sobras</option>
          <option value="encaixar">Encaixar inteira, com borda preta</option>
        </select>
      </div>
      <div aria-live="polite" className="flex flex-col gap-1 text-muted">
        {mensagens.map((m) => (
          <p key={m}>{m}</p>
        ))}
      </div>
    </div>
  );
}

export function Producao({ pedidos }: { pedidos: PedidoDoLote[] }) {
  const chave = useMemo(() => chaveDoLote(pedidos), [pedidos]);
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_PADRAO);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [detalhes, setDetalhes] = useState<Map<string, DetalheDeImpressao>>(new Map());
  const [folha, setFolha] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [progresso, setProgresso] = useState<number | null>(null);
  const arrastando = useRef<number | null>(null);
  /** Carta com a troca de arte aberta (pelo grupo) e se a troca vale para todas as cópias. */
  const [trocando, setTrocando] = useState<{ grupo: number; todas: boolean } | null>(null);
  const [comFichas, setComFichas] = useState(true);
  const [statusFichas, setStatusFichas] = useState("");
  const [buscandoFichas, setBuscandoFichas] = useState(false);

  // Abre o lote: ajustes e ordem salvos neste navegador, mais os detalhes das cartas no Scryfall.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const ajustesSalvos = { ...AJUSTES_PADRAO, ...(ler<Partial<Ajustes>>(CHAVE_AJUSTES) ?? {}) };
      const loteSalvo = ler<Slot[]>(chave);
      const ids = [
        ...new Set([...pedidos.flatMap((p) => p.itens.map((i) => i.printId)), ...(loteSalvo ?? []).map((s) => s.printId)]),
      ].filter((id) => !id.startsWith(PREFIXO)); // imagens próprias não estão no Scryfall
      const mapa = new Map<string, DetalheDeImpressao>();
      if (ids.length) {
        try {
          const res = await fetch("/api/admin/prints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
          const data = (await res.json()) as { prints?: DetalheDeImpressao[]; error?: string };
          if (!res.ok) throw new Error(data.error);
          for (const d of data.prints ?? []) mapa.set(d.id, d);
        } catch {
          if (vivo) setAviso("Não consegui consultar o Scryfall. O lote abriu só com a frente das cartas; recarregue para tentar de novo.");
        }
      }
      // imagens próprias: o endereço da imagem vale só enquanto a aba está aberta; ao reabrir, vem do IndexedDB
      let lote = loteSalvo;
      const idsProprios = (loteSalvo ?? []).filter(ehImagemPropria).map((sl) => sl.printId);
      if (lote && idsProprios.length) {
        const guardadas = await lerImagens(idsProprios).catch(() => new Map<string, { nome: string; blob: Blob }>());
        const urls = new Map([...guardadas].map(([id, g]) => [id, URL.createObjectURL(g.blob)]));
        const faltam = new Set(idsProprios.filter((id) => !urls.has(id)));
        lote = lote
          .filter((sl) => !faltam.has(sl.printId))
          .map((sl) => (urls.has(sl.printId) ? { ...sl, thumb: urls.get(sl.printId)!, png: urls.get(sl.printId)! } : sl));
        if (faltam.size && vivo)
          setAviso(`${faltam.size} ${faltam.size === 1 ? "imagem própria saiu" : "imagens próprias saíram"} do lote: não estão guardadas neste navegador. Envie de novo em Imagens próprias.`);
      }
      if (!vivo) return;
      setComFichas(ler<boolean>(CHAVE_FICHAS) ?? true);
      setAjustes(ajustesSalvos);
      setDetalhes(mapa);
      // lotes guardados antes de o verso ser obrigatório ganham o verso logo depois da frente
      setSlots(lote ? completarVersos(lote, mapa) : montarSlots(pedidos, mapa));
    })();
    return () => {
      vivo = false;
    };
  }, [chave, pedidos]);

  useEffect(() => {
    if (!slots) return;
    gravar(chave, slots);
    // as imagens próprias que saíram de todos os lotes deste navegador saem também do IndexedDB
    const manter = imagensEmUso();
    for (const sl of slots) if (ehImagemPropria(sl)) manter.add(sl.printId);
    void apagarImagensFora(manter).catch(() => undefined);
  }, [chave, slots]);

  const lista = slots ?? [];
  const folhas = folhasPara(lista.length);
  const folhaAtual = Math.min(folha, folhas - 1);
  const livres = lista.length ? folhas * POR_FOLHA - lista.length : 0;
  const avisos = avisosDoLayout(ajustes);
  const L = computeLayout(ajustes);

  // Tradução das cartas com arte em inglês: as marcadas para sair em português
  // e as que podem ser marcadas.
  const emIngles = (sl: Slot) => sl.lang === "en" || sl.traduzida;
  const facesParaTraduzir = useMemo(() => {
    const vistas = new Map<string, { oracleId: string; nome: string; set: string; num: string; printId: string; face: number }>();
    for (const sl of slots ?? []) {
      if (!(sl.lang === "en" || sl.traduzida) || !sl.oracleId) continue;
      // a carta de aventura pede as duas partes: a criatura e a aventura
      const pedidos = pedidosDaFace({
        oracleId: sl.oracleId,
        meta: detalhes.get(sl.printId)?.meta,
        face: sl.face,
        nome: sl.nomeEn,
        set: sl.set,
        num: sl.num,
        printId: sl.printId,
      });
      for (const p of pedidos) vistas.set(`${p.printId}#${p.face}`, p);
    }
    return [...vistas.values()];
  }, [slots, detalhes]);
  const t = useTraducoes(facesParaTraduzir);

  // Artes que vão receber o molde automático têm a imagem da frente conferida:
  // as de diagramação especial (quadrinho, arte que ocupa a carta toda) ficam em inglês.
  const aConferir: PedidoDeConferencia[] = [];
  for (const sl of lista) {
    const meta = detalhes.get(sl.printId)?.meta;
    if (sl.traduzida && sl.face === 0 && meta && t.moldeQueVale(sl.printId, 0, meta) === "auto") aConferir.push({ printId: sl.printId, url: sl.thumb, meta });
  }
  const conferida = useDiagramacao(aConferir);
  const arteEspecial = (sl: Slot) =>
    t.moldeQueVale(sl.printId, sl.face, detalhes.get(sl.printId)?.meta) === "auto" && conferida(sl.printId) === false;

  const traducaoDe = (sl: Slot): TraducaoDoSlot | null => {
    if (!sl.traduzida) return null;
    const meta = detalhes.get(sl.printId)?.meta;
    const tr = t.textoDaFace(meta, sl.face, sl.nomeEn, sl.set, sl.num);
    const molde = t.moldeQueVale(sl.printId, sl.face, meta);
    return meta && tr && molde && !arteEspecial(sl) ? { meta, face: sl.face, tr, molde } : null;
  };
  const situacaoPT = (sl: Slot): string | null => {
    if (!sl.traduzida) return null;
    const meta = detalhes.get(sl.printId)?.meta;
    if (t.buscando(meta, sl.face, sl.nomeEn)) return "PT · verificando";
    if (!t.textoDaFace(meta, sl.face, sl.nomeEn, sl.set, sl.num)) return "PT · sem tradução";
    if (!t.moldeQueVale(sl.printId, sl.face, detalhes.get(sl.printId)?.meta)) return "PT · sem molde";
    if (arteEspecial(sl)) return "PT · arte especial";
    return "PT traduzida";
  };
  const semTraducao = lista.filter((sl) => sl.traduzida && !traducaoDe(sl)).length;
  // cartas pedidas em português cuja arte tem diagramação especial: saem em inglês
  const ficamEmIngles = [...new Set(lista.filter((sl) => sl.traduzida && arteEspecial(sl)).map((sl) => sl.nome))];
  // Tradução com quantidade de símbolos ({T}, custos…) diferente do original: o site não sabe qual falta.
  const simbolosDiferentes = [
    ...new Set(
      lista
        .filter((sl) => {
          const info = traducaoDe(sl);
          if (!info) return false;
          const partes = ehAventura(info.meta) ? info.meta.faces : [info.meta.faces[info.face] ?? info.meta.faces[0]];
          const textos = [info.tr.texto, info.tr.aventura?.texto ?? ""];
          return partes.some((f, i) => i < 2 && !conferirSimbolos(textos[i], f.texto).ok);
        })
        .map((sl) => sl.nomeEn),
    ),
  ];

  const [previas, setPrevias] = useState<Record<string, string>>({});
  const chaveDaPrevia = (sl: Slot, info: TraducaoDoSlot) => JSON.stringify([sl.thumb, info.face, info.tr, info.molde]);
  const pedidasDePrevia = lista
    .map((sl) => {
      const info = traducaoDe(sl);
      return info ? { sl, info, chave: chaveDaPrevia(sl, info) } : null;
    })
    .filter((x): x is { sl: Slot; info: TraducaoDoSlot; chave: string } => x !== null);
  const chavesDePrevia = [...new Set(pedidasDePrevia.map((p) => p.chave))].join("\n");
  useEffect(() => {
    let vivo = true;
    const feitas = new Set<string>();
    for (const { sl, info, chave } of pedidasDePrevia) {
      if (feitas.has(chave)) continue;
      feitas.add(chave);
      previaTraduzida(sl.thumb, info.meta, info.face, info.tr, info.molde)
        .then((src) => vivo && setPrevias((atual) => (atual[chave] ? atual : { ...atual, [chave]: src })))
        .catch(() => undefined);
    }
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chavesDePrevia` resume as prévias pedidas
  }, [chavesDePrevia]);
  const imagemDe = (sl: Slot) => {
    const info = traducaoDe(sl);
    return (info && previas[chaveDaPrevia(sl, info)]) || sl.thumb;
  };

  function mudar<K extends keyof Ajustes>(k: K, v: Ajustes[K]) {
    const novo = { ...ajustes, [k]: v };
    setAjustes(novo);
    gravar(CHAVE_AJUSTES, novo);
  }

  async function adicionarAvulsa(entry: CatalogEntry, lang: "en" | "pt") {
    const print = lang === "pt" && entry.pt ? entry.pt : entry.en;
    const grupo = proximoGrupo(lista);
    const frente: Slot = {
      uid: `${grupo}-0`,
      grupo,
      printId: print.id,
      oracleId: print.oracleId,
      face: 0,
      nomeEn: print.meta?.faces[0]?.nome ?? print.name.split(" // ")[0],
      set: print.set,
      num: print.collectorNumber,
      traduzida: false,
      nome: print.printedName ?? print.name,
      lang,
      thumb: print.image,
      png: pngDaImagemNormal(print.image),
      origem: "avulsa",
    };
    setSlots(completarVersos([...lista, frente], detalhes));
    if (comFichas) void adicionarFichas([{ printId: print.id, lang }]);
    if (detalhes.has(print.id)) return;
    if (facesFisicas(print.meta) < 2) {
      // a moldura da carta fica à mão para o botão PT funcionar sem recarregar
      setDetalhes((atual) => new Map(atual).set(print.id, detalheDaFrente(print)));
      return;
    }
    // carta de duas faces que ainda não estava no lote: busca o verso
    try {
      const res = await fetch("/api/admin/prints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [print.id] }),
      });
      const data = (await res.json()) as { prints?: DetalheDeImpressao[]; error?: string };
      if (!res.ok || !data.prints?.length) throw new Error(data.error);
      const mapa = new Map(detalhes);
      for (const d of data.prints) mapa.set(d.id, d);
      setDetalhes(mapa);
      setSlots((atual) => (atual ? completarVersos(atual, mapa) : atual));
    } catch {
      setAviso(`Não consegui buscar o verso de ${print.name}. Tire a carta e adicione de novo para tentar outra vez.`);
    }
  }

  /**
   * Procura as fichas (tokens) que as cartas criam e põe no fim do lote só as
   * que ainda não estão nele. Sem `cartas`, vale para o lote inteiro.
   */
  async function adicionarFichas(cartas?: { printId: string; lang: string }[]) {
    const fonte = (cartas ?? lista.filter((sl) => sl.face === 0 && sl.origem !== ORIGEM_FICHA)).filter((c) => !c.printId.startsWith(PREFIXO));
    if (!fonte.length) {
      setStatusFichas("Nenhuma ficha nova: as cartas do lote não criam fichas, ou elas já estão no lote.");
      return;
    }
    setBuscandoFichas(true);
    setStatusFichas("Procurando as fichas…");
    try {
      const idiomas: Record<string, string> = {};
      for (const c of fonte) if (c.lang === "pt" || !idiomas[c.printId]) idiomas[c.printId] = c.lang;
      const res = await fetch("/api/admin/fichas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Object.keys(idiomas), idiomas }),
      });
      const data = (await res.json().catch(() => ({}))) as { fichas?: DetalheDeImpressao[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Não consegui procurar as fichas.");
      const fichas = data.fichas ?? [];
      setDetalhes((atual) => {
        const mapa = new Map(atual);
        for (const f of fichas) mapa.set(f.id, f);
        return mapa;
      });
      // a conta da mensagem usa o lote da tela; a junção de verdade usa o lote mais recente
      const novas = juntarFichas(lista, fichas).novas;
      setSlots((atual) => (atual ? juntarFichas(atual, fichas).slots : atual));
      setStatusFichas(
        novas
          ? `${novas} ${novas === 1 ? "ficha adicionada" : "fichas adicionadas"} no fim do lote.`
          : "Nenhuma ficha nova: as cartas do lote não criam fichas, ou elas já estão no lote.",
      );
    } catch (e) {
      setStatusFichas((e as Error).message);
    } finally {
      setBuscandoFichas(false);
    }
  }

  function adicionarImagens(imagens: { id: string; nome: string; url: string }[], copias: number) {
    setSlots((atual) => {
      const base = atual ?? [];
      let grupo = proximoGrupo(base);
      const novas = imagens.flatMap((img) => Array.from({ length: copias }, () => slotDaImagem(img, img.url, grupo++)));
      return [...base, ...novas];
    });
  }

  // A troca de arte precisa do oracle_id; lotes antigos podem ter guardado a carta sem ele.
  const oracleDe = (sl: Slot) => sl.oracleId || detalhes.get(sl.printId)?.oracleId || "";
  const abrirTroca = (sl: Slot) => {
    if (oracleDe(sl)) setTrocando({ grupo: sl.grupo, todas: false });
  };
  const posicaoTrocando = trocando ? lista.findIndex((sl) => sl.grupo === trocando.grupo) : -1;
  const cartaTrocando = posicaoTrocando >= 0 ? lista[posicaoTrocando] : null;
  // as setas da janela de artes passam pelas cartas do lote (a frente de cada cópia), na ordem das folhas
  const frentes = lista.filter((sl) => sl.face === 0 && oracleDe(sl));
  const navegacaoDeArtes = {
    posicao: trocando ? frentes.findIndex((sl) => sl.grupo === trocando.grupo) : -1,
    total: frentes.length,
    irPara: (n: number) => {
      const sl = frentes[n];
      if (sl) setTrocando({ grupo: sl.grupo, todas: false });
    },
  };

  async function escolherArte(print: CardPrint) {
    if (!trocando) return;
    const { grupo, todas } = trocando;
    let nova = detalhes.get(print.id);
    if (!nova?.faces.length) {
      if (facesFisicas(print.meta) < 2) nova = detalheDaFrente(print);
      else {
        // carta de duas faces: a busca de artes só traz a frente
        try {
          nova = (await buscarDetalhes([print.id])).find((d) => d.id === print.id);
          if (!nova?.faces.length) throw new Error();
        } catch {
          setAviso(`Não consegui buscar o verso de ${print.name} nesta arte. A carta ficou com a arte anterior; tente trocar de novo.`);
          return;
        }
      }
      const detalhe = nova;
      setDetalhes((atual) => new Map(atual).set(detalhe.id, detalhe));
    }
    const detalhe = nova;
    setSlots((atual) => {
      if (!atual) return atual;
      const i = atual.findIndex((sl) => sl.grupo === grupo);
      return i < 0 ? atual : trocarArte(atual, i, detalhe, todas);
    });
  }

  async function baixarPdf() {
    if (
      semTraducao > 0 &&
      !window.confirm(
        `${semTraducao} ${semTraducao === 1 ? "carta marcada" : "cartas marcadas"} para sair em português ainda não ${semTraducao === 1 ? "tem" : "têm"} tradução ou molde e ${semTraducao === 1 ? "vai" : "vão"} sair em inglês. Gerar o PDF mesmo assim?`,
      )
    )
      return;
    setStatus("Preparando o PDF…");
    setProgresso(0);
    try {
      const { pdf, emIngles } = await gerarPdf(lista, ajustes, (feitas, total, nome) => {
        setProgresso(feitas / total);
        if (nome) setStatus(`Preparando carta ${feitas + 1} de ${total}: ${nome}`);
      }, traducaoDe);
      const nome = pedidos.map((p) => p.code).join("-") || "avulso";
      baixarArquivo(pdf, `proxies-${nome}-${new Date().toISOString().slice(0, 10)}.pdf`);
      setStatus(
        `PDF pronto: ${lista.length} cartas em ${folhas} ${folhas > 1 ? "folhas" : "folha"}. Imprima em tamanho real (100%).` +
          (emIngles.length
            ? ` Atenção: ${emIngles.join(", ")} ${emIngles.length === 1 ? "saiu" : "saíram"} em inglês, porque a arte tem diagramação especial.`
            : ""),
      );
    } catch (e) {
      setStatus((e as Error).message || "Não consegui gerar o PDF.");
    } finally {
      setProgresso(null);
    }
  }

  if (!slots) return <p className="panel p-8 text-center text-muted">Abrindo o lote…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base">
          {lista.length ? (
            <>
              <strong>
                {lista.length} {lista.length === 1 ? "carta" : "cartas"}
              </strong>{" "}
              em{" "}
              <strong>
                {folhas} {folhas > 1 ? "folhas" : "folha"}
              </strong>
              {livres > 0
                ? ` · ${livres} ${livres > 1 ? "vagas livres" : "vaga livre"} na última folha`
                : " · todas as folhas cheias"}
            </>
          ) : (
            "O lote está vazio. Abra um pedido pela lista ou adicione cartas avulsas."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
          {pedidos.map((p) => (
            <Link key={p.code} href={`/admin/pedidos/${p.code}`} className="py-2 font-mono text-cream underline hover:text-gold-soft">
              {p.code}
            </Link>
          ))}
        </div>
      </div>

      {aviso && (
        <p role="status" className="panel border-gold p-4">
          {aviso}
        </p>
      )}
      {ficamEmIngles.length > 0 && (
        <p role="status" className="panel border-gold p-4">
          Ficam em inglês: {ficamEmIngles.join(", ")}. A arte escolhida tem diagramação especial (arte que ocupa a carta toda, moldura de
          quadrinho…). Para traduzir, clique na carta (ou use Arte) e escolha uma impressão com moldura comum.
        </p>
      )}
      {semTraducao > 0 && (
        <p role="status" className="panel border-gold p-4">
          {semTraducao} {semTraducao === 1 ? "carta marcada" : "cartas marcadas"} para sair em português{" "}
          {semTraducao === 1 ? "não tem" : "não têm"} tradução ou molde. Revise em{" "}
          <Link href="/admin/traducoes" className="underline">
            Traduções
          </Link>{" "}
          ou marque o molde da arte no botão Molde. Nas marcadas como &quot;arte especial&quot; (moldura de quadrinho, arte que
          ocupa a carta toda), o molde automático não serve: troque a arte clicando na carta ou marque o molde à mão.
        </p>
      )}
      {simbolosDiferentes.length > 0 && (
        <p role="status" className="panel border-gold p-4">
          Confira os símbolos ({"{T}"}, custos de mana…) antes de imprimir: a tradução de {simbolosDiferentes.join(", ")} tem uma quantidade
          diferente da carta original. Revise em{" "}
          <Link href="/admin/traducoes" className="underline">
            Traduções
          </Link>
          .
        </p>
      )}
      {avisos.map((a) => (
        <p key={a.texto} role="alert" className={`rounded-xl border p-4 ${a.tipo === "erro" ? "border-rust bg-rust/30" : "border-gold"}`}>
          {a.texto}
        </p>
      ))}

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">
                Folha {folhaAtual + 1} de {folhas}
              </h2>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost px-4 text-sm" disabled={folhaAtual === 0} onClick={() => setFolha(folhaAtual - 1)}>
                  Folha anterior
                </button>
                <button type="button" className="btn btn-ghost px-4 text-sm" disabled={folhaAtual >= folhas - 1} onClick={() => setFolha(folhaAtual + 1)}>
                  Próxima folha
                </button>
              </div>
            </div>
            <Folha slots={lista} folha={folhaAtual} ajustes={ajustes} imagemDe={imagemDe} onClicar={(sl) => (oracleDe(sl) ? () => abrirTroca(sl) : null)} />
            <p className="text-muted">A4 em paisagem, 8 cartas por folha. O tracejado é a linha de corte.</p>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">Montar folhas</h2>
            <p className="-mt-2 text-muted">Clique numa carta para trocar a arte. Arraste para mudar de lugar.</p>
            {Array.from({ length: folhas }, (_, f) => (
              <section key={f} aria-label={`Folha ${f + 1}`} className={`panel p-3 ${f === folhaAtual ? "border-gold" : ""}`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-semibold">
                    Folha {f + 1} · {Math.min(POR_FOLHA, lista.length - f * POR_FOLHA)}/{POR_FOLHA}
                  </span>
                  <button type="button" className="min-h-11 cursor-pointer px-2 underline hover:text-gold-soft" onClick={() => setFolha(f)}>
                    Ver na prévia
                  </button>
                </div>
                <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Array.from({ length: POR_FOLHA }, (_, j) => {
                    const i = f * POR_FOLHA + j;
                    const sl = lista[i];
                    if (!sl) {
                      return (
                        <li
                          key={`vaga-${j}`}
                          className="flex aspect-[63/88] items-center justify-center rounded-lg border-[1.5px] border-dashed border-edge text-xs text-muted"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (arrastando.current != null) setSlots(moverSlot(lista, arrastando.current, lista.length - 1));
                          }}
                        >
                          Vaga livre
                        </li>
                      );
                    }
                    return (
                      <li
                        key={sl.uid}
                        draggable
                        title={`${sl.nome} · ${sl.origem}`}
                        className="flex cursor-grab flex-col gap-1"
                        onDragStart={(e) => {
                          arrastando.current = i;
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => (arrastando.current = null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (arrastando.current != null) setSlots(moverSlot(lista, arrastando.current, i));
                        }}
                      >
                        {oracleDe(sl) ? (
                          // div em vez de button: no Firefox, um button não deixa arrastar a carta
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={`Trocar a arte de ${sl.nome}`}
                            className="cursor-pointer rounded-lg ring-gold hover:ring-2"
                            onClick={() => abrirTroca(sl)}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter" && e.key !== " ") return;
                              e.preventDefault();
                              abrirTroca(sl);
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={imagemDe(sl)} alt={sl.nome} loading="lazy" draggable={false} data-lupa className="aspect-[63/88] w-full rounded-lg bg-ink object-cover" />
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imagemDe(sl)} alt={sl.nome} loading="lazy" draggable={false} data-lupa className="aspect-[63/88] w-full rounded-lg bg-ink object-cover" />
                        )}
                        <span className="truncate text-xs text-muted">
                          {[sl.face > 0 ? "verso" : "", ehImagemPropria(sl) ? "" : (situacaoPT(sl) ?? sl.lang.toUpperCase()), sl.origem].filter(Boolean).join(" · ")}
                        </span>
                        {emIngles(sl) && (
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              aria-pressed={sl.traduzida}
                              aria-label={`Texto em português em ${sl.nome}`}
                              className={`min-h-11 cursor-pointer rounded-md border text-xs font-bold ${sl.traduzida ? "border-gold bg-gold text-ink" : "border-edge"}`}
                              onClick={() =>
                                setSlots(lista.map((o) => (o.grupo === sl.grupo ? { ...o, traduzida: !sl.traduzida, lang: sl.traduzida ? "en" : "pt" } : o)))
                              }
                            >
                              PT
                            </button>
                            <Link
                              href={`/admin/moldes/${sl.printId}?face=${sl.face}`}
                              target="_blank"
                              className="flex min-h-11 items-center justify-center rounded-md border border-edge text-xs font-bold hover:border-cream"
                            >
                              Molde
                            </Link>
                          </div>
                        )}
                        <div className="grid grid-cols-4 gap-1">
                          <button type="button" aria-label={`Mover ${sl.nome} para trás`} className="min-h-11 cursor-pointer rounded-md border border-edge text-sm disabled:opacity-40" disabled={grupoDe(lista, i)[0] === 0} onClick={() => setSlots(moverUmaPosicao(lista, i, -1))}>
                            ◀
                          </button>
                          <button
                            type="button"
                            aria-label={`Mais uma cópia de ${sl.nome}`}
                            className="min-h-11 cursor-pointer rounded-md border border-edge text-xs font-bold"
                            onClick={() => setSlots(duplicarGrupo(lista, i))}
                          >
                            +1
                          </button>
                          <button type="button" aria-label={`Tirar ${sl.nome}`} className="min-h-11 cursor-pointer rounded-md border border-edge text-sm" onClick={() => setSlots(tirarGrupo(lista, i))}>
                            ✕
                          </button>
                          <button type="button" aria-label={`Mover ${sl.nome} para frente`} className="min-h-11 cursor-pointer rounded-md border border-edge text-sm disabled:opacity-40" disabled={grupoDe(lista, i)[1] === lista.length - 1} onClick={() => setSlots(moverUmaPosicao(lista, i, 1))}>
                            ▶
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <div className="panel flex flex-col gap-3 p-5">
            <button type="button" className="btn btn-gold min-h-[52px] text-base" disabled={!lista.length || progresso != null || avisos.some((a) => a.tipo === "erro")} onClick={baixarPdf}>
              Baixar PDF para impressão
            </button>
            {progresso != null && (
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-gold transition-[width]" style={{ width: `${Math.round(progresso * 100)}%` }} />
              </div>
            )}
            <p role="status" className="min-h-5 text-muted">
              {status}
            </p>
            <button type="button" className="btn btn-ghost" onClick={() => baixarArquivo(new Blob([gerarDxf(ajustes)], { type: "application/dxf" }), "gabarito-A4-paisagem-8cartas.dxf")}>
              Baixar gabarito de corte (DXF)
            </button>
            <button
              type="button"
              className="min-h-11 cursor-pointer self-start underline hover:text-gold-soft"
              onClick={() => {
                if (window.confirm("Desfazer as mudanças e voltar ao conteúdo dos pedidos?")) {
                  setSlots(montarSlots(pedidos, detalhes));
                  setFolha(0);
                }
              }}
            >
              Recomeçar o lote
            </button>
          </div>

          <div className="panel flex flex-col gap-3 p-5">
            <h2 className="text-[15px] font-bold">Fichas</h2>
            <p className="text-muted">Procura as fichas (tokens) que as cartas do lote criam e põe no fim só as que ainda não estão nele.</p>
            <button type="button" className="btn btn-ghost" disabled={buscandoFichas || !lista.length} onClick={() => void adicionarFichas()}>
              Adicionar fichas das cartas
            </button>
            <p role="status" className="min-h-5 text-muted">
              {statusFichas}
            </p>
          </div>

          <div className="panel flex flex-col gap-3 p-5">
            <h2 className="text-[15px] font-bold">Ajuste de corte</h2>
            <p className="text-muted">
              Se o corte sair deslocado igual em todas as cartas, mova a impressão. Positivo vai para a direita e para
              baixo. O gabarito não muda.
            </p>
            <div className="flex gap-2.5">
              <Numero id="offx" rotulo="Horizontal (mm)" valor={ajustes.offX} passo={0.1} min={-10} max={10} onChange={(n) => mudar("offX", n)} />
              <Numero id="offy" rotulo="Vertical (mm)" valor={ajustes.offY} passo={0.1} min={-10} max={10} onChange={(n) => mudar("offY", n)} />
            </div>
          </div>

          <details className="panel p-5">
            <summary className="min-h-11 cursor-pointer text-[15px] font-bold">Opções de impressão</summary>
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex gap-2.5">
                <Numero id="bleed" rotulo="Sangria (mm)" valor={ajustes.bleed} passo={0.1} min={0} max={3} onChange={(n) => mudar("bleed", n)} />
                <Numero id="radius" rotulo="Canto do corte (mm)" valor={ajustes.radius} passo={0.1} min={0} max={10} onChange={(n) => mudar("radius", n)} />
              </div>
              <div className="flex gap-2.5">
                <div className="min-w-0 flex-1">
                  <label htmlFor="dpi" className="label">
                    Resolução
                  </label>
                  <select id="dpi" className="field min-h-11" value={ajustes.dpi} onChange={(e) => mudar("dpi", Number(e.target.value))}>
                    <option value={600}>600 dpi</option>
                    <option value={900}>900 dpi</option>
                    <option value={1200}>1200 dpi</option>
                  </select>
                </div>
                <div className="min-w-0 flex-1">
                  <label htmlFor="qual" className="label">
                    Qualidade do JPEG
                  </label>
                  <select id="qual" className="field min-h-11" value={ajustes.qual} onChange={(e) => mudar("qual", Number(e.target.value))}>
                    <option value={0.85}>Menor arquivo</option>
                    <option value={0.92}>Padrão</option>
                    <option value={0.98}>Máxima</option>
                  </select>
                </div>
              </div>
              {(
                [
                  ["marks", "Marcas de registro da Silhouette"],
                  ["crop", "Marcas de corte para guilhotina"],
                ] as const
              ).map(([k, rotulo]) => (
                <label key={k} className="flex min-h-11 items-center gap-2.5">
                  <input type="checkbox" checked={ajustes[k]} onChange={(e) => mudar(k, e.target.checked)} />
                  {rotulo}
                </label>
              ))}
            </div>
          </details>

          <Avulsa
            onAdd={adicionarAvulsa}
            comFichas={comFichas}
            onComFichas={(v) => {
              setComFichas(v);
              gravar(CHAVE_FICHAS, v);
            }}
          />

          <ImagensProprias onAdd={adicionarImagens} />

          <details className="panel p-5">
            <summary className="min-h-11 cursor-pointer text-[15px] font-bold">Gabarito para o Silhouette Studio</summary>
            <p className="mt-2 text-muted">
              Página A4 em paisagem. Marcas de registro tipo 1: comprimento 0,350 pol, espessura 0,039 pol, distância
              0,394 pol. Cada corte mede {CARD_W} × {CARD_H} mm; posição pelo canto de cima à esquerda.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[280px] border-collapse text-left font-mono text-xs">
                <thead>
                  <tr className="text-muted">
                    <th scope="col" className="py-1.5 pr-3 font-semibold">Posição</th>
                    <th scope="col" className="py-1.5 pr-3 font-semibold">X (mm)</th>
                    <th scope="col" className="py-1.5 font-semibold">Y (mm)</th>
                  </tr>
                </thead>
                <tbody>
                  {L.slots.map((p, k) => (
                    <tr key={k} className="border-t border-line">
                      <td className="py-1.5 pr-3">
                        {k + 1} (linha {p.linha + 1}, col. {p.coluna + 1})
                      </td>
                      <td className="py-1.5 pr-3">{p.x.toFixed(2)}</td>
                      <td className="py-1.5">{p.y.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </aside>
      </div>

      {trocando && cartaTrocando && (
        <EscolhaDeArte
          oracleId={oracleDe(cartaTrocando)}
          nome={cartaTrocando.nome}
          atualId={cartaTrocando.printId}
          onEscolher={escolherArte}
          onClose={() => setTrocando(null)}
          navegacao={navegacaoDeArtes.posicao >= 0 ? navegacaoDeArtes : undefined}
        >
          {copiasDaCarta(lista, posicaoTrocando) > 1 ? (
            <label className="flex min-h-11 items-center gap-2.5">
              <input
                type="checkbox"
                checked={trocando.todas}
                onChange={(e) => setTrocando({ ...trocando, todas: e.target.checked })}
              />
              Trocar nas {copiasDaCarta(lista, posicaoTrocando)} cópias desta carta no lote
            </label>
          ) : null}
        </EscolhaDeArte>
      )}
    </div>
  );
}
