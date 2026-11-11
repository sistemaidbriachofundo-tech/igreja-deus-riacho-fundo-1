"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import { AppNavLink, AppShell, UIIcon } from "./AppShell";
import { PersonaBoard } from "./PersonaHome";
import { PersonPicker } from "./PersonPicker";
import { SecretaryDossier, credentialFromMemberships } from "./SecretaryDossier";
import { apiGet, apiLogin, apiPost, clearToken, isInvalidSession, loadStoredToken, loginFailureMessage, storeToken, type LoginResult } from "../lib/api";
import { readPanel } from "../lib/panel-read";
import s from "./hml-phase-one.module.css";
import { withBasePath } from "../lib/paths";

type View = "overview" | "members" | "secretary" | "cards";
type Role = "SECRETARIA" | "PASTOR" | "PLATFORM_ADMIN" | "MEMBRO";
type AuthUser = LoginResult["user"];
type Membership = {
  id: string;
  status: string;
  joinedAt: string;
  notes: string | null;
  person: { id: string; displayName: string; email: string | null; status: string; householdId: string | null };
  activeCredentialId: string | null;
};
type Admission = {
  id: string;
  personId: string;
  membershipId: string | null;
  status: string;
  modality: string | null;
  currentStep: "modality" | "documents" | "secretaria" | "pastor";
  checklist: { modalityRecorded: boolean; documentsComplete: boolean; secretariaApproved: boolean; pastorApproved: boolean };
  createdAt: string;
  credentialEligible: boolean;
};
type Household = { id: string; label: string; members?: unknown[] };

/**
 * Contrato com a frente C (carteirinhas), para o integrador J.
 * Quando view="cards", cada credencial ativa pode receber este preview.
 * Até o PR de C, a prop fica ausente e a lista segue sem a frente/verso.
 * Não enviar CPF, contato, senha nem o conteúdo do QR.
 */
export type CredentialPreviewProps = {
  personName: string;
  membershipId: string;
  credentialId: string | null;
  joinedAt: string;
  active: boolean;
};

export type HmlPhaseOneProps = {
  view: View;
  CredentialPreview?: ComponentType<CredentialPreviewProps>;
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  PENDING_ADMISSION: "Em admissão",
  TRANSFERRED: "Transferido",
  APPROVED: "Aprovado",
  DRAFT: "Rascunho",
  AWAITING_DOCUMENTS: "Documentação",
  AWAITING_SECRETARIA: "Análise da secretaria",
  AWAITING_PASTOR: "Aprovação pastoral",
  REJECTED: "Recusado",
  CANCELLED: "Cancelado",
  BATISMO: "Batismo",
  TRANSFERENCIA: "Transferência",
  RECONCILIACAO: "Reconciliação",
  OUTRO: "Outro",
};

function label(value: string) {
  return statusLabels[value] ?? "Registrado";
}

function displayError(error: unknown): string {
  if (!(error instanceof Error)) return "Não foi possível concluir. Confira os dados e tente novamente.";
  if (/\(401\)|401|expired|expirad|JWT/.test(error.message)) return "Sua sessão expirou. Entre novamente.";
  if (/\(403\)|403|permissão|permiss/.test(error.message)) return "Seu perfil não pode executar esta operação.";
  if (/E-mail já cadastrado/.test(error.message)) return "Já existe uma pessoa com este e-mail. Use Iniciar admissão para localizá-la.";
  if (/CREDENTIAL_NOT_ELIGIBLE|credentialEligible=false|admissão pastoral não aprovada/i.test(error.message)) return "A admissão ainda precisa de aprovação pastoral antes da emissão da carteirinha.";
  if (/Já existe carteirinha ativa/i.test(error.message)) return "Esta pessoa já possui uma carteirinha ativa. Abra a credencial existente antes de solicitar outra.";
  if (/\(409\)|409/.test(error.message)) return "O registro entrou em conflito com uma alteração existente. Atualize os dados e confira a etapa atual.";
  return "Não foi possível concluir. Atualize a lista e tente novamente.";
}

function hasRole(user: AuthUser | null, role: Role) {
  return Boolean(user?.grants.some(grant => grant.roleCode === role));
}

function personInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toLocaleUpperCase("pt-BR")).join("") || "ID";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "—";
}

const PAGE_SIZE = 12;
const CLOSED_ADMISSIONS = ["APPROVED", "REJECTED", "CANCELLED"];

