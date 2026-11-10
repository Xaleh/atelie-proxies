import { randomBytes, randomInt } from "node:crypto";

// Sem I, L, O, U, 0 e 1 para o código ser fácil de ler e ditar.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Código curto do pedido, como PX-7K3D. */
export function novoCodigoDePedido(): string {
  let codigo = "";
  for (let i = 0; i < 4; i++) codigo += ALFABETO[randomInt(ALFABETO.length)];
  return `PX-${codigo}`;
}

/** Token longo do link de acompanhamento, impossível de adivinhar. */
export function novoToken(): string {
  return randomBytes(24).toString("base64url");
}
