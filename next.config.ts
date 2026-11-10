import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (PPR) fica desligado: o site roda no Netlify, cujo
  // adaptador ainda não é verificado para esse modo, e todas as páginas com
  // dados (pedido, painel) são dinâmicas de qualquer forma.
  serverExternalPackages: ["@libsql/client", "libsql"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
