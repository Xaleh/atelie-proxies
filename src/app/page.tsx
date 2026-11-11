import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { COMPARACAO_IDIOMA, FOLHA_EXEMPLO, type CartaVitrine } from "@/lib/vitrine";

function MiniCarta({ carta, selo }: { carta: CartaVitrine; selo: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={carta.imagem}
        alt={`Carta ${carta.nome}`}
        title={carta.impressao}
        width={488}
        height={680}
        className="aspect-[63/88] w-full rounded-[4.5%/3.2%] bg-surface object-cover shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
      />
      <div className="self-start">{selo}</div>
    </div>
  );
}

function CartaComparada({ carta, idioma }: { carta: CartaVitrine; idioma: "EN" | "PT" }) {
  const pt = idioma === "PT";
  return (
    <figure className="flex min-w-0 max-w-[240px] flex-1 flex-col gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={carta.imagem}
        alt={`Carta ${carta.nome}, em ${pt ? "português" : "inglês"}`}
        title={carta.impressao}
        width={488}
        height={680}
        loading="lazy"
        className={`aspect-[63/88] w-full rounded-[4.5%/3.2%] bg-paper-line object-cover shadow-[0_10px_24px_rgba(11,22,25,0.25)] ${pt ? "outline-2 outline-offset-4 outline-rust" : ""}`}
      />
      <figcaption className="flex items-center justify-between gap-2 px-1 text-sm">
        <span className="truncate font-bold">{carta.nome}</span>
        <span className={`text-[11px] font-bold ${pt ? "text-rust" : "text-paper-muted"}`}>{idioma}</span>
      </figcaption>
    </figure>
  );
}

function Marca({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className={`absolute h-5 w-5 text-muted ${className}`}>
      <circle cx="11" cy="11" r="5" />
      <path d="M11 1v20M1 11h20" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <div className="bg-cream px-4 py-2 text-center text-[13px] font-semibold text-ink">
        Cartas em inglês ou em português do Brasil. Você escolhe carta por carta.
      </div>
      <Header />

      <main>
        <section className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-14 px-6 pb-20 pt-16">
          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-6">
            <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-gold">
              Impressas e cortadas sob encomenda
            </p>
            <h1 className="display text-[clamp(52px,7.4vw,104px)]">
              As cartas do seu deck, <span className="text-gold">no seu idioma</span>
            </h1>
            <p className="max-w-[520px] text-[19px] text-[#d8d2c8]">
              Cole a lista, escolha a arte de cada carta e receba proxies prontas para o sleeve. Em inglês ou
              em português do Brasil.
            </p>
            <div className="pt-2">
              <Link href="/montar" className="btn btn-gold min-h-14 px-7 text-[17px]">
                Montar pedido
              </Link>
            </div>
          </div>

          <div className="flex min-w-0 flex-[1_1_420px] justify-center">
            <div className="panel relative w-full max-w-[520px] px-9 py-11">
              <Marca className="left-3 top-3" />
              <Marca className="right-3 top-3" />
              <Marca className="bottom-3 left-3" />
              <div className="flex gap-4">
                {FOLHA_EXEMPLO.map((carta) => (
                  <MiniCarta
                    key={carta.nome}
                    carta={carta}
                    selo={
                      carta.idioma === "pt" ? (
                        <span className="seal bg-rust text-cream">PT oficial</span>
                      ) : (
                        <span className="seal border border-muted text-cream">Em inglês</span>
                      )
                    }
                  />
                ))}
              </div>
              <p className="mt-5 font-mono text-xs text-muted">folha A4 · 8 cartas · 63 × 88 mm</p>
            </div>
          </div>
        </section>

        <section className="bg-brown">
          <div className="mx-auto flex max-w-[1200px] flex-wrap gap-6 px-6 py-14">
            {[
              ["01", "Busque a carta", "Pelo nome em inglês ou em português. Veja todas as artes e escolha a sua."],
              ["02", "Cole sua lista", "O deck inteiro de uma vez, com a quantidade de cada carta."],
              ["03", "Escolha o idioma", "Cada carta sai em inglês ou em português, quando existe impressão oficial."],
            ].map(([n, titulo, texto]) => (
              <div key={n} className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5">
                <div className="font-display text-[54px] font-extrabold leading-none text-gold">{n}</div>
                <h2 className="font-display text-3xl font-bold uppercase tracking-wide">{titulo}</h2>
                <p className="text-muted">{texto}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="portugues" className="bg-cream text-ink">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-14 px-6 py-20">
            <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-5">
              <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-rust">Português do Brasil</p>
              <h2 className="display text-[clamp(42px,5.4vw,72px)]">Mesma carta, texto em português</h2>
              <p className="max-w-[500px] text-lg text-paper-muted">
                Cada carta do pedido tem um seletor EN / PT. O selo ao lado mostra em que idioma ela sai, para
                você saber o que está pedindo.
              </p>
              <ul className="flex flex-col gap-3">
                <li className="flex items-center gap-3">
                  <span className="seal w-[150px] shrink-0 justify-center bg-rust py-1 text-xs text-white">PT oficial</span>
                  <span className="text-paper-muted">A carta impressa em português pela Wizards</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="seal w-[150px] shrink-0 justify-center bg-ink py-1 text-xs text-cream">Em inglês</span>
                  <span className="text-paper-muted">Você preferiu a versão em inglês</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="seal w-[150px] shrink-0 justify-center border-[1.5px] border-paper-muted py-1 text-xs text-paper-muted">
                    PT indisponível
                  </span>
                  <span className="text-paper-muted">Sai em inglês, e você fica sabendo antes de fechar</span>
                </li>
              </ul>
            </div>
            <div className="flex min-w-0 flex-[1_1_420px] items-center justify-center gap-5">
              <CartaComparada carta={COMPARACAO_IDIOMA.en} idioma="EN" />
              <svg role="img" aria-label="vira" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 shrink-0">
                <path d="M4 12h16M14 6l6 6-6 6" />
              </svg>
              <CartaComparada carta={COMPARACAO_IDIOMA.pt} idioma="PT" />
            </div>
          </div>
        </section>

        <section id="como-funciona" className="border-t border-line bg-ink-2">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-9 px-6 py-[72px]">
            <h2 className="display text-[clamp(36px,4.4vw,56px)]">Do carrinho ao correio</h2>
            <ol className="flex flex-wrap gap-5">
              {[
                ["Monte", "Sem cadastro. O carrinho fica salvo no seu navegador."],
                ["Pague", "Pix direto ou Mercado Pago, com cartão, Pix ou boleto."],
                ["Acompanhe", "Um link só seu mostra cada etapa, da produção ao rastreio."],
                ["Receba", "Cartas cortadas no tamanho padrão, prontas para o sleeve."],
              ].map(([titulo, texto]) => (
                <li key={titulo} className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 border-t-[3px] border-gold pt-4">
                  <strong className="text-lg">{titulo}</strong>
                  <span className="text-muted">{texto}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
