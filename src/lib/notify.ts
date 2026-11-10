import { siteUrl } from "./site";

/**
 * Aviso opcional de pedido novo pelo Telegram. Leva só o código e o link do
 * painel, sem dados da cliente. Sem TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID
 * configurados, não faz nada.
 */
export async function avisarPedidoNovo(code: string, quantidade: number): Promise<void> {
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: `Pedido novo ${code}: ${quantidade} cartas\n${siteUrl()}/admin/pedidos/${code}`,
      }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
  } catch {
    // O aviso é um extra: se falhar, o pedido continua valendo e aparece no painel.
  }
}
