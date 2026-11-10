"use client";

import { useActionState } from "react";
import { entrar } from "../actions";

export function LoginForm() {
  const [erro, acao, enviando] = useActionState(entrar, null);
  return (
    <form action={acao} className="panel flex flex-col gap-4 p-6">
      <div>
        <label htmlFor="senha" className="label">
          Senha
        </label>
        <input id="senha" name="senha" type="password" required autoComplete="current-password" className="field" />
      </div>
      <button type="submit" className="btn btn-gold" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
      <p role="alert" className="min-h-5 text-sm font-semibold text-gold-soft">
        {erro}
      </p>
    </form>
  );
}
