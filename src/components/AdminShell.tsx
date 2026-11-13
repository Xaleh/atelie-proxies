import Link from "next/link";
import { sair } from "@/app/admin/actions";
import { loja } from "@/config/loja";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-ink-2">
        <div className="mx-auto flex max-w-[1312px] flex-wrap items-center justify-between gap-4 px-6 py-3">
          <Link href="/admin" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-160.png" alt="" width={36} height={48} className="h-12 w-auto" />
            <span className="font-display text-[22px] font-extrabold uppercase leading-none tracking-wide">{loja.nome}</span>
            <span className="rounded-md bg-rust px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-cream">Painel</span>
          </Link>
          <nav aria-label="Painel" className="flex flex-wrap items-center gap-x-6 text-sm font-semibold">
            <Link href="/admin" className="py-3 hover:text-gold-soft">
              Pedidos
            </Link>
            <Link href="/admin/producao" className="py-3 hover:text-gold-soft">
              Produção
            </Link>
            <Link href="/admin/traducoes" className="py-3 hover:text-gold-soft">
              Traduções
            </Link>
            <Link href="/admin/acessorios" className="py-3 hover:text-gold-soft">
              Acessórios
            </Link>
            <Link href="/admin/valores" className="py-3 hover:text-gold-soft">
              Valores
            </Link>
          </nav>
          <div className="flex items-center gap-4 text-sm text-muted">
            <Link href="/" className="py-3 text-cream hover:text-gold-soft">
              Ver a loja
            </Link>
            <form action={sair}>
              <button type="submit" className="min-h-11 cursor-pointer px-1 text-cream underline hover:text-gold-soft">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1312px] flex-col gap-7 px-6 pb-16 pt-7 text-sm">{children}</main>
    </>
  );
}
