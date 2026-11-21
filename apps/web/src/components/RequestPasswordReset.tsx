"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { apiPostPublic } from "../lib/api";
import { withBasePath } from "../lib/paths";
import { officialLogoAsset } from "../lib/brand";
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
      await apiPostPublic("/auth/password/forgot", { email: email.trim().toLowerCase() });
      setStage("sent");
    } catch {
      setStage("error");
    }
  }

  return (
    <main className={s.page} id="conteudo">
      <Link className={s.back} href="/">← Voltar ao site da igreja</Link>
      <div className={s.layout}>
        <section className={s.card} aria-labelledby="recovery-heading">
          <div className={s.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withBasePath(officialLogoAsset)} alt="" width={48} height={54} />
            <div><strong>IGREJA DE DEUS</strong><span>RIACHO FUNDO I</span></div>
          </div>
          <div className={s.heading}>
            <h1 id="recovery-heading">Recuperar senha</h1>
            <p>{stage === "sent"
              ? "Confira sua caixa de entrada."
              : "Informe o e-mail cadastrado para receber um link de redefinição."}</p>
          </div>

          {stage === "sent" ? (
            <div className={s.feedback} role="status">
              <strong>Pedido recebido.</strong>
              <p>Se houver uma conta com esse e-mail, enviaremos um link para definir uma nova senha. Confira também o spam.</p>
              <button className={s.textAction} type="button" onClick={() => setStage("ready")}>
                Solicitar para outro e-mail
              </button>
            </div>
          ) : (
            <form className={s.form} onSubmit={submit}>
              <label htmlFor="recovery-email">E-mail</label>
              <input
                id="recovery-email" name="email" type="email" inputMode="email" autoComplete="email"
                maxLength={254} required value={email} disabled={stage === "sending"}
                onChange={event => setEmail(event.target.value)}
                placeholder="seuemail@exemplo.com"
              />
              {stage === "error" && (
                <p className={s.error} role="alert">Não foi possível solicitar a recuperação agora. Verifique a conexão e tente novamente.</p>
              )}
              <button className={s.primary} type="submit" disabled={stage === "sending"} aria-busy={stage === "sending"}>
                {stage === "sending" ? "Solicitando…" : "Enviar link de recuperação"}
              </button>
            </form>
          )}
          <p className={s.footer}><Link href={eventAuthHref("/login/", eventSlug)}>Voltar ao login</Link></p>
        </section>
      </div>
    </main>
  );
}
