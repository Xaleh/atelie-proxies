/**
 * Aplica as migrações da pasta drizzle/ no banco configurado.
 * Roda antes do build no Netlify e à mão no desenvolvimento (npm run db:migrate).
 */
import { existsSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

// No desenvolvimento as variáveis ficam no .env.local; no Netlify já vêm do ambiente.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.warn(
      "[migrate] TURSO_DATABASE_URL não configurada: migrações puladas. " +
        "O site sobe, mas pedidos e painel só funcionam depois de configurar o banco.",
    );
    return;
  }
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("[migrate] banco atualizado.");
  client.close();
}

main().catch((err) => {
  console.error("[migrate] falhou:", err);
  process.exit(1);
});
