"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { apiPost } from "../lib/api";
import { eventAuthHref } from "../lib/public-event-registration";
import s from "./activate-access.module.css";

export function RequestPasswordReset() {
  const [email, setEmail] = useState("");
  const [eventSlug, setEventSlug] = useState<string | null>(null);
  const [stage, setStage] = useState<"ready" | "sending" | "sent" | "error">("ready");

  useEffect(() => {
    setEventSlug(new URLSearchParams(window.location.search).get("evento"));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage === "sending" || !email.trim()) return;
    setStage("sending");
    try {
      await apiPost("/auth/forgot-password", "", { email: email.trim() }, { timeoutMs: 20_000 });
      setStage("sent");
    } catch {
      setStage("error");
    }
  }

  return <main className={s.page} id="conteudo">
    <div className={s.brand}>IGREJA DE DEUS · RIACHO FUNDO I</div>
    <section className={s.card} aria-labelledby="recovery-heading">
      <h1 id="recovery-heading">Recuperar senha</h1>
      {stage === "sent" ? (
        <p role="status">Se houver uma conta para esse e-mail, você receberá um link para criar uma nova senha. Confira também o spam.</p>
      ) : <>
        <p>Informe o e-mail que você usa para entrar no sistema.</p>
        <form className={s.form} onSubmit={submit}>
          <label>E-mail da conta
            <input name="email" type="email" autoComplete="email" maxLength={254} required
              value={email} disabled={stage === "sending"} onChange={e => setEmail(e.target.value)} />
          </label>
          {stage === "error" && <p className={s.error} role="alert">Não foi possível enviar o pedido agora. Tente novamente.</p>}
          <button type="submit" className={s.primary} disabled={stage === "sending"}>
            {stage === "sending" ? "Solicitando…" : "Enviar link de recuperação"}
          </button>
        </form>
      </>}
      <p><Link href={eventAuthHref("/login/", eventSlug)}>Voltar ao login</Link></p>
    </section>
  </main>;
}