function ListPager({ total, page, onChange }: { total: number; page: number; onChange: (page: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  return (
    <nav className={s.pagination} aria-label="Páginas de resultados">
      <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>Anterior</button>
      <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}</span>
      <button type="button" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => onChange(page + 1)}>Próxima</button>
    </nav>
  );
}

export function CredentialCards({
  memberships,
  busy,
  CredentialPreview,
  onToggle,
}: {
  memberships: Membership[];
  busy: boolean;
  CredentialPreview?: ComponentType<CredentialPreviewProps>;
  onToggle: (membership: Membership) => void;
}) {
  const active = memberships.filter(membership => membership.status === "ACTIVE");
  if (active.length === 0) return <p className={s.empty}>Nenhuma pessoa ativa para emitir carteirinha.</p>;
  return (
    <div className={s.admissions}>
      {active.map(membership => {
        const issued = Boolean(membership.activeCredentialId);
        const previewProps: CredentialPreviewProps = {
          personName: membership.person.displayName,
          membershipId: membership.id,
          credentialId: membership.activeCredentialId,
          joinedAt: membership.joinedAt,
          active: issued,
        };
        return (
          <article key={membership.id} className={s.admission}>
            <div>
              <strong>{membership.person.displayName}</strong>
              <small>{issued ? "Carteirinha ativa" : "Aguardando emissão"}{Number.isFinite(Date.parse(membership.joinedAt)) ? ` · desde ${formatDate(membership.joinedAt)}` : ""}</small>
            </div>
            {CredentialPreview ? <CredentialPreview {...previewProps} /> : null}
            <button type="button" disabled={busy} onClick={() => onToggle(membership)}>
              {issued ? "Revogar credencial" : "Emitir credencial"}
            </button>
          </article>
        );
      })}
    </div>
  );
}

