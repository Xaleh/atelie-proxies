import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Integração com o Mercado Pago (Checkout Pro), direto pela API REST.
 * O Access Token e o segredo do webhook ficam só em variáveis de ambiente.
 */

const API = process.env.MERCADOPAGO_API_URL ?? "https://api.mercadopago.com";

export function mercadoPagoConfigurado(): boolean {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
}

function token(): string {
  const t = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!t) throw new Error("MERCADOPAGO_ACCESS_TOKEN não está configurado.");
  return t;
}

export type Preferencia = {
  codigo: string;
  titulo: string;
  centavos: number;
  /** Endereço público do site, sem barra no fim. */
  siteUrl: string;
  /** Caminho da página do pedido, para onde a cliente volta. */
  retorno: string;
};

/** Cria a preferência de pagamento e devolve o link para onde levar a cliente. */
export async function criarPreferencia(p: Preferencia): Promise<string> {
  const volta = `${p.siteUrl}${p.retorno}`;
  const publico = p.siteUrl.startsWith("https://");
  const res = await fetch(`${API}/checkout/preferences`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ title: p.titulo, quantity: 1, unit_price: p.centavos / 100, currency_id: "BRL" }],
      external_reference: p.codigo,
      back_urls: { success: volta, pending: volta, failure: volta },
      // O Mercado Pago só aceita retorno automático e webhook em endereço https público.
      ...(publico
        ? { auto_return: "approved", notification_url: `${p.siteUrl}/api/webhooks/mercadopago` }
        : {}),
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Mercado Pago respondeu ${res.status} ao criar a preferência`);
  const json = (await res.json()) as { init_point?: string };
  if (!json.init_point) throw new Error("Mercado Pago não devolveu o link de pagamento");
  return json.init_point;
}

export type PagamentoMP = {
  id: string;
  status: string;
  externalReference: string | null;
  centavos: number;
  moeda: string | null;
};

export async function consultarPagamento(id: string): Promise<PagamentoMP | null> {
  if (!/^\d{1,30}$/.test(id)) return null;
  const res = await fetch(`${API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Mercado Pago respondeu ${res.status} ao consultar o pagamento`);
  const j = (await res.json()) as {
    id: number | string;
    status?: string;
    external_reference?: string | null;
    transaction_amount?: number;
    currency_id?: string;
  };
  return {
    id: String(j.id),
    status: j.status ?? "unknown",
    externalReference: j.external_reference ?? null,
    centavos: Math.round((j.transaction_amount ?? 0) * 100),
    moeda: j.currency_id ?? null,
  };
}

/**
 * Confere a assinatura do webhook (cabeçalho x-signature, "ts=...,v1=...").
 * Mesmo cálculo do SDK oficial: HMAC-SHA256 em hexadecimal sobre
 * "id:<data.id minúsculo>;request-id:<x-request-id>;ts:<ts>;", omitindo o par
 * cujo valor não veio.
 */
export function assinaturaValida(args: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
}): boolean {
  if (!args.xSignature || !args.secret) return false;
  let ts: string | null = null;
  let v1: string | null = null;
  for (const parte of args.xSignature.split(",")) {
    const [k, v] = parte.split("=", 2).map((s) => s?.trim());
    if (k?.toLowerCase() === "ts") ts = v ?? null;
    if (k?.toLowerCase() === "v1") v1 = v ?? null;
  }
  if (!ts || !v1 || !/^\d+$/.test(ts)) return false;

  const partes: string[] = [];
  const dataId = args.dataId?.trim();
  const requestId = args.xRequestId?.trim();
  if (dataId) partes.push(`id:${dataId.toLowerCase()}`);
  if (requestId) partes.push(`request-id:${requestId}`);
  partes.push(`ts:${ts}`);
  const manifesto = partes.join(";") + ";";

  const calculado = createHmac("sha256", args.secret).update(manifesto).digest("hex");
  const a = Buffer.from(calculado);
  const b = Buffer.from(v1.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
