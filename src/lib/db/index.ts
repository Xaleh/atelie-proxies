import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

let cached: LibSQLDatabase<typeof schema> | null = null;

/**
 * Conexão com o banco. No Netlify aponta para o Turso (libsql://...); no
 * desenvolvimento e, depois, na VPS, aponta para um arquivo (file:...).
 */
export function db(): LibSQLDatabase<typeof schema> {
  if (cached) return cached;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL não está configurada. Veja o .env.example e o README.",
    );
  }
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  cached = drizzle(client, { schema });
  return cached;
}

export { schema };
