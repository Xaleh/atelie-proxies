import Link from "next/link";
import { loja } from "@/config/loja";
import { CartLink } from "./CartLink";

export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-160.png" alt="" width={48} height={64} className="h-16 w-auto" />
          <span className="flex flex-col">
            <span className="font-display text-[26px] font-extrabold uppercase leading-none tracking-wide">
              {loja.nome}
            </span>
            <span className="text-[11px] uppercase tracking-[0.16em] text-muted">{loja.descricao}</span>
          </span>
        </Link>
        <nav aria-label="Principal" className="flex flex-wrap items-center gap-x-7 gap-y-1 text-[15px] font-medium">
          <Link href="/montar" className="py-3 hover:text-gold-soft">
            Montar pedido
          </Link>
          <Link href="/#portugues" className="py-3 hover:text-gold-soft">
            Português
          </Link>
          <Link href="/#como-funciona" className="py-3 hover:text-gold-soft">
            Como funciona
          </Link>
        </nav>
        <CartLink />
      </div>
    </header>
  );
}
