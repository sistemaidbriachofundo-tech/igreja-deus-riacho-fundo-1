"use client";

import { useEffect, useState, type FormEvent } from "react";
import { clearToken, loadStoredToken } from "../../lib/api";
import {
  accountProblem, changeMyPassword, newPasswordProblem, readMyAccount, saveMyPhone, type MyAccount,
} from "../../lib/my-account";
import { withBasePath } from "../../lib/paths";
import { usePersonaAccess } from "../AppShell";
import { Alert, Button, Input, Loading, PageHeader, PasswordField } from "../ui";
import { ProfilePhoto } from "./ProfilePhoto";
import s from "./my-account.module.css";

type Feedback = { tone: "success" | "danger"; message: string };

function AccountContact({ account, token }: { account: MyAccount; token: string }) {
  const [savedPhone, setSavedPhone] = useState(account.phone ?? "");
  const [phone, setPhone] = useState(savedPhone);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = account.canEditPhone ?? account.canEditProfilePhoto;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canEdit || phone.trim() === savedPhone) return;
    setBusy(true);
    setFeedback(null);
    try {
      const updated = await saveMyPhone(token, phone);
      setSavedPhone(updated.phone ?? "");
      setPhone(updated.phone ?? "");
      setFeedback({ tone: "success", message: "Telefone atualizado." });
    } catch (error) {
      setFeedback({ tone: "danger", message: accountProblem(error, "phone") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={s.panel} aria-labelledby="account-contact-title">
      <div className={s.sectionHeading}>
        <h2 id="account-contact-title">Dados pessoais</h2>
        <p>Confira seu cadastro e mantenha seu telefone de contato atualizado.</p>
      </div>
      <dl className={s.identity}>
        <div><dt>Nome</dt><dd>{account.name}</dd></div>
        <div><dt>E-mail de acesso</dt><dd>{account.email}</dd></div>
      </dl>
      <form className={s.form} onSubmit={submit}>
        <Input label="Telefone" type="tel" autoComplete="tel" maxLength={40}
          value={phone} readOnly={!canEdit} disabled={busy}
          onChange={event => { setPhone(event.target.value); setFeedback(null); }}
          placeholder={canEdit ? "Ex.: (61) 99999-9999" : undefined} />
        {canEdit && <div className={s.actions}>
          <Button type="submit" disabled={busy || phone.trim() === savedPhone}>
            {busy ? "Salvando…" : "Salvar telefone"}
          </Button>
        </div>}
        {feedback && <Alert appearance="workspace" tone={feedback.tone} title={feedback.message} />}
      </form>
    </section>
  );
}

function AccountSecurity({ token }: { token: string }) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const current = String(fields.get("currentPassword") ?? "");
    const next = String(fields.get("newPassword") ?? "");
    const confirmation = String(fields.get("confirmation") ?? "");
    const problem = newPasswordProblem(current, next, confirmation);
    if (problem) {
      setFeedback(problem);
      return;
    }
    setBusy(true);
    setFeedback("");
    try {
      await changeMyPassword(token, current, next);
      form.reset();
      clearToken();
      window.location.replace(withBasePath("/login/?senha=alterada"));
    } catch (error) {
      setFeedback(accountProblem(error, "password"));
      setBusy(false);
    }
  }

  return (
    <section className={s.panel} aria-labelledby="account-security-title">
      <div className={s.sectionHeading}>
        <h2 id="account-security-title">Alterar senha</h2>
        <p>Depois de salvar, entre novamente com a nova senha.</p>
      </div>
      <form className={s.form} onSubmit={submit} onChange={() => setFeedback("")}>
        <PasswordField label="Senha atual" name="currentPassword" autoComplete="current-password"
          required maxLength={128} disabled={busy} />
        <PasswordField label="Nova senha" name="newPassword" autoComplete="new-password"
          required minLength={14} maxLength={128} disabled={busy}
          hint="Use de 14 a 128 caracteres, com maiúsculas, minúsculas e números, sem espaços." />
        <PasswordField label="Confirmar nova senha" name="confirmation" autoComplete="new-password"
          required minLength={14} maxLength={128} disabled={busy} />
        {feedback && <Alert appearance="workspace" tone="danger" title={feedback} />}
        <div className={s.actions}><Button type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Alterar senha"}
        </Button></div>
      </form>
    </section>
  );
}

export function MyAccountPage() {
  const access = usePersonaAccess();
  const [profile, setProfile] = useState<{ account: MyAccount; token: string } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (access.kind !== "ready") return;
    const token = loadStoredToken();
    if (!token) return;
    let live = true;
    void readMyAccount(token).then(account => {
      if (!live) return;
      if (typeof account?.email !== "string" || account.email.toLowerCase() !== access.email.toLowerCase()) {
        setError("Não foi possível confirmar os dados desta conta. Tente novamente.");
        return;
      }
      setProfile({ account, token });
    }).catch(error => {
      if (live) setError(accountProblem(error, "load"));
    });
    return () => { live = false; };
  }, [access.kind, access.email, attempt]);

  const activeProfile = access.kind === "ready" && profile?.account.email.toLowerCase() === access.email.toLowerCase() ? profile : null;

  return (
    <div className={s.page}>
      <PageHeader appearance="workspace" heading="h1" title="Minha conta" />
      {error && <div className={s.panel}>
        <Alert appearance="workspace" tone="danger" title={error} />
        <div className={s.actions}><Button variant="secondary" onClick={() => {
          setError("");
          setAttempt(value => value + 1);
        }}>Tentar novamente</Button></div>
      </div>}
      {!error && !activeProfile && <Loading label="Carregando sua conta" variant="skeleton" />}
      {activeProfile && (
        <div className={s.layout}>
          <ProfilePhoto account={activeProfile.account} token={activeProfile.token} />
          <div className={s.details}>
            <AccountContact account={activeProfile.account} token={activeProfile.token} />
            <AccountSecurity token={activeProfile.token} />
          </div>
        </div>
      )}
    </div>
  );
}
