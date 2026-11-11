import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import type { Status } from "@/lib/db/schema";
import { brl } from "@/lib/format";
import { mercadoPagoConfigurado } from "@/lib/mercadopago";
import { conciliarPagamentoMP, pedidoPorToken } from "@/lib/orders";
import { gerarPixCopiaECola } from "@/lib/pix";
import { siteUrl } from "@/lib/site";
import { CopiarBotao, MercadoPagoBotao } from "./Pagamento";

export const metadata: Metadata = { title: "Seu pedido", robots: { index: false, follow: false } };

const ETAPAS: Array<{ status: Status; titulo: string; texto: string }> = [
  { status: "recebido", titulo: "Recebido", texto: "Aguardando o pagamento" },
  { status: "pago", titulo: "Pago", texto: "Pagamento confirmado" },
  { status: "producao", titulo: "Em produção", texto: "Impressão e corte" },
  { status: "enviado", titulo: "Enviado", texto: "A caminho ou pronto para retirada" },
];

export default async function PedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  let pedido = await pedidoPorToken(token);
  if (!pedido) notFound();

  // Na volta do Mercado Pago o endereço traz o id do pagamento. Conferir aqui
  // cobre o caso de o webhook ainda não ter chegado.
  const paymentId = typeof sp.payment_id === "string" ? sp.payment_id : null;
  if (paymentId && pedido.order.status === "recebido" && mercadoPagoConfigurado()) {
    try {
      if ((await conciliarPagamentoMP(paymentId)) !== "desconhecido") {
        pedido = (await pedidoPorToken(token)) ?? pedido;
      }
    } catch (err) {
      console.error("[pedido] conciliação na volta do Mercado Pago falhou:", err);
    }
  }

  const { order, items } = pedido;
  const cancelado = order.status === "cancelado";
  const etapaAtual = ETAPAS.findIndex((e) => e.status === order.status);
  const aguardando = order.status === "recebido";
  const voltouDoMP = typeof sp.status === "string" || typeof sp.collection_status === "string";

  const chavePix = process.env.PIX_KEY;
  let pix: { codigo: string; qr: string } | null = null;
  if (aguardando && chavePix) {
    const codigo = gerarPixCopiaECola({
      chave: chavePix,
      recebedor: process.env.PIX_RECEBEDOR ?? "Proxy do Reis",
      cidade: process.env.PIX_CIDADE ?? "Brasil",
      centavos: order.totalCents,
      txid: order.code,
    });
    pix = { codigo, qr: await QRCode.toDataURL(codigo, { margin: 1, width: 336, errorCorrectionLevel: "M" }) };
  }
  const temMP = aguardando && mercadoPagoConfigurado();
  const link = `${siteUrl()}/pedido/${order.token}`;
  const emPortugues = items.reduce((n, i) => n + (i.lang === "pt" ? i.quantity : 0), 0);

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 pb-20 pt-11">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="display text-[clamp(44px,5.6vw,72px)]">
            Pedido <span className="text-gold">{order.code}</span>
          </h1>
          <p className="text-muted">
            {order.quantity} {order.quantity === 1 ? "carta" : "cartas"} · {emPortugues} em português · {brl(order.totalCents)}
          </p>
        </div>

        {cancelado ? (
          <p className="panel p-6 text-lg">Este pedido foi cancelado. Fale com o ateliê se isso não era esperado.</p>
        ) : (
          <ol aria-label="Etapas do pedido" className="flex flex-wrap gap-3">
            {ETAPAS.map((etapa, i) => {
              const atual = i === etapaAtual;
              const feita = i < etapaAtual;
              return (
                <li
                  key={etapa.status}
                  aria-current={atual ? "step" : undefined}
                  className={`flex min-w-0 flex-[1_1_200px] flex-col gap-1 rounded-[14px] px-4 py-4 ${atual ? "bg-cream text-ink" : "border-[1.5px] border-edge"}`}
                >
                  <span className={`text-xs font-bold uppercase tracking-widest ${atual ? "text-rust" : "text-muted"}`}>
                    {atual ? "Agora" : feita ? "Concluída" : `Etapa ${i + 1}`}
                  </span>
                  <strong className="text-lg">{etapa.titulo}</strong>
                  <span className={`text-[13px] ${atual ? "text-paper-muted" : "text-muted"}`}>{etapa.texto}</span>
                </li>
              );
            })}
          </ol>
        )}

        {order.status === "enviado" && order.tracking && (
          <p className="panel p-5">
            Código de rastreio: <span className="font-mono font-medium text-gold">{order.tracking}</span>
          </p>
        )}

        {aguardando && voltouDoMP && (
          <p role="status" className="panel border-gold p-5">
            O Mercado Pago ainda não confirmou o pagamento. Boleto e alguns cartões demoram; esta página
            atualiza o status quando a confirmação chegar.
          </p>
        )}

        {aguardando && (
          <section className="flex flex-col gap-5 rounded-2xl bg-cream p-7 text-ink">
            <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">Pagamento</h2>
            {!pix && !temMP && (
              <p className="text-paper-muted">
                O pagamento online ainda não está configurado. O ateliê vai entrar em contato pelo e-mail ou
                telefone que você informou.
              </p>
            )}
            <div className="flex flex-wrap items-start gap-8">
              {pix && (
                <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
                  <h3 className="text-lg font-bold">Pix direto</h3>
                  <div className="flex flex-wrap items-center gap-5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pix.qr} alt="QR code do Pix deste pedido" width={168} height={168} className="rounded-xl border-2 border-ink bg-white" />
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[13px] text-paper-muted">Valor</span>
                      <strong className="font-display text-[44px] leading-none">{brl(order.totalCents)}</strong>
                      <span className="mt-2 text-[13px] text-paper-muted">Identificador</span>
                      <span className="font-mono text-[15px] font-medium">{order.code}</span>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="pix" className="mb-1.5 block text-[13px] text-paper-muted">
                      Pix copia e cola
                    </label>
                    <input id="pix" readOnly value={pix.codigo} className="field-light font-mono text-[13px]" />
                  </div>
                  <CopiarBotao texto={pix.codigo} rotulo="Copiar código" className="btn btn-dark min-h-[50px] text-base" />
                  <p className="text-[13px] text-paper-muted">
                    Depois de pagar, não precisa enviar comprovante. O status muda para Pago quando o ateliê
                    confirma.
                  </p>
                </div>
              )}
              {temMP && (
                <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
                  <h3 className="text-lg font-bold">Mercado Pago</h3>
                  <MercadoPagoBotao token={order.token} />
                </div>
              )}
            </div>
          </section>
        )}

        <section className="panel flex flex-wrap items-center justify-between gap-5 p-7">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
            <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">Guarde o link do pedido</h2>
            <p className="text-muted">
              É por ele que você acompanha cada etapa e vê o código de rastreio. Não precisa de conta nem de
              senha.
            </p>
          </div>
          <div className="flex min-w-0 flex-[1_1_360px] flex-wrap gap-2.5">
            <div className="flex min-h-[46px] min-w-0 flex-[1_1_220px] items-center overflow-hidden rounded-[10px] border-[1.5px] border-edge px-3.5 font-mono text-[13px]">
              <span className="truncate">{link}</span>
            </div>
            <CopiarBotao texto={link} rotulo="Copiar link" className="btn btn-ghost" />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-[28px] font-bold uppercase tracking-wide">Cartas do pedido</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt="" loading="lazy" className="aspect-[63/88] w-full rounded-lg bg-surface object-cover" />
                <span className="truncate text-sm font-semibold">
                  {item.quantity}× {item.printedName ?? item.name}
                </span>
                <span className="text-xs text-muted">{item.translated ? "Texto em português sobre esta arte" : item.lang === "pt" ? "Em português" : "Em inglês"}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <Footer />
    </>
  );
}
