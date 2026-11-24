"use client";

import { sortByName } from "@idbrf/shared";
import { useEffect, useState, type FormEvent } from "react";
import { WorkspaceSearch } from "./ui/WorkspaceSearch";
import { apiGet, apiPatch, apiPost, loadStoredToken } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { readPreventiveConflict } from "../lib/preventive-conflict";
import { BUILTIN_ROLES, PERSONA_LABELS, type BuiltinRole } from "../lib/persona-navigation";
import { UIIcon } from "./AppShell";
import { PageHeader } from "./ui/PageHeader";
import { useActionConfirmation } from "./ui/ActionConfirmation";
import { useFeedback } from "./ui/FeedbackProvider";
import ui from "./ui/ui.module.css";
import s from "./access-directory.module.css";

type Person = { id: string; displayName: string; email?: string | null };
type QaTesterAccount = { label: string; email: string; role: string; ministry: string | null; status: string; previewUrl?: string };
type QaTesterBundle = { testOnly: true; adminMfaRequired: true; accounts: QaTesterAccount[] };
type AccessRole = Exclude<BuiltinRole, "CONVIDADO"> | "LIDER_MODULO";
type ProfileSelection = { role: AccessRole; ministryId: string; moduleId: string };
type AccessProfile = {
  grantId: string; role: BuiltinRole | "LIDER_MODULO"; editable: boolean;
  ministryId: string | null; ministry: string | null; moduleId: string | null; module: string | null;
};
type MinistryOption = { id: string; name: string; modules: { id: string; name: string }[] };
const memberProfile: ProfileSelection = { role: "MEMBRO", ministryId: "", moduleId: "" };

type Account = {
  id: string; email: string; status: string; person: Person; invitationStatus?: "INVITED" | "PENDING_EMAIL" | null;
  profiles: AccessProfile[]; canEditProfiles: boolean;
};
type AccessLinkDelivery = { sent: boolean; previewUrl?: string };
type AccountPage = { accounts: Account[]; hasMore: boolean; canInviteAdministrator?: boolean };

export function accessInviteRoles(canInviteAdministrator: boolean): readonly AccessRole[] {
  return BUILTIN_ROLES.filter(role => role !== "CONVIDADO")
    .filter(role => canInviteAdministrator || role !== "PLATFORM_ADMIN")
    .flatMap(role => role === "LIDER_MINISTERIO" ? [role, "LIDER_MODULO"] as const : [role]);
}

function roleLabel(role: AccessProfile["role"]) {
  if (role === "LIDER_MODULO") return "Líder de módulo";
  if (role === "PLATFORM_ADMIN") return "Administrador da igreja";
  return PERSONA_LABELS[role] ?? role;
}

function scopeLabel(profile: AccessProfile) {
  return [profile.ministry, profile.module].filter(Boolean).join(" / ");
}

function needsMinistry(role: AccessRole) {
  return role === "LIDER_MINISTERIO" || role === "LIDER_MODULO";
}

function profileReady(profile: ProfileSelection) {
  return (!needsMinistry(profile.role) || Boolean(profile.ministryId))
    && (profile.role !== "LIDER_MODULO" || Boolean(profile.moduleId));
}

