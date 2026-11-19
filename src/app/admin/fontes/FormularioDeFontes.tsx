"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dataHora } from "@/lib/format";
import { esquecerFontes } from "@/lib/traducao/render";
import { ENCAIXE, ENCAIXES, EXTENSOES, TAMANHO_MAXIMO, formatoDaLetra, tamanhoLegivel, type Encaixe, type LetraEnviada } from "@/lib/tipografia";

type Status = { ok: boolean; texto: string };

/** Família só desta página, para a amostra não depender do que o renderizador já carregou. */
const familiaDaAmostra = (l: LetraEnviada) => `amostra-${l.encaixe}-${l.hash}`;

/** Deixa as fontes enviadas prontas para as amostras e diz quais o navegador conseguiu ler. */
function useAmostras(letras: LetraEnviada[]): Record<string, "ok" | "erro"> {
  const [estado, setEstado] = useState<Record<string, "ok" | "erro">>({});
  useEffect(() => {
    let vivo = true;
    const faces: FontFace[] = [];
    for (const l of letras) {
      const face = new FontFace(familiaDaAmostra(l), `url(${l.url})`);
      faces.push(face);
      face.load().then(
        () => {
          if (!vivo) return;
          document.fonts.add(face);
          setEstado((e) => ({ ...e, [l.hash]: "ok" }));
        },
        () => vivo && setEstado((e) => ({ ...e, [l.hash]: "erro" })),
      );
    }
    return () => {
      vivo = false;
      for (const face of faces) document.fonts.delete(face);
    };
  }, [letras]);
  return estado;
}

export function FormularioDeFontes({ iniciais, podeSalvar }: { iniciais: LetraEnviada[]; podeSalvar: boolean }) {
  const router = useRouter();
  const [letras, setLetras] = useState(iniciais);
  const [ocupado, setOcupado] = useState<Encaixe | null>(null);
  const [status, setStatus] = useState<Partial<Record<Encaixe, Status>>>({});
  const amostras = useAmostras(letras);

  async function pedir(encaixe: Encaixe, pedido: () => Promise<Response>, deuCerto: string) {
    setOcupado(encaixe);
    setStatus((s) => ({ ...s, [encaixe]: undefined }));
    try {
      const res = await pedido();
      const r = (await res.json().catch(() => ({}))) as { error?: string; letras?: LetraEnviada[] };
      if (!res.ok || !r.letras) throw new Error(r.error ?? "Não consegui gravar.");
      setLetras(r.letras);
      // as cartas desenhadas daqui em diante buscam a lista nova
      esquecerFontes();
      setStatus((s) => ({ ...s, [encaixe]: { ok: true, texto: deuCerto } }));
      router.refresh();
    } catch (err) {
      setStatus((s) => ({ ...s, [encaixe]: { ok: false, texto: (err as Error).message } }));
    } finally {
      setOcupado(null);
    }
  }

  async function enviar(encaixe: Encaixe, arquivo: File) {
    const recusar = (texto: string) => setStatus((s) => ({ ...s, [encaixe]: { ok: false, texto } }));
    if (arquivo.size > TAMANHO_MAXIMO) return recusar(`O arquivo passa de ${tamanhoLegivel(TAMANHO_MAXIMO)}.`);
    if (!formatoDaLetra(new Uint8Array(await arquivo.slice(0, 12).arrayBuffer()))) {
      return recusar("O arquivo não é uma fonte. Envie um .ttf, .otf, .woff ou .woff2.");
    }
    const corpo = new FormData();
    corpo.set("encaixe", encaixe);
    corpo.set("arquivo", arquivo);
    await pedir(encaixe, () => fetch("/api/admin/fontes", { method: "POST", body: corpo }), "Fonte enviada. As próximas cartas já saem com ela.");
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="grid gap-6 lg:grid-cols-2">
        {ENCAIXES.map((encaixe) => {
          const e = ENCAIXE[encaixe], atual = letras.find((l) => l.encaixe === encaixe), st = status[encaixe];
          const lida = atual ? amostras[atual.hash] : undefined;
          return (
            <li key={encaixe} className="panel flex flex-col gap-4 p-6">
              <div>
                <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">{e.rotulo}</h2>
                <p className="text-muted">{e.onde}</p>
              </div>
              <p>
                {atual ? (
                  <>
                    Em uso: <strong>{atual.arquivo}</strong> ({tamanhoLegivel(atual.bytes)}), enviada em {dataHora(atual.enviadaEm + "Z")}.
                  </>
                ) : (
                  <>Sem arquivo: as cartas usam {e.reserva}.</>
                )}
              </p>
              {atual && (
                <p
                  className="rounded-md bg-cream px-4 py-3 text-[22px] leading-snug text-ink"
                  style={lida === "ok" ? { fontFamily: `'${familiaDaAmostra(atual)}'`, fontStyle: "normal", fontWeight: 400 } : undefined}
                  aria-label="Amostra da fonte enviada"
                >
                  {lida === "erro" ? "O navegador não conseguiu ler este arquivo; as cartas continuam com a fonte livre." : e.amostra}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`arquivo-${encaixe}`} className="label">
                    {atual ? "Trocar por outro arquivo" : "Enviar arquivo"} (.ttf, .otf, .woff ou .woff2)
                  </label>
                  <input
                    id={`arquivo-${encaixe}`}
                    type="file"
                    accept={EXTENSOES}
                    className="field"
                    disabled={!podeSalvar || ocupado !== null}
                    onChange={(ev) => {
                      const arquivo = ev.target.files?.[0];
                      ev.target.value = "";
                      if (arquivo) void enviar(encaixe, arquivo);
                    }}
                  />
                </div>
                {atual && (
                  <button
                    type="button"
                    className="btn btn-ghost px-4 text-sm"
                    disabled={!podeSalvar || ocupado !== null}
                    onClick={() =>
                      void pedir(
                        encaixe,
                        () => fetch(`/api/admin/fontes?encaixe=${encaixe}`, { method: "DELETE" }),
                        `Fonte removida. As cartas voltam a usar ${e.reserva}.`,
                      )
                    }
                  >
                    Remover
                  </button>
                )}
              </div>
              <p role="status" className={st?.ok === false ? "font-semibold text-gold-soft" : "text-muted"}>
                {ocupado === encaixe ? "Gravando…" : (st?.texto ?? "")}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="max-w-3xl text-muted">
        Para ver o resultado numa carta, abra uma carta em Traduções ou uma prévia em português na loja. Quem já estava com
        a loja aberta vê a fonte nova ao recarregar a página.
      </p>
    </div>
  );
}
