import { sql } from "drizzle-orm";
import { blob, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const STATUS = ["recebido", "pago", "producao", "enviado", "cancelado"] as const;
export type Status = (typeof STATUS)[number];

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    token: text("token").notNull(),
    status: text("status").$type<Status>().notNull().default("recebido"),
    customerName: text("customer_name").notNull(),
    customerContact: text("customer_contact").notNull(),
    delivery: text("delivery").$type<"envio" | "retirada">().notNull(),
    cep: text("cep"),
    address: text("address"),
    notes: text("notes"),
    quantity: integer("quantity").notNull(),
    unitCents: integer("unit_cents").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    /** Soma dos acessórios (sleeves, deckbox). `subtotalCents` continua sendo só as cartas. */
    accessoriesCents: integer("accessories_cents").notNull().default(0),
    /** Desconto do combo, já em centavos, e qual combo foi (sleeves, deckbox ou completo). */
    discountCents: integer("discount_cents").notNull().default(0),
    combo: text("combo"),
    paymentMethod: text("payment_method").$type<"pix" | "mercadopago">(),
    tracking: text("tracking"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    paidAt: text("paid_at"),
    shippedAt: text("shipped_at"),
  },
  (t) => [
    uniqueIndex("orders_code_idx").on(t.code),
    uniqueIndex("orders_token_idx").on(t.token),
    index("orders_status_idx").on(t.status),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** Jogo do item. Só "mtg" por enquanto; os outros entram depois. */
    game: text("game").notNull().default("mtg"),
    printId: text("print_id").notNull(),
    oracleId: text("oracle_id").notNull(),
    name: text("name").notNull(),
    printedName: text("printed_name"),
    setCode: text("set_code").notNull(),
    collectorNumber: text("collector_number").notNull(),
    lang: text("lang").$type<"en" | "pt">().notNull(),
    image: text("image").notNull(),
    quantity: integer("quantity").notNull(),
    /** Texto em português escrito sobre a arte em inglês (lang = "pt"). */
    translated: integer("translated", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/** Acessórios do pedido, com nome e preço copiados do catálogo na hora da compra. */
export const orderAccessories = sqliteTable(
  "order_accessories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id"),
    kind: text("kind").$type<"sleeve" | "deckbox">().notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    unitCents: integer("unit_cents").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_accessories_order_idx").on(t.orderId)],
);

/** Catálogo de acessórios, mantido pelo painel. */
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").$type<"sleeve" | "deckbox">().notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull(),
  available: integer("available", { mode: "boolean" }).notNull().default(true),
  /** Ordem em que aparece na loja e no painel. */
  position: integer("position").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

/**
 * Foto do acessório, já reduzida pelo painel (JPEG de até 800 px). Fica numa
 * tabela à parte para a lista de produtos não carregar as imagens.
 */
export const productImages = sqliteTable("product_images", {
  productId: integer("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
  /** Resumo do conteúdo; entra no endereço da imagem para o navegador guardar em cache sem medo. */
  hash: text("hash").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").$type<"pix" | "mercadopago">().notNull(),
    /** Id do pagamento no provedor; nulo no Pix confirmado à mão. */
    providerPaymentId: text("provider_payment_id"),
    status: text("status").notNull(),
    amountCents: integer("amount_cents").notNull(),
    detail: text("detail"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    uniqueIndex("payments_provider_id_idx").on(t.provider, t.providerPaymentId),
    index("payments_order_idx").on(t.orderId),
  ],
);

/**
 * Traduções de cartas, por face, chaveadas pelo nome em inglês em minúsculas
 * (como o extrator do Arena grava). "manual" vence "arena"; as duas vencem o
 * texto da carta impressa em português, que vem do Scryfall e não fica aqui.
 */
export const translations = sqliteTable(
  "translations",
  {
    nameEn: text("name_en").notNull(),
    source: text("source").$type<"manual" | "arena">().notNull(),
    nome: text("nome").notNull(),
    tipo: text("tipo").notNull(),
    texto: text("texto").notNull(),
    sabor: text("sabor").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [primaryKey({ columns: [t.nameEn, t.source] })],
);

/** Ambientação em português do Arena, que é de cada edição: "nome|set|número". */
export const arenaFlavors = sqliteTable("arena_flavors", {
  key: text("key").primaryKey(),
  sabor: text("sabor").notNull(),
});

/** Molde manual (ou bloqueio) de uma face de uma impressão específica. */
export const printTemplates = sqliteTable(
  "print_templates",
  {
    printId: text("print_id").notNull(),
    face: integer("face").notNull(),
    data: text("data").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [primaryKey({ columns: [t.printId, t.face] })],
);

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderAccessory = typeof orderAccessories.$inferSelect;
export type Payment = typeof payments.$inferSelect;

/** Configurações que o ateliê muda pelo painel, uma linha por assunto (o valor é JSON). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
