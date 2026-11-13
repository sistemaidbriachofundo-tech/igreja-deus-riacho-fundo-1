"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost, loadStoredToken } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { BUILTIN_ROLES, PERSONA_LABELS, parseMinistryNav, type BuiltinRole, type MinistryNavItem } from "../lib/persona-navigation";
import { UIIcon } from "./AppShell";
import { PageHeader } from "./ui/PageHeader";
import { useActionConfirmation } from "./ui/ActionConfirmation";
import { useFeedback } from "./ui/FeedbackProvider";
import ui from "./ui/ui.module.css";
import s from "./access-directory.module.css";

type Person = { id: string; displayName: string; email?: string | null };
type Account = {
  id: string; email: string; status: string; person: Person; invitationStatus?: "INVITED" | "PENDING_EMAIL" | null;
  profiles: { role: BuiltinRole; ministry: string | null }[];
};
type AccessLinkDelivery = { sent: boolean; previewUrl?: string };
type AccountPage = { accounts: Account[]; hasMore: boolean };

export function AccessDirectory() {
  const { showFeedback } = useFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountPage | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const { confirm: confirmResend, confirmation: resendConfirmation } = useActionConfirmation();
  async function sendLink(account: Account, recovery: boolean) {
    if (!token || sending) return;
    const action = recovery ? "Enviar recuperação" : "Reenviar convite";
    if (!(await confirmResend({
      title: recovery ? "Enviar link de recuperação?" : "Reenviar convite por e-mail?",
      subject: account.person.displayName,
      description: "Um novo link de uso único será criado para " + account.email + ".",
      action,
    }))) return;
    setSending(account.id);
    setPreviewUrl("");
    setError("");
    try {
      const path = recovery ? "/password/reset" : "/invite/resend";
      const delivery = await apiPost<AccessLinkDelivery>("/admin/access/" + encodeURIComponent(account.id) + path, token);
      setPreviewUrl(delivery.previewUrl ?? "");
      showFeedback({
        tone: "success",
        title: delivery.sent ? "Link enviado" : "Link de teste criado",
        message: delivery.sent ? "O link foi enviado para " + account.email + "." : "Use o link de teste exibido em Acessos.",
      });
      setRevision(v => v + 1);
    } catch (error) {
      showFeedback({ tone: "error", title: "Não foi possível gerar o link", message: dasError(error) });
    } finally {
      setSending("");
    }
  }
  useEffect(() => setToken(loadStoredToken()), []);

  useEffect(() => {
    if (!token) return;
    let current = true;
    setLoading(true);
    setError("");
    void apiGet<AccountPage>("/admin/access?" + new URLSearchParams({ q: filter, page: String(page) }), token)
      .then(result => { if (current) setAccounts(result); })
      .catch(error => { if (current) { setAccounts(null); setError(dasError(error)); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, filter, page, revision]);

  return (
    <section className={s.directory}>
      {resendConfirmation}
      {previewUrl && <p role="status">
        <a href={previewUrl} target="_blank" rel="noreferrer">Abrir link de teste</a>
        {" · "}
        <button type="button" className={s.resend} onClick={() => setPreviewUrl("")}>Ocultar</button>
      </p>}
      <PageHeader appearance="workspace" heading="h1" title="Acessos" description="Libere o acesso de pessoas já cadastradas. A pessoa recebe um link de ativação e define sua própria senha." />
      <div className={s.actions}>
        <button type="button" className={ui.workspacePrimary} aria-expanded={creating} disabled={!token} onClick={() => setCreating(value => !value)}>
          <UIIcon name="shield" size={17} /> {creating ? "Fechar convite" : "Novo acesso"}
        </button>
      </div>
      {creating && token && <AccessForm token={token} onCreated={(name, delivery) => {
        setCreating(false);
        setPreviewUrl(delivery.previewUrl ?? "");
        showFeedback({ tone: "success", title: delivery.sent ? "Convite enviado" : "Convite de teste criado",
          message: "A senha de " + name + " será definida no link individual.", actionLabel: "Continuar" });
        setPage(1);
        setRevision(value => value + 1);
      }} />}
      <div className={s.panel}>
        <form className={s.filter} onSubmit={event => { event.preventDefault(); setPage(1); setFilter(search.trim()); }}>
          <label>Buscar conta<input type="search" maxLength={100} placeholder="Nome ou e-mail" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <button className={ui.workspaceSecondary} type="submit"><UIIcon name="search" size={16} /> Buscar</button>
        </form>
        {loading && <p role="status">Consultando contas…</p>}
        {error && <p className={s.error} role="alert">{error}</p>}
        {!loading && accounts?.accounts.length === 0 && <p>Nenhuma conta encontrada.</p>}
        {!loading && Boolean(accounts?.accounts.length) && (
          <ul className={s.list} aria-label="Contas da congregação">
            {accounts?.accounts.map(account => <li className={s.row} key={account.id}>
              <div className={s.person}><UIIcon name="people" size={18} /><div><strong>{account.person.displayName}</strong><span>{account.email}</span></div></div>
              <div className={s.profiles}>{account.profiles.length ? account.profiles.map((profile, index) => (
                <span key={index}>{PERSONA_LABELS[profile.role] ?? profile.role}{profile.ministry && " · " + profile.ministry}</span>
              )) : <span>Sem perfil nesta congregação</span>}</div>
              <div className={s.accessState}><span className={s.state} data-active={account.status === "ACTIVE"}>
                {account.status === "ACTIVE" ? "Ativo" : account.invitationStatus === "INVITED" ? "Aguardando ativação" : account.invitationStatus === "PENDING_EMAIL" ? "E-mail não enviado" : "Desativado"}
              </span>
              {(account.invitationStatus === "INVITED" || account.invitationStatus === "PENDING_EMAIL") &&
                <button type="button" className={s.resend} disabled={Boolean(sending)} onClick={() => void sendLink(account, false)}>
                  {sending === account.id ? "Preparando…" : "Reenviar convite"}
                </button>}
                {account.status === "ACTIVE" && <button type="button" className={s.resend}
                  disabled={Boolean(sending)} onClick={() => void sendLink(account, true)}>
                  {sending === account.id ? "Preparando…" : "Recuperar senha"}
                </button>}
              </div>
            </li>)}
          </ul>
        )}
        {(page > 1 || accounts?.hasMore) && <div className={s.actions}>
          <button className={ui.workspaceSecondary} type="button" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Anterior</button>
          <span>Página {page}</span>
          <button className={ui.workspaceSecondary} type="button" disabled={!accounts?.hasMore || loading} onClick={() => setPage(value => value + 1)}>Próxima</button>
        </div>}
      </div>
    </section>
  );
}

function AccessForm({ token, onCreated }: { token: string; onCreated: (name: string, delivery: AccessLinkDelivery) => void }) {
  const { showFeedback } = useFeedback();
  const [term, setTerm] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [searched, setSearched] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<BuiltinRole>("MEMBRO");
  const [ministryId, setMinistryId] = useState("");
  const [ministries, setMinistries] = useState<MinistryNavItem[]>([]);
  const [busy, setBusy] = useState(false);
  const { confirm, confirmation } = useActionConfirmation();

  async function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSearched(false);
    try {
      const result = await apiGet<{ people: Person[] }>("/admin/access/people?q=" + encodeURIComponent(term.trim()), token);
      setPeople(result.people);
      setSearched(true);
    } catch (error) {
      showFeedback({ tone: "error", title: "Não foi possível concluir", message: dasError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function pickRole(next: BuiltinRole) {
    setRole(next);
    setMinistryId("");
    if (next !== "LIDER_MINISTERIO" || ministries.length) return;
    try {
      setMinistries(parseMinistryNav(await apiGet("/ministries", token)));
    } catch (error) {
      showFeedback({ tone: "error", title: "Não foi possível concluir", message: dasError(error) });
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!person || busy) return;
    setBusy(true);
    try {
      if (!(await confirm({
        title: "Criar acesso para esta pessoa?",
        subject: person.displayName,
        description: "A conta terá o perfil " + PERSONA_LABELS[role] + " nesta congregação. Um convite será enviado ao e-mail cadastrado para que a pessoa escolha a própria senha.",
        action: "Criar acesso",
      }))) return;
      const result = await apiPost<{ invite: AccessLinkDelivery }>("/admin/access", token, { personId: person.id, email, role, ...(role === "LIDER_MINISTERIO" ? { ministryId } : {}) });
      onCreated(person.displayName, result.invite);
    } catch (error) {
      showFeedback({ tone: "error", title: "Não foi possível concluir", message: dasError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.panel}>
      {confirmation}
      <h2>Novo acesso</h2>
      {!person ? (
        <>
          <form className={s.filter} onSubmit={find}>
            <label>Pessoa cadastrada<input type="search" value={term} onChange={event => setTerm(event.target.value)} placeholder="Nome ou e-mail" minLength={2} maxLength={100} required /></label>
            <button className={ui.workspaceSecondary} type="submit" disabled={busy}>Buscar pessoa</button>
          </form>
          {searched && (people.length ? <ul className={s.people}>
            {people.map(item => <li key={item.id}><button type="button" className={ui.workspaceSecondary} onClick={() => { setPerson(item); setEmail(item.email ?? ""); }}>{item.displayName}{item.email && " · " + item.email}</button></li>)}
          </ul> : <p>Nenhuma pessoa ativa sem acesso foi encontrada.</p>)}
        </>
      ) : (
        <form className={s.form} onSubmit={create}>
          <div className={s.chosen}><strong>{person.displayName}</strong><button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => setPerson(null)}>Trocar pessoa</button></div>
          <label>E-mail cadastrado<input type="email" autoComplete="off" value={email} readOnly required/><small>Para alterar o destinatário, atualize o e-mail da ficha na Secretaria.</small></label>
          <label>Perfil<select value={role} onChange={event => void pickRole(event.target.value as BuiltinRole)}>
            {BUILTIN_ROLES.filter(value => value !== "PLATFORM_ADMIN").map(value => <option key={value} value={value}>{PERSONA_LABELS[value]}</option>)}
          </select></label>
          {role === "LIDER_MINISTERIO" && <label>Ministério<select value={ministryId} onChange={event => setMinistryId(event.target.value)} required>
            <option value="">Selecione</option>{ministries.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>}
          <p className={s.inviteInfo}>A senha não é definida pelo administrador. O sistema enviará um link individual, válido por 24 horas e utilizável apenas uma vez.</p>
          <button type="submit" className={ui.workspacePrimary} disabled={busy || !email}>{busy ? "Enviando…" : "Criar acesso e enviar convite"}</button>
        </form>
      )}
    </div>
  );
}
