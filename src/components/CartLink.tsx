"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

export function CartLink() {
  const { quantidade, pronto } = useCart();
  return (
    <Link href="/montar" className="btn btn-gold">
      {pronto && quantidade > 0 ? `Meu pedido (${quantidade})` : "Montar pedido"}
    </Link>
  );
}
