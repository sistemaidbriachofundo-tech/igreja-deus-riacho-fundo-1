"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost, loadStoredToken } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { BUILTIN_ROLES, PERSONA_LABELS, parseMinistryNav, type BuiltinRole, type MinistryNavItem } from "../lib/persona-navigation";
import { AppNavLink, UIIcon } from "./AppShell";
import { PageHeader } from "./ui/PageHeader";
import { useActionConfirmation } from "./ui/ActionConfirmation";
import ui from "./ui/ui.module.css";
import s from "./access-directory.module.css";

type Person = { id: string; displayName: string; email?: string | null };
type Account = {
  id: string; email: string; status: string; person: Person;
  profiles: { role: BuiltinRole; ministry: string | null }[];
};
type AccountPage = { accounts: Account[]; hasMore: boolean };

export function AccessDirectory() {
  const [token, setToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountPage | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
      <PageHeader appearance="workspace" heading="h1" title="Acessos" description="Consulte as contas da congregação e vincule novos acessos aos cadastros da Secretaria." />
      <div className={s.actions}>
        <button type="button" className={ui.workspacePrimary} aria-expanded={creating} disabled={!token} onClick={() => setCreating(value => !value)}>
          <UIIcon name="shield" size={17} /> {creating ? "Fechar cadastro de acesso" : "Novo acesso"}
        </button>
        <AppNavLink href="/app/secretaria/admissoes/?acao=cadastrar#cadastro" className={ui.workspaceSecondary}>Cadastrar pessoa</AppNavLink>
      </div>
      {creating && token && <AccessForm token={token} onCreated={name => {
        setCreating(false);
        setNotice("Acesso criado para " + name + ".");
        setPage(1);
        setRevision(value => value + 1);
      }} />}
      {notice && <p className={s.notice} role="status">{notice}</p>}
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
              <span className={s.state} data-active={account.status === "ACTIVE"}>{account.status === "ACTIVE" ? "Ativo" : "Desativado"}</span>
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

function AccessForm({ token, onCreated }: { token: string; onCreated: (name: string) => void }) {
  const [term, setTerm] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [searched, setSearched] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<BuiltinRole>("MEMBRO");
  const [ministryId, setMinistryId] = useState("");
  const [ministries, setMinistries] = useState<MinistryNavItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { confirm, confirmation } = useActionConfirmation();

  async function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSearched(false);
    try {
      const result = await apiGet<{ people: Person[] }>("/admin/access/people?q=" + encodeURIComponent(term.trim()), token);
      setPeople(result.people);
      setSearched(true);
    } catch (error) {
      setError(dasError(error));
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
      setError(dasError(error));
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!person || busy) return;
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get("password") ?? "");
    setBusy(true);
    setError("");
    try {
      if (!(await confirm({
        title: "Criar acesso para esta pessoa?",
        subject: person.displayName,
        description: "A conta terá o perfil " + PERSONA_LABELS[role] + " nesta congregação.",
        action: "Criar acesso",
      }))) return;
      await apiPost("/admin/access", token, { personId: person.id, email, password, role, ...(role === "LIDER_MINISTERIO" ? { ministryId } : {}) });
      onCreated(person.displayName);
    } catch (error) {
      setError(dasError(error));
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
          <label>E-mail de acesso<input type="email" autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required /></label>
          <label>Perfil<select value={role} onChange={event => void pickRole(event.target.value as BuiltinRole)}>
            {BUILTIN_ROLES.filter(value => value !== "PLATFORM_ADMIN").map(value => <option key={value} value={value}>{PERSONA_LABELS[value]}</option>)}
          </select></label>
          {role === "LIDER_MINISTERIO" && <label>Ministério<select value={ministryId} onChange={event => setMinistryId(event.target.value)} required>
            <option value="">Selecione</option>{ministries.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>}
          <label>Senha inicial<input type="password" name="password" autoComplete="new-password" minLength={14} maxLength={128} required /><small>Use pelo menos 14 caracteres.</small></label>
          <button type="submit" className={ui.workspacePrimary} disabled={busy}>{busy ? "Processando…" : "Criar acesso"}</button>
        </form>
      )}
      {error && <p className={s.error} role="alert">{error}</p>}
    </div>
  );
}