export function HmlPhaseOne({ view, CredentialPreview }: HmlPhaseOneProps) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [query, setQuery] = useState("");
  const [listPage, setListPage] = useState(0);
  const [membershipStatus, setMembershipStatus] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [secretarySection, setSecretarySection] = useState<"pessoas" | "admissoes">("pessoas");
  const [showHistory, setShowHistory] = useState(false);
  const [admissionForm, setAdmissionForm] = useState<"existing" | "new" | null>(null);
  const [admissionPerson, setAdmissionPerson] = useState("");
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [searchedPerson, setSearchedPerson] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [modality, setModality] = useState("BATISMO");

  useEffect(() => {
    if (view !== "secretary") return;
    const readSection = () => {
      const params = new URLSearchParams(window.location.search);
      const action = params.get("acao");
      setSecretarySection(params.get("aba") === "admissoes" || action === "cadastrar" || action === "admissao" ? "admissoes" : "pessoas");
      if (action === "cadastrar") setAdmissionForm("new");
      else if (action === "admissao") setAdmissionForm("existing");
      setFichaId(params.get("pessoa"));
      const status = params.get("situacao") ?? "";
      setMembershipStatus(["ACTIVE", "INACTIVE", "PENDING_ADMISSION"].includes(status) ? status : "");
    };
    readSection();
    window.addEventListener("popstate", readSection);
    return () => window.removeEventListener("popstate", readSection);
  }, [view]);

  useEffect(() => {
    if (view !== "members") return;
    const openFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setFichaId(params.get("pessoa"));
      const status = params.get("situacao") ?? "";
      setMembershipStatus(["ACTIVE", "INACTIVE", "PENDING_ADMISSION"].includes(status) ? status : "");
    };
    openFromUrl();
    window.addEventListener("popstate", openFromUrl);
    return () => window.removeEventListener("popstate", openFromUrl);
  }, [view]);

  const refresh = useCallback(async (activeToken: string, fresh = false) => {
    const me = await apiGet<AuthUser>("/auth/me", activeToken);
    setUser(me);
    const secretaria = hasRole(me, "SECRETARIA") || hasRole(me, "PLATFORM_ADMIN");
    const staff = secretaria || hasRole(me, "PASTOR");
    const settled = await Promise.allSettled([
      secretaria && view !== "overview"
        ? readPanel(activeToken, "/memberships", () => apiGet<{ memberships: Membership[] }>("/memberships", activeToken), { fresh })
        : Promise.resolve({ memberships: [] as Membership[] }),
      staff && view === "secretary"
        ? readPanel(activeToken, "/admissions", () => apiGet<{ admissions: Admission[] }>("/admissions", activeToken), { fresh })
        : Promise.resolve({ admissions: [] as Admission[] }),
      secretaria && (view === "members" || view === "secretary")
        ? apiGet<{ households: Household[] }>("/households", activeToken)
        : Promise.resolve({ households: [] as Household[] }),
    ]);
    const invalid = settled.find(item => item.status === "rejected" && isInvalidSession(item.reason));
    if (invalid && invalid.status === "rejected") throw invalid.reason;
    const [people, processes, families] = settled;
    if (people.status === "fulfilled") setMemberships(people.value.memberships);
    if (processes.status === "fulfilled") setAdmissions(processes.value.admissions);
    if (families.status === "fulfilled") setHouseholds(families.value.households);
    if (settled.some(item => item.status === "rejected")) {
      setNotice("Algumas informações não carregaram. As listas disponíveis continuam acessíveis. Use Atualizar para tentar novamente.");
    }
  }, [view]);

  useEffect(() => {
    const stored = loadStoredToken();
    if (!stored) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    setToken(stored);
    void refresh(stored).catch(err => {
      if (!isInvalidSession(err)) {
        if (!cancelled) {
          setToken(stored);
          setError(displayError(err));
        }
        return;
      }
      clearToken();
      if (!cancelled) {
        setToken(null);
        setUser(null);
      }
    }).finally(() => {
      if (!cancelled) setChecking(false);
    });
    return () => { cancelled = true; };
  }, [refresh]);

  const secretary = hasRole(user, "SECRETARIA") || hasRole(user, "PLATFORM_ADMIN");
  const pastor = hasRole(user, "PASTOR");
  const staff = secretary || pastor;
  const membershipByPerson = useMemo(() => new Map(memberships.map(membership => [membership.person.id, membership])), [memberships]);
  const householdById = useMemo(() => new Map(households.map(household => [household.id, household.label])), [households]);
  const pending = admissions.filter(admission => !CLOSED_ADMISSIONS.includes(admission.status));
  const active = memberships.filter(membership => membership.status === "ACTIVE");
  const q = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = memberships.filter(membership =>
    (!familyFilter || membership.person.householdId === familyFilter) &&
    (!membershipStatus || membership.status === membershipStatus) &&
    [membership.person.displayName, membership.person.email ?? "", label(membership.status)].join(" ").toLocaleLowerCase("pt-BR").includes(q)
  );
  const selectedFamily = households.find(household => household.id === familyFilter);

  const filteredAdmissions = (showHistory ? admissions : pending).filter(admission => {
    const member = membershipByPerson.get(admission.personId);
    return [member?.person.displayName ?? "", admission.modality ?? "", admission.status].join(" ").toLocaleLowerCase("pt-BR").includes(q);
  });

  const showsPeople = view === "members" || (view === "secretary" && secretary && secretarySection === "pessoas");
  const showsAdmissions = view === "secretary" && (!secretary || secretarySection === "admissoes");
  const resultCount = showsAdmissions ? filteredAdmissions.length : filtered.length;
  const visiblePage = Math.min(listPage, Math.max(0, Math.ceil(resultCount / PAGE_SIZE) - 1));
  const firstRow = visiblePage * PAGE_SIZE;

  function updateQuery(value: string) {
    setQuery(value);
    setListPage(0);
  }

  function chooseSecretarySection(next: "pessoas" | "admissoes") {
    setSecretarySection(next);
    setQuery("");
    setListPage(0);
    setAdmissionForm(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("aba", next);
      url.searchParams.delete("acao");
      window.history.replaceState(null, "", url);
    }
  }

  function startSecretaryAction(next: "new" | "existing") {
    setSecretarySection("admissoes");
    setAdmissionForm(next);
    setQuery("");
    setListPage(0);
    const url = new URL(window.location.href);
    url.searchParams.set("aba", "admissoes");
    url.searchParams.set("acao", next === "new" ? "cadastrar" : "admissao");
    window.history.replaceState(null, "", url);
    window.setTimeout(() => document.getElementById("cadastro")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  }

  function logout() {
    clearToken();
    setToken(null);
    setUser(null);
    setMemberships([]);
    setFamilyFilter("");
    setSecretarySection("pessoas");
    setAdmissions([]);
    setHouseholds([]);
    setFichaId(null);
    setPassword("");
    setError("");
    setNotice("");
    window.location.assign(withBasePath("/login/"));
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const signed = await apiLogin(loginEmail.trim(), password);
      await refresh(signed.accessToken);
      storeToken(signed.accessToken);
      setToken(signed.accessToken);
      setPassword("");
      setNotice("Acesso autorizado.");
    } catch (err) {
      setError(loginFailureMessage(err));
      if (isInvalidSession(err)) {
        clearToken();
        setToken(null);
      }
    } finally {
      setBusy(false);
      setChecking(false);
    }
  }

  async function run(action: () => Promise<unknown>, message: string): Promise<boolean> {
    if (!token) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      try {
        await refresh(token, true);
        setNotice(message);
      } catch {
        // A gravação já foi concluída: não anunciar falha de gravação por erro na releitura.
        setNotice(message + " Não foi possível atualizar a lista agora; recarregue a página para conferir.");
      }
      return true;
    } catch (err) {
      setError(displayError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitSecretariatForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !secretary || busy || !admissionForm) return;
    const name = newName.trim();
    const email = newEmail.trim().toLowerCase();
    if (admissionForm === "existing" && !admissionPerson) {
      setError("Selecione a pessoa que vai iniciar a admissão.");
      return;
    }
    if (admissionForm === "new" && (name.length < 3 || !email.endsWith("@example.test"))) {
      setError("Use um nome e um e-mail terminado em @example.test.");
      return;
    }
    const completed = admissionForm === "existing"
      ? await run(() => apiPost("/admissions", token, { personId: admissionPerson, modality }), "Protocolo de admissão aberto.")
      : await run(async () => {
          const candidates = await apiPost<{ hits: Array<{ person: { email: string | null } }> }>(
            "/persons/candidates", token, { displayName: name, email },
          );
          if (candidates.hits.some(hit => hit.person.email?.toLowerCase() === email)) {
            throw new Error("E-mail já cadastrado.");
          }
          return apiPost("/memberships", token, { displayName: name, email });
        }, "Pessoa cadastrada. Você já pode iniciar a admissão quando precisar.");
    if (completed) {
      setNewName("");
      setNewEmail("");
      setAdmissionPerson("");
      setAdmissionForm(null);
    }
  }

  function nextAdmission(admission: Admission) {
    if (!token) return;
    const stage = admission.currentStep;
    if (stage === "pastor" && !pastor) return;
    if (stage !== "pastor" && !secretary) return;
    void run(
      () => apiPost("/admissions/" + encodeURIComponent(admission.id) + "/advance", token, {
        completeStep: stage,
        decision: stage === "pastor" || stage === "secretaria" ? "APPROVE" : undefined,
        modality: stage === "modality" ? "BATISMO" : undefined,
      }),
      stage === "pastor" ? "Aprovação pastoral registrada." : "Etapa registrada.",
    );
  }

  function issueCard(membership: Membership) {
    if (!token || !secretary) return;
    void run(() => apiPost("/credentials/issue/" + encodeURIComponent(membership.id), token), "Credencial emitida.");
  }

  function revokeCard(membership: Membership) {
    const credentialId = membership.activeCredentialId;
    if (!token || !secretary || !credentialId) return;
    void run(() => apiPost("/credentials/revoke/" + encodeURIComponent(credentialId), token), "Credencial revogada.");
  }

  const names: Record<View, string> = {
    overview: "Início",
    members: "Secretaria",
    secretary: "Secretaria",
    cards: "Carteirinhas",
  };
  const activeNav = view === "overview" ? "visao" : view === "members" || view === "secretary" ? "secretaria" : "carteirinha";

  if (process.env.NEXT_PUBLIC_HML_ENABLED !== "true") {
    return (
      <AppShell active={activeNav} meta="Área administrativa">
        <section className={s.loginPanel}>
          <h1>Ambiente indisponível</h1>
          <p>Esta área não está habilitada nesta publicação.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell active={activeNav} meta={names[view]}>
      <div className={s.page} data-ficha-open={fichaId ? "true" : undefined} data-hml-view={view}>
        {!token || !user ? (
          checking ? <section className={s.loginPanel} role="status"><h1>Verificando sessão…</h1></section> : <section className={s.loginPanel} aria-labelledby="login-hml">
            <span className={s.kicker}>Acesso à gestão</span>
            <h1 id="login-hml">Entre no ID Riacho 1</h1>
            <p>Use seu e-mail e senha para acessar as informações da igreja.</p>
            {error && <p role="alert" className={s.error}>{error}</p>}
            <form onSubmit={login} className={s.form}>
              <label>E-mail<input type="email" required autoComplete="username" value={loginEmail} onChange={event => setLoginEmail(event.target.value)} placeholder="nome@example.test" /></label>
              <label>Senha<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
              <button type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
            </form>
          </section>
        ) : (
          <div>
            {view !== "overview" && (
              <header className={s.heading}>
                <div>
                  <span className={s.kicker}>Gestão da congregação</span>
                  <h1>{names[view]}</h1>
                  <p>
                    {view === "members" && "Cadastros e vínculos familiares fazem parte da Secretaria."}
                    {view === "secretary" && "Um único lugar para acompanhar pessoas, vínculos familiares e admissões."}
                    {view === "cards" && "Emissão e situação das carteirinhas."}
                  </p>
                </div>
                <div className={s.headingActions}>
                  {view === "members" && secretary && <AppNavLink className={s.primaryButton} href="/app/secretaria/?aba=admissoes&acao=cadastrar#cadastro">Cadastrar pessoa <UIIcon name="arrow" size={17} /></AppNavLink>}
                  {view === "secretary" && secretary && <button type="button" className={s.primaryButton} onClick={() => startSecretaryAction("new")}>Cadastrar pessoa <UIIcon name="arrow" size={17} /></button>}
                <button type="button" className={s.secondaryButton} onClick={() => {
                  setError("");
                  setChecking(true);
                  void refresh(token, true).catch(err => setError(displayError(err))).finally(() => setChecking(false));
                }} disabled={checking || busy}>
                  <UIIcon name="refresh" size={17} /> Atualizar
                </button>
                </div>
              </header>
            )}
            {notice && <div role="status" className={s.notice}>{notice}</div>}
            {error && <div role="alert" className={s.error}>{error}</div>}
            {checking && <p className={s.empty} role="status">Carregando registros…</p>}
            {view === "secretary" && staff && (
              <nav className={s.secretaryTabs} aria-label="Áreas da secretaria">
                {secretary && <button type="button" aria-current={secretarySection === "pessoas" ? "page" : undefined} onClick={() => chooseSecretarySection("pessoas")}>Pessoas <span>{memberships.length}</span></button>}
                <button type="button" aria-current={!secretary || secretarySection === "admissoes" ? "page" : undefined} onClick={() => chooseSecretarySection("admissoes")}>Cadastros e admissões <span>{pending.length}</span></button>
              </nav>
            )}
            {!checking && view === "secretary" && staff && (
              <div className={s.contextLine} role="status">
                {secretary && <span><strong>{memberships.length}</strong> pessoas vinculadas</span>}
                {secretary && <span><strong>{active.length}</strong> ativas</span>}
                <span><strong>{pending.length}</strong> admissões em andamento</span>
              </div>
            )}
            {view === "overview" && <PersonaBoard />}
            {showsPeople && (
              <div className={s.peopleWorkspace}>
                <section className={s.panel}>
                  <div className={s.panelHeading}>
                    <div className={s.panelHeadingCopy}><h2>Pessoas cadastradas</h2><span role="status">{filtered.length} {filtered.length === 1 ? "pessoa encontrada" : "pessoas encontradas"}{selectedFamily ? ` · ${selectedFamily.label}` : ""}</span></div>
                    <input type="search" value={query} onChange={event => updateQuery(event.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar pessoas por nome ou e-mail" />
                  </div>
                  {staff && (
                    <details className={s.personLookup}>
                      <summary>Não encontrou na lista? Buscar em todos os cadastros</summary>
                      <div className={s.personLookupContent}>
                        <PersonPicker token={token} roles={user.grants.map(grant => grant.roleCode)} label="Procurar ficha por nome" value={searchedPerson} onChange={setSearchedPerson} placeholder="Digite o nome da pessoa" />
                        <button type="button" className={s.openFicha} disabled={!searchedPerson} onClick={() => { setFichaId(searchedPerson); setSearchedPerson(""); }}>Abrir ficha selecionada</button>
                      </div>
                    </details>
                  )}
                  {secretary && <div className={s.peopleFilters}>
                    <div className={s.viewFilter} role="group" aria-label="Situação das pessoas">
                      {[["", "Todas"], ["ACTIVE", "Ativas"], ["INACTIVE", "Inativas"], ["PENDING_ADMISSION", "Em admissão"]].map(([status, title]) =>
                        <button key={status} type="button" aria-pressed={membershipStatus === status}
                          onClick={() => { setMembershipStatus(status); setListPage(0); }}>{title}</button>
                      )}
                    </div>
                    <label className={s.familySelect}>Família
                      <select aria-label="Filtrar pessoas por família" value={familyFilter} onChange={event => { setFamilyFilter(event.target.value); setListPage(0); }}>
                        <option value="">Todas as famílias</option>
                        {households.map(family => <option key={family.id} value={family.id}>{family.label}</option>)}
                      </select>
                    </label>
                  </div>}
                  {secretary && (familyFilter || query || membershipStatus) && <div className={s.activeFilters}>
                    <span>{selectedFamily ? `Família: ${selectedFamily.label}` : "Filtros ativos"}</span>
                    <button type="button" onClick={() => { setFamilyFilter(""); setMembershipStatus(""); updateQuery(""); }}>Limpar filtros</button>
                  </div>}
                  {!secretary ? <p className={s.empty}>Use a busca acima para consultar uma ficha.</p> : checking ? null : (
                    <div className={s.tableWrap}>
                      <table>
                        <thead>
                          <tr><th>Nome</th><th>Família</th><th>Situação</th><th>E-mail</th><th>Ficha</th></tr>
                        </thead>
                        <tbody>
                          {filtered.slice(firstRow, firstRow + PAGE_SIZE).map(membership => (
                            <tr key={membership.person.id}>
                              <td data-label="Nome"><div className={s.personIdentity}><span className={s.personInitials} aria-hidden="true">{personInitials(membership.person.displayName)}</span><strong>{membership.person.displayName}</strong></div></td>
                              <td data-label="Família">{membership.person.householdId ? householdById.get(membership.person.householdId) ?? "Vínculo não encontrado" : "Sem vínculo familiar"}</td>
                              <td data-label="Situação"><span className={s.statusPill} data-status={membership.status}>{label(membership.status)}</span></td>
                              <td data-label="E-mail">{membership.person.email ?? "—"}</td>
                              <td data-label="Ficha">
                                <button type="button" className={s.openFicha} onClick={() => setFichaId(membership.person.id)} aria-label={"Abrir ficha de " + membership.person.displayName}>Abrir ficha</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filtered.length === 0 && !error && <p className={s.empty}>Nenhuma pessoa encontrada.</p>}
                      <ListPager total={filtered.length} page={visiblePage} onChange={setListPage} />
                    </div>
                  )}
                </section>
              </div>
            )}
            {showsAdmissions && (
              <div className={s.grid}>
                <section className={s.panel}>
                  <div className={s.panelHeading}>
                    <div className={s.panelHeadingCopy}><h2>Protocolos de admissão</h2><span role="status">{filteredAdmissions.length} {filteredAdmissions.length === 1 ? "protocolo encontrado" : "protocolos encontrados"}</span></div>
                    <input type="search" value={query} onChange={event => updateQuery(event.target.value)} placeholder="Buscar processo" aria-label="Buscar admissão" />
                  </div>
                  <div className={s.viewFilter} role="group" aria-label="Filtrar protocolos">
                    <button type="button" aria-pressed={!showHistory} onClick={() => { setShowHistory(false); setListPage(0); }}>Em andamento</button>
                    <button type="button" aria-pressed={showHistory} onClick={() => { setShowHistory(true); setListPage(0); }}>Todos</button>
                  </div>
                  {!staff ? <p className={s.empty}>Seu perfil não consulta os processos.</p> : checking ? null : (
                    <div className={s.admissions}>
                      {filteredAdmissions.slice(firstRow, firstRow + PAGE_SIZE).map(admission => {
                        const canAct = admission.currentStep === "pastor" ? pastor : secretary;
                        const done = CLOSED_ADMISSIONS.includes(admission.status);
                        const personName = membershipByPerson.get(admission.personId)?.person.displayName ?? "Pessoa em admissão";
                        const stepLabel = admission.currentStep === "pastor"
                          ? "decisão pastoral"
                          : admission.currentStep === "secretaria"
                            ? "secretaria"
                            : "documentação";
                        return (
                          <article key={admission.id} className={s.admission}>
                            <div>
                              <strong>{personName}</strong>
                              <small><span className={s.statusPill} data-status={admission.status}>{label(admission.status)}</span> {label(admission.modality ?? "")}</small>
                            </div>
                            <div className={s.admissionActions}>
                              <AppNavLink className={s.openFicha} href={`/app/secretaria/?aba=pessoas&pessoa=${encodeURIComponent(admission.personId)}`} aria-label={"Abrir ficha de " + personName}>Abrir ficha</AppNavLink>
                              <button type="button" disabled={busy || done || !canAct} onClick={() => nextAdmission(admission)}>
                                {done ? "Concluído" : !canAct ? "Ação reservada" : "Concluir " + stepLabel}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                      {filteredAdmissions.length === 0 && !error && <p className={s.empty}>Não há protocolos neste filtro.</p>}
                      <ListPager total={filteredAdmissions.length} page={visiblePage} onChange={setListPage} />
                    </div>
                  )}
                </section>
                <section className={s.panel} id="cadastro">
                  <h2>Cadastro e admissão</h2>
                  {secretary ? (
                    <>
                      <p>Cadastre a pessoa ou abra um protocolo para um cadastro existente.</p>
                      <div className={s.viewFilter} role="group" aria-label="Ações da secretaria">
                        <button type="button" aria-pressed={admissionForm === "existing"} onClick={() => setAdmissionForm("existing")}>Iniciar admissão</button>
                        <button type="button" aria-pressed={admissionForm === "new"} onClick={() => setAdmissionForm("new")}>Novo cadastro</button>
                      </div>
                      {admissionForm && (
                        <form className={s.form} onSubmit={submitSecretariatForm}>
                          {admissionForm === "existing" ? (
                            <PersonPicker token={token} roles={user.grants.map(grant => grant.roleCode)} label="Pessoa para admissão" value={admissionPerson} onChange={setAdmissionPerson} placeholder="Buscar pelo nome" required />
                          ) : (
                            <>
                              <label>Nome<input value={newName} onChange={event => setNewName(event.target.value)} required minLength={3} maxLength={160} placeholder="Maria Oliveira" /></label>
                              <label>E-mail de homologação<input value={newEmail} onChange={event => setNewEmail(event.target.value)} required type="email" placeholder="maria.oliveira@example.test" /></label>
                            </>
                          )}
                          {admissionForm === "existing" ? (
                            <label>Modalidade
                              <select value={modality} onChange={event => setModality(event.target.value)}>
                                <option value="BATISMO">Batismo</option>
                                <option value="TRANSFERENCIA">Transferência</option>
                                <option value="RECONCILIACAO">Reconciliação</option>
                                <option value="OUTRO">Outro</option>
                              </select>
                            </label>
                          ) : <p>O cadastro cria um vínculo pendente. O protocolo pode ser aberto depois.</p>}
                          <button type="submit" disabled={busy || (admissionForm === "existing" && !admissionPerson)}>
                            {busy ? "Salvando…" : admissionForm === "existing" ? "Abrir protocolo" : "Salvar cadastro"}
                          </button>
                        </form>
                      )}
                    </>
                  ) : <p className={s.empty}>A abertura de protocolo fica com a secretaria.</p>}
                </section>
              </div>
            )}
            {view === "cards" && (
              <section className={s.panel}>
                <h2>Carteirinhas digitais</h2>
                <p>A secretaria emite e revoga. Cada pessoa consulta a própria carteirinha.</p>
                {!secretary ? <p className={s.empty}>A lista completa fica com a secretaria.</p> : (
                  <CredentialCards
                    memberships={memberships}
                    busy={busy}
                    CredentialPreview={CredentialPreview}
                    onToggle={membership => { if (membership.activeCredentialId) revokeCard(membership); else issueCard(membership); }}
                  />
                )}
              </section>
            )}
            {fichaId && token && (
              <SecretaryDossier
                token={token}
                personId={fichaId}
                households={households}
                canEdit={secretary}
                canReadDocuments={staff}
                credential={credentialFromMemberships(secretary, memberships, fichaId)}
                onClose={() => {
                  setFichaId(null);
                  const url = new URL(window.location.href);
                  if (url.searchParams.has("pessoa")) {
                    url.searchParams.delete("pessoa");
                    window.history.replaceState(null, "", url);
                  }
                }}
                onPersonSaved={person => setMemberships(rows => rows.map(row =>
                  row.person.id === person.id ? { ...row, person } : row
                ))}
                onSessionExpired={logout}
              />
            )}
            <p className={s.footerNote}>Ambiente de homologação. Não cadastre dados de pessoas reais.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
