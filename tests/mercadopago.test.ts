import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assinaturaValida } from "@/lib/mercadopago";

const secret = "segredo-de-teste";
const assinar = (manifesto: string) => createHmac("sha256", secret).update(manifesto).digest("hex");

describe("assinatura do webhook do Mercado Pago", () => {
  it("aceita o manifesto id;request-id;ts assinado com o segredo", () => {
    const v1 = assinar("id:123456;request-id:req-1;ts:1704908010;");
    expect(assinaturaValida({ xSignature: `ts=1704908010,v1=${v1}`, xRequestId: "req-1", dataId: "123456", secret })).toBe(true);
  });

  it("põe o id em minúsculas e omite o par que não veio", () => {
    const v1 = assinar("id:abc123;ts:1704908010;");
    expect(assinaturaValida({ xSignature: `ts=1704908010, v1=${v1}`, xRequestId: null, dataId: "ABC123", secret })).toBe(true);
  });

  it("recusa assinatura de outro pagamento, outro segredo ou cabeçalho torto", () => {
    const v1 = assinar("id:123456;request-id:req-1;ts:1704908010;");
    const base = { xRequestId: "req-1", dataId: "123456", secret };
    expect(assinaturaValida({ ...base, xSignature: `ts=1704908010,v1=${v1}`, dataId: "999" })).toBe(false);
    expect(assinaturaValida({ ...base, xSignature: `ts=1704908010,v1=${v1}`, secret: "outro" })).toBe(false);
    expect(assinaturaValida({ ...base, xSignature: `v1=${v1}` })).toBe(false);
    expect(assinaturaValida({ ...base, xSignature: null })).toBe(false);
    expect(assinaturaValida({ ...base, xSignature: "ts=abc,v1=zz" })).toBe(false);
  });
});