function ProfileFields({ token, value, onChange, canInviteAdministrator }: {
  token: string;
  value: ProfileSelection;
  onChange: (value: ProfileSelection) => void;
  canInviteAdministrator: boolean;
}) {
  const { showFeedback } = useFeedback();
  const [ministries, setMinistries] = useState<MinistryOption[]>([]);
  const [optionsStatus, setOptionsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const showMinistry = needsMinistry(value.role);
  const showModule = value.role === "LIDER_MODULO";

  useEffect(() => {
    if (!showMinistry) return;
    let current = true;
    setOptionsStatus("loading");
    void apiGet<{ ministries: MinistryOption[] }>("/admin/access/profile-options", token)
      .then(result => { if (current) { setMinistries(result.ministries); setOptionsStatus("ready"); } })
      .catch(error => {
        if (!current) return;
        setOptionsStatus("error");
        showFeedback({ tone: "error", title: "Não foi possível consultar os ministérios", message: dasError(error) });
      });
    return () => { current = false; };
  }, [attempt, showFeedback, showMinistry, token]);

  const availableMinistries = showModule ? ministries.filter(item => item.modules.length) : ministries;
  const modules = availableMinistries.find(item => item.id === value.ministryId)?.modules ?? [];
  return <>
    <label>Perfil<select aria-label="Perfil" value={value.role} onChange={event => onChange({
      role: event.target.value as AccessRole, ministryId: "", moduleId: "",
    })}>
      {accessInviteRoles(canInviteAdministrator).map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
    </select></label>
    {showMinistry && <label>Ministério<select aria-label="Ministério" value={value.ministryId} onChange={event => onChange({
      ...value, ministryId: event.target.value, moduleId: "",
    })} required>
      <option value="">{optionsStatus === "loading" ? "Carregando…" : "Selecione o ministério"}</option>
      {availableMinistries.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>}
    {showModule && <label>Módulo<select aria-label="Módulo" value={value.moduleId} onChange={event => onChange({
      ...value, moduleId: event.target.value,
    })} required>
      <option value="">Selecione o módulo</option>
      {modules.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>}
    {showMinistry && optionsStatus === "error" && <button type="button" className={ui.workspaceSecondary}
      onClick={() => setAttempt(count => count + 1)}>Recarregar ministérios</button>}
    {showMinistry && optionsStatus === "ready" && !availableMinistries.length && <p className={s.inviteInfo} role="status">
      {showModule ? "Nenhum módulo disponível nesta congregação." : "Nenhum ministério disponível nesta congregação."}
    </p>}
  </>;
}

export function AccessDirectory() {
  const { showFeedback } = useFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountPage | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [qaBundle, setQaBundle] = useState<QaTesterBundle | null>(null);
  const [qaBusy, setQaBusy] = useState(false);
  const isQaFrontend = process.env.NEXT_PUBLIC_API_URL === "https://id-riacho1-api-qa.vercel.app";
  async function prepareQaTesters() {
    if (!token || !isQaFrontend || qaBusy) return;
    setQaBusy(true);
    setError("");
    try {
      const bundle = await apiPost<QaTesterBundle>("/admin/access/qa-testers", token);
      setQaBundle(bundle);
      setRevision(v => v + 1);
      showFeedback({ tone: "success", title: "Acessos fictícios preparados",
        message: "Cada testador deve ativar seu próprio acesso e escolher uma senha no link individual." });
    } catch (err) {
      setError(dasError(err));
    } finally { setQaBusy(false); }
  }

  const { confirm: confirmResend, confirmation: resendConfirmation } = useActionConfirmation();
  async function grantAdministrator(account: Account) {
    if (!token || sending) return;
    if (!(await confirmResend({
      title: "Conceder perfil de administrador?",
      subject: account.person.displayName,
      description: "O acesso vale para esta congregação. A pessoa precisará entrar novamente e usar o autenticador.",
      action: "Conceder perfil",
    }))) return;
    setSending(account.id);
    setError("");
    try {
      await apiPost("/admin/access/" + encodeURIComponent(account.id) + "/administrator", token);
      showFeedback({ tone: "success", title: "Perfil de administrador concedido", message: "A pessoa precisa entrar novamente com o autenticador.", actionLabel: "Continuar" });
      setRevision(value => value + 1);
    } catch (error) {
      setError(dasError(error));
    } finally {
      setSending("");
    }
  }

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
    void apiGet<AccountPage>("/admin/access?" + new URLSearchParams({ q: filter, page: String(page), status }), token)
      .then(result => { if (current) setAccounts(result); })
      .catch(error => { if (current) { setAccounts(null); setError(dasError(error)); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, filter, page, revision, status]);

  return (
    <section className={s.directory}>
      {resendConfirmation}
      {previewUrl && <p role="status">
        <a href={previewUrl} target="_blank" rel="noreferrer">Abrir link de teste</a>
        {" · "}
        <button type="button" className={s.resend} onClick={() => setPreviewUrl("")}>Ocultar</button>
      </p>}
      <PageHeader appearance="workspace" heading="h1" title="Acessos"
        description="Gerencie os perfis de acesso e os convites da congregação."
        actions={<button type="button" className={ui.workspacePrimary} aria-expanded={creating} disabled={!token} onClick={() => { setEditing(""); setCreating(value => !value); }}>
          <UIIcon name="plus" size={17} /> {creating ? "Fechar convite" : "Novo acesso"}
        </button>}
      />

      {isQaFrontend && <div className={s.qaTesters}>
        <div><strong>Ambiente de testes · oito perfis</strong>
          <p>Pastora, 2 secretários, Louvor, Atmosfera, Homens, mentor e Mídia. Só contas fictícias; administrador continua com MFA.</p>
        </div>
        <button className={ui.workspaceSecondary} type="button" disabled={!token || qaBusy}
          onClick={() => void prepareQaTesters()}>{qaBusy ? "Preparando convites…" : "Preparar 8 acessos de teste"}</button>
        {qaBundle && <div className={s.qaResult} role="status">
          {qaBundle.accounts.map(item => <div key={item.email}>
            <strong>{item.label}</strong><span>{item.email}</span>
            {item.previewUrl ?
              <a href={item.previewUrl} target="_blank" rel="noopener noreferrer">Ativar conta e definir senha</a> :
              <span>{item.status === "ACTIVE" ? "Conta ativa" : "Convite indisponível"}</span>}
          </div>)}
          <small>Os links são de uso único, expiram em 24 horas e não são guardados no painel. Não compartilhe com terceiros.</small>
        </div>}
      </div>}
      {creating && token && <AccessForm token={token} canInviteAdministrator={accounts?.canInviteAdministrator === true} onCreated={(name, delivery) => {
        setCreating(false);
        setPreviewUrl(delivery.previewUrl ?? "");
        showFeedback({ tone: "success", title: delivery.sent ? "Convite enviado" : "Convite de teste criado",
          message: "A senha de " + name + " será definida no link individual.", actionLabel: "Continuar" });
        setPage(1);
        setRevision(value => value + 1);
      }} />}
      <div className={s.panel}>
        <form className={s.filter} aria-label="Buscar e filtrar contas" onSubmit={event => { event.preventDefault(); setPage(1); setFilter(search.trim()); }}>
          <div className={s.searchGroup}>
            <WorkspaceSearch aria-label="Buscar conta" maxLength={100} placeholder="Nome ou e-mail"
              value={search} onChange={event => setSearch(event.target.value)} />
            <button className={ui.workspaceSecondary} type="submit">Buscar</button>
          </div>
          <label className={s.statusFilter}>Situação<select value={status} onChange={event => { setPage(1); setStatus(event.target.value); }}>
            <option value="">Todas</option><option value="ACTIVE">Ativas</option><option value="DISABLED">Sem acesso ativo</option>
          </select></label>
        </form>
        {loading && <p role="status">Consultando contas…</p>}
        {error && <p className={s.error} role="alert">{error} <button className={s.resend} type="button" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></p>}
        {!loading && accounts?.accounts.length === 0 && <p>Nenhuma conta encontrada.</p>}
        {!loading && Boolean(accounts?.accounts.length) && (
          <ul className={s.list} aria-label="Contas da congregação">
            {accounts?.accounts.map(account => {
              const active = account.status === "ACTIVE";
              const invited = account.invitationStatus === "INVITED";
              const pendingEmail = account.invitationStatus === "PENDING_EMAIL";
              const isEditing = editing === account.id && Boolean(token);
              const canGrant = accounts.canInviteAdministrator && active
                && !account.profiles.some(profile => profile.role === "CONVIDADO")
                && !account.profiles.some(profile => profile.role === "PLATFORM_ADMIN");
              return <li className={s.row} key={account.id}>
                <div className={s.person}>
                  <span className={s.avatar}><UIIcon name="people" size={19} /></span>
                  <div><strong>{account.person.displayName}</strong><span className={s.email}>{account.email}</span></div>
                </div>
                <div className={s.profiles}>{account.profiles.length ? account.profiles.map(profile => (
                  <span key={profile.grantId + (profile.moduleId ?? "")}>{roleLabel(profile.role)}{scopeLabel(profile) && " · " + scopeLabel(profile)}</span>
                )) : <span>Sem perfil nesta congregação</span>}</div>
                <div className={s.accessState}>
                  <span className={s.state} data-tone={active ? "active" : invited || pendingEmail ? "pending" : "inactive"}>
                    {active ? "Ativo" : invited ? "Aguardando ativação" : pendingEmail ? "E-mail não enviado" : "Desativado"}
                  </span>
                  {(account.canEditProfiles || active || invited || pendingEmail) && <details className={s.accountActions}>
                    <summary aria-label={"Gerenciar acesso de " + account.person.displayName}><UIIcon name="more" size={17} /> Gerenciar</summary>
                    <div>
                      {account.canEditProfiles && <button type="button" className={ui.workspaceQuiet} aria-expanded={isEditing}
                        onClick={() => { setCreating(false); setEditing(isEditing ? "" : account.id); }}>
                        <UIIcon name="shield" size={16} /> {isEditing ? "Fechar edição de perfis" : "Editar perfis"}
                      </button>}
                      {(invited || pendingEmail) && <button type="button" className={ui.workspaceQuiet} disabled={Boolean(sending)} onClick={() => void sendLink(account, false)}>
                        <UIIcon name="mail" size={16} /> {sending === account.id ? "Preparando…" : "Reenviar convite"}
                      </button>}
                      {active && <button type="button" className={ui.workspaceQuiet} disabled={Boolean(sending)} onClick={() => void sendLink(account, true)}>
                        <UIIcon name="refresh" size={16} /> {sending === account.id ? "Preparando…" : "Recuperar senha"}
                      </button>}
                      {canGrant && <button type="button" className={ui.workspaceQuiet} disabled={Boolean(sending)} onClick={() => void grantAdministrator(account)}>
                        <UIIcon name="shield" size={16} /> Conceder administração
                      </button>}
                    </div>
                  </details>}
                </div>
                {isEditing && token && <AccessProfilesEditor account={account} token={token}
                  canInviteAdministrator={accounts.canInviteAdministrator === true}
                  onSaved={() => { setEditing(""); setRevision(value => value + 1); }} />}
              </li>;
            })}
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

function AccessProfilesEditor({ account, token, canInviteAdministrator, onSaved }: {
  account: Account;
  token: string;
  canInviteAdministrator: boolean;
  onSaved: () => void;
}) {
  const { confirm, confirmation } = useActionConfirmation();
  const { showFeedback } = useFeedback();
  const [operation, setOperation] = useState<"add" | AccessProfile | null>(null);
  const [selection, setSelection] = useState<ProfileSelection>(memberProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function edit(profile: AccessProfile) {
    if (profile.role === "CONVIDADO") return;
    setError("");
    setOperation(profile);
    setSelection({ role: profile.role, ministryId: profile.ministryId ?? "", moduleId: profile.moduleId ?? "" });
  }

  async function save(previous: AccessProfile | null, profile?: ProfileSelection) {
    if (busy || (!previous && !profile)) return;
    setBusy(true);
    setError("");
    try {
      const removed = previous ? [roleLabel(previous.role), scopeLabel(previous)].filter(Boolean).join(" · ") : "";
      if (!(await confirm({
        title: profile ? "Salvar perfil de acesso?" : "Remover perfil de acesso?",
        subject: account.person.displayName,
        description: profile ? "A pessoa precisará entrar novamente para usar o acesso atualizado."
          : "O perfil " + removed + " será removido desta conta.",
        action: profile ? "Salvar perfil" : "Remover perfil",
      }))) return;
      const result = await apiPatch<{ changed: boolean }>("/admin/access/" + encodeURIComponent(account.id) + "/profiles", token, {
        ...(previous ? { grantId: previous.grantId, moduleId: previous.moduleId ?? undefined } : {}),
        profile,
      });
      setOperation(null);
      if (result.changed) {
        showFeedback({ tone: "success", title: "Acesso atualizado",
          message: "Os novos perfis estarão disponíveis no próximo login.", actionLabel: "Continuar" });
        onSaved();
      }
    } catch (error) {
      setError(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className={s.profileEditor}>
    {confirmation}
    <h2>Perfis de {account.person.displayName}</h2>
    {account.profiles.length ? <ul className={s.profileList}>
      {account.profiles.map(profile => {
        const label = scopeLabel(profile) || roleLabel(profile.role);
        return <li key={profile.grantId + (profile.moduleId ?? "")}>
          <div><strong>{roleLabel(profile.role)}</strong>{scopeLabel(profile) && <span>{scopeLabel(profile)}</span>}</div>
          {profile.editable ? <div className={s.actions}>
            <button type="button" className={ui.workspaceSecondary} disabled={busy}
              aria-label={"Editar perfil de " + label} onClick={() => edit(profile)}>Editar</button>
            <button type="button" className={ui.workspaceQuiet} disabled={busy}
              aria-label={"Remover perfil de " + label} onClick={() => void save(profile)}>Remover</button>
          </div> : <span>Gerenciado na origem do acesso</span>}
        </li>;
      })}
    </ul> : <p>Nenhum perfil nesta congregação.</p>}
    {operation ? <form className={s.form} onSubmit={event => {
      event.preventDefault();
      if (profileReady(selection)) void save(operation === "add" ? null : operation, selection);
    }}>
      <ProfileFields token={token} value={selection} onChange={setSelection} canInviteAdministrator={canInviteAdministrator} />
      <div className={s.chosen}>
        <button type="submit" className={ui.workspacePrimary} disabled={busy || !profileReady(selection)}>Salvar perfil</button>
        <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => { setOperation(null); setError(""); }}>Cancelar</button>
      </div>
    </form> : <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => {
      setError(""); setOperation("add"); setSelection(memberProfile);
    }}>Adicionar perfil</button>}
    {error && <p className={s.error} role="alert">{error}</p>}
  </div>;
}

function AccessForm({ token, canInviteAdministrator = false, onCreated }: {
  token: string;
  canInviteAdministrator?: boolean;
  onCreated: (name: string, delivery: AccessLinkDelivery) => void;
}) {
  const { showFeedback } = useFeedback();
  const [term, setTerm] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [searched, setSearched] = useState(false);
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<ProfileSelection>(memberProfile);
  const { role } = profile;
  const isChurchAdministrator = role === "PLATFORM_ADMIN";
  const [busy, setBusy] = useState(false);
  const { confirm, confirmation } = useActionConfirmation();

  async function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSearched(false);
    try {
      const result = await apiGet<{ people: Person[] }>("/admin/access/people?q=" + encodeURIComponent(term.trim()), token);
      setPeople(sortByName(result.people, person => person.displayName));
      setSearched(true);
    } catch (error) {
      showFeedback({ tone: "error", title: "Não foi possível concluir", message: dasError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!person || busy || !profileReady(profile)) return;
    setBusy(true);
    try {
      if (!(await confirm({
        title: isChurchAdministrator ? "Convidar para a administração da igreja?" : "Criar acesso para esta pessoa?",
        subject: person.displayName,
        description: "A conta terá o perfil " + roleLabel(role) + " nesta congregação. Um convite será enviado ao e-mail cadastrado para que a pessoa escolha a própria senha.",
        action: "Criar acesso",
      }))) return;
      const result = await apiPost<{ invite: AccessLinkDelivery }>("/admin/access", token, { personId: person.id, email, ...profile });
      onCreated(person.displayName, result.invite);
    } catch (error) {
      const conflict = readPreventiveConflict(error);
      if (conflict?.code === "ACCESS_INVITE_OPEN" && conflict.existing) {
        const resend = await confirm({
          title: conflict.title,
          description: conflict.message,
          action: conflict.action,
          cancel: conflict.cancel,
        });
        if (resend) {
          try {
            const delivery = await apiPost<AccessLinkDelivery>("/admin/access/" + encodeURIComponent(conflict.existing.id) + "/invite/resend", token);
            onCreated(person.displayName, delivery);
            return;
          } catch (issue) {
            showFeedback({ tone: "error", title: "Convite não reenviado", message: dasError(issue) });
            return;
          }
        }
      }
      showFeedback({
        tone: conflict ? "warning" : "error",
        title: conflict?.title ?? "Não foi possível concluir",
        message: conflict?.message ?? dasError(error),
      });
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
          <ProfileFields token={token} value={profile} onChange={setProfile} canInviteAdministrator={canInviteAdministrator} />
          {isChurchAdministrator && <p className={s.inviteInfo}>Este perfil administra os acessos e as rotinas desta congregação.</p>}
          <p className={s.inviteInfo}>A senha não é definida pelo administrador. O sistema enviará um link individual, válido por 24 horas e utilizável apenas uma vez.</p>
          <button type="submit" className={ui.workspacePrimary} disabled={busy || !email || !profileReady(profile)}>{busy ? "Enviando…" : "Criar acesso e enviar convite"}</button>
        </form>
      )}
    </div>
  );
}
