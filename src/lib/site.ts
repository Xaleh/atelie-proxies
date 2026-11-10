/** Endereço público do site, sem barra no fim. */
export function siteUrl(): string {
  // SITE_URL é definida por vocês; URL é a variável que o Netlify preenche sozinho.
  const url = process.env.SITE_URL ?? process.env.URL ?? "http://localhost:3000";
  return url.replace(/\/+$/, "");
}
