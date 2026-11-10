import Link from "next/link";
import { loja } from "@/config/loja";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-[1200px] flex-wrap gap-10 px-6 py-12 text-sm text-muted">
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-320.png" alt={loja.nome} width={105} height={140} className="h-36 w-auto self-start" />
          <p className="max-w-md">
            Proxies para jogo casual e playtest. Não são cartas oficiais nem são vendidas como tal.
          </p>
        </div>
        <div className="flex min-w-0 flex-[1_1_180px] flex-col">
          <Link href="/montar" className="py-2 text-cream hover:text-gold-soft">
            Montar pedido
          </Link>
          <Link href="/#portugues" className="py-2 text-cream hover:text-gold-soft">
            Cartas em português
          </Link>
          <Link href="/#como-funciona" className="py-2 text-cream hover:text-gold-soft">
            Como funciona
          </Link>
        </div>
      </div>
    </footer>
  );
}
