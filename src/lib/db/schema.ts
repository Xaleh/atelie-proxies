import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

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

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
