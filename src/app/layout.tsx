import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "@fontsource/jetbrains-mono/500.css";
// Fonte livre usada no texto traduzido das cartas (títulos e regras).
import "@fontsource/crimson-pro/400.css";
import "@fontsource/crimson-pro/400-italic.css";
import "@fontsource/crimson-pro/700.css";
import "./globals.css";
import { loja } from "@/config/loja";
import { CartProvider } from "@/lib/cart";

export const metadata: Metadata = {
  title: { default: `${loja.nome} · ${loja.descricao}`, template: `%s · ${loja.nome}` },
  description:
    "Proxies de Magic impressas e cortadas sob encomenda, em inglês ou em português do Brasil.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
