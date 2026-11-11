"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import { AppNavLink, AppShell, UIIcon } from "./AppShell";
import { PersonaBoard } from "./PersonaHome";
import { PersonPicker } from "./PersonPicker";
import { PersonPortrait } from "./PersonPortrait";
import { SecretaryDossier, credentialFromMemberships } from "./SecretaryDossier";
import { apiGet, apiLogin, apiPost, clearToken, isInvalidSession, loadStoredToken, loginFailureMessage, storeToken, type LoginResult } from "../lib/api";
import { readPanel } from "../lib/panel-read";
import { Alert } from "./ui/Alert";
import { Modal } from "./ui/Modal";
import { PageHeader } from "./ui/PageHeader";
import ui from "./ui/ui.module.css";
import s from "./hml-phase-one.module.css";
import { withBasePath } from "../lib/paths";

type View = "overview" | "members" | "secretary" | "cards";
type SecretarySection = "resumo" | "pessoas" | "admissoes";
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
  const [notice, setNotice] = useState<{ tone: "success" | "warning"; title: string; detail?: string } | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loadedGroups, setLoadedGroups] = useState({ people: false, admissions: false });
  const [query, setQuery] = useState("");
  const [listPage, setListPage] = useState(0);
  const [membershipStatus, setMembershipStatus] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [secretarySection, setSecretarySection] = useState<SecretarySection>("resumo");
  const [showHistory, setShowHistory] = useState(false);
  const [admissionForm, setAdmissionForm] = useState<"existing" | "new" | null>(null);
  const [formFeedback, setFormFeedback] = useState("");
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
      const section = params.get("aba");
      setSecretarySection(section === "pessoas" || section === "admissoes" ? section : "resumo");
      setAdmissionForm(action === "cadastrar" ? "new" : action === "admissao" ? "existing" : null);
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
    setLoadedGroups(previous => ({
      people: previous.people || (secretaria && view !== "overview" && people.status === "fulfilled"),
      admissions: previous.admissions || (staff && view === "secretary" && processes.status === "fulfilled"),
    }));
    const complete = settled.every(item => item.status === "fulfilled");
    if (!complete) {
      setNotice({
        tone: "warning",
        title: "Algumas informações não carregaram",
        detail: "Use Atualizar para tentar novamente.",
      });
    }
    return complete;
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

  function chooseSecretarySection(next: SecretarySection, status = "") {
    setSecretarySection(next);
    setQuery("");
    setMembershipStatus(status);
    setFamilyFilter("");
    setShowHistory(false);
    setListPage(0);
    setAdmissionForm(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("aba", next);
      url.searchParams.delete("acao");
      if (status) url.searchParams.set("situacao", status);
      else url.searchParams.delete("situacao");
      window.history.replaceState(null, "", url);
    }
  }

  function startSecretaryAction(next: "new" | "existing") {
    setAdmissionForm(next);
    setFormFeedback("");
  }

  function closeSecretaryAction() {
    if (busy) return;
    resetSecretaryAction();
  }

  function resetSecretaryAction() {
    setAdmissionForm(null);
    setFormFeedback("");
    setNewName("");
    setNewEmail("");
    setAdmissionPerson("");
    setModality("BATISMO");
    const url = new URL(window.location.href);
    if (url.searchParams.has("acao")) {
      url.searchParams.delete("acao");
      if (url.hash === "#cadastro") url.hash = "";
      window.history.replaceState(null, "", url);
    }
  }

  function logout() {
    clearToken();
    setToken(null);
    setUser(null);
    setMemberships([]);
    setFamilyFilter("");
    setSecretarySection("resumo");
    setAdmissions([]);
    setHouseholds([]);
    setLoadedGroups({ people: false, admissions: false });
    setFichaId(null);
    setPassword("");
    setError("");
    setNotice(null);
    window.location.assign(withBasePath("/login/"));
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice(null);
    try {
      const signed = await apiLogin(loginEmail.trim(), password);
      await refresh(signed.accessToken);
      storeToken(signed.accessToken);
      setToken(signed.accessToken);
      setPassword("");
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

  async function run(action: () => Promise<unknown>, message: string, reportError = setError): Promise<boolean> {
    if (!token) return false;
    setBusy(true);
    setError("");
    setNotice(null);
    try {
      await action();
      const updated = await refresh(token, true).catch(() => false);
      setNotice({
        tone: updated ? "success" : "warning",
        title: message,
        detail: updated ? undefined : "A lista ainda precisa ser atualizada. Use Atualizar para conferir.",
      });
      return true;
    } catch (err) {
      reportError(displayError(err));
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
    setFormFeedback("");
    if (admissionForm === "existing" && !admissionPerson) {
      setFormFeedback("Selecione a pessoa que vai iniciar a admissão.");
      return;
    }
    if (admissionForm === "new" && (name.length < 3 || !email.endsWith("@example.test"))) {
      setFormFeedback("Use um nome e um e-mail terminado em @example.test.");
      return;
    }
    const completed = admissionForm === "existing"
      ? await run(() => apiPost("/admissions", token, { personId: admissionPerson, modality }), "Protocolo de admissão aberto.", setFormFeedback)
      : await run(async () => {
          const candidates = await apiPost<{ hits: Array<{ person: { email: string | null } }> }>(
            "/persons/candidates", token, { displayName: name, email },
          );
          if (candidates.hits.some(hit => hit.person.email?.toLowerCase() === email)) {
            throw new Error("E-mail já cadastrado.");
          }
          return apiPost("/memberships", token, { displayName: name, email });
        }, "Pessoa cadastrada. Você já pode iniciar a admissão quando precisar.", setFormFeedback);
    if (completed) resetSecretaryAction();
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
            {error && <Alert appearance="workspace" tone="danger" title="Não foi possível entrar">{error}</Alert>}
            <form onSubmit={login} className={s.form}>
              <label>E-mail<input type="email" required autoComplete="username" value={loginEmail} onChange={event => setLoginEmail(event.target.value)} placeholder="nome@example.test" /></label>
              <label>Senha<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
              <button type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
            </form>
          </section>
        ) : (
          <div className={s.workspace}>
            {view !== "overview" && (
              <PageHeader
                appearance="workspace"
                heading="h1"
                title={names[view]}
                description={view === "secretary" ? "Pessoas, famílias e admissões" : view === "cards" ? "Emissão e situação das carteirinhas" : undefined}
                actions={<>
                  {view === "members" && secretary && <AppNavLink className={ui.workspacePrimary} href="/app/secretaria/?aba=admissoes&acao=cadastrar#cadastro">Cadastrar pessoa</AppNavLink>}
                  {view === "secretary" && secretary && <button type="button" className={ui.workspacePrimary} onClick={() => startSecretaryAction(secretarySection === "admissoes" ? "existing" : "new")}>
                    <UIIcon name="plus" size={17} /> {secretarySection === "admissoes" ? "Iniciar admissão" : "Cadastrar pessoa"}
                  </button>}
                  <button type="button" className={ui.workspaceSecondary} onClick={() => {
                    setError("");
                    setNotice(null);
                    setChecking(true);
                    void refresh(token, true).catch(err => setError(displayError(err))).finally(() => setChecking(false));
                  }} disabled={checking || busy}>
                    <UIIcon name="refresh" size={17} /> {checking ? "Atualizando…" : "Atualizar"}
                  </button>
                </>}
              />
            )}
            {notice && (
              <Alert appearance="workspace" tone={notice.tone} title={notice.title} onDismiss={() => setNotice(null)}>
                {notice.detail}
              </Alert>
            )}
            {error && <Alert appearance="workspace" tone="danger" title={error} />}
            {view === "secretary" && staff && (
              <nav className={ui.workspaceTabs} aria-label="Áreas da secretaria">
                {secretary && <button type="button" aria-current={secretarySection === "resumo" ? "page" : undefined} onClick={() => chooseSecretarySection("resumo")}>Visão geral</button>}
                {secretary && <button type="button" aria-current={secretarySection === "pessoas" ? "page" : undefined} onClick={() => chooseSecretarySection("pessoas")}>Pessoas</button>}
                <button type="button" aria-current={!secretary || secretarySection === "admissoes" ? "page" : undefined} onClick={() => chooseSecretarySection("admissoes")}>Admissões</button>
                {secretary && <AppNavLink href="/app/membros/carteirinha/">Carteirinhas</AppNavLink>}
              </nav>
            )}
            {view === "overview" && <PersonaBoard />}
            {view === "secretary" && secretary && secretarySection === "resumo" && (
              <div className={s.summary}>
                <div className={s.summaryCards} aria-label="Indicadores da Secretaria">
                  {[["ACTIVE", "Pessoas ativas"], ["INACTIVE", "Pessoas inativas"], ["PENDING_ADMISSION", "Em admissão"]].map(([status, title]) => (
                    <button key={status} type="button" onClick={() => chooseSecretarySection("pessoas", status)}>
                      <span>{title}</span><strong>{loadedGroups.people ? memberships.filter(row => row.status === status).length.toLocaleString("pt-BR") : "—"}</strong>
                    </button>
                  ))}
                  <AppNavLink href="/app/membros/carteirinha/">
                    <span>Carteirinhas ativas</span><strong>{loadedGroups.people ? memberships.filter(row => Boolean(row.activeCredentialId)).length.toLocaleString("pt-BR") : "—"}</strong>
                  </AppNavLink>
                </div>
                <section className={s.panel} aria-labelledby="secretary-pending-title">
                  <div className={s.summaryHeading}>
                    <h2 id="secretary-pending-title">Admissões em andamento</h2>
                    <button className={ui.workspaceSecondary} type="button" onClick={() => chooseSecretarySection("admissoes")}>Ver admissões <UIIcon name="arrow" size={15} /></button>
                  </div>
                  {loadedGroups.admissions ? (
                    <dl className={s.summarySteps}>
                      {[["modality", "Em preparação"], ["documents", "Documentação"], ["secretaria", "Análise da Secretaria"], ["pastor", "Aprovação pastoral"]].map(([step, title]) => (
                        <div key={step}><dt>{title}</dt><dd>{admissions.filter(row => row.currentStep === step && !CLOSED_ADMISSIONS.includes(row.status)).length.toLocaleString("pt-BR")}</dd></div>
                      ))}
                    </dl>
                  ) : <p role="status">{checking ? "Consultando admissões…" : "Admissões indisponíveis. Use Atualizar para tentar novamente."}</p>}
                </section>
              </div>
            )}
            {showsPeople && (
              <div className={s.peopleWorkspace}>
                <section className={s.panel} aria-busy={checking}>
                  <div className={s.panelHeading}>
                    <div className={s.panelHeadingCopy}><h2>Cadastro de pessoas</h2><span role="status">{loadedGroups.people ? `${filtered.length.toLocaleString("pt-BR")} ${filtered.length === 1 ? "pessoa encontrada" : "pessoas encontradas"}` : "Cadastros da congregação"}{selectedFamily ? ` · ${selectedFamily.label}` : ""}</span></div>
                    <input type="search" value={query} onChange={event => updateQuery(event.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar pessoas por nome ou e-mail" />
                  </div>

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
                  {!secretary ? <p className={s.empty}>Use a busca acima para consultar uma ficha.</p> : !loadedGroups.people ? (
                    <p className={s.empty} role="status">{checking ? "Carregando cadastros…" : "Não foi possível carregar os cadastros. Use Atualizar para tentar novamente."}</p>
                  ) : (
                    <div className={s.tableWrap}>
                      <table>
                        <thead>
                          <tr><th>Pessoa</th><th>Família</th><th>Situação</th><th>Contato</th><th></th></tr>
                        </thead>
                        <tbody>
                          {filtered.slice(firstRow, firstRow + PAGE_SIZE).map(membership => (
                            <tr key={membership.person.id}>
                              <td data-label="Pessoa"><div className={s.personIdentity}><PersonPortrait name={membership.person.displayName} size="small" /><strong>{membership.person.displayName}</strong></div></td>
                              <td data-label="Família">{membership.person.householdId ? householdById.get(membership.person.householdId) ?? "Vínculo não encontrado" : "Sem vínculo familiar"}</td>
                              <td data-label="Situação"><span className={s.statusPill} data-status={membership.status}>{label(membership.status)}</span></td>
                              <td data-label="Contato">{membership.person.email ?? "Não informado"}</td>
                              <td data-label="Ficha">
                                <button type="button" className={s.openFicha} onClick={() => setFichaId(membership.person.id)} aria-label={"Abrir ficha de " + membership.person.displayName}>Ver ficha <UIIcon name="arrow" size={14}/></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filtered.length === 0 && !error && <p className={s.empty}>Nenhuma pessoa encontrada.</p>}
                      <ListPager total={filtered.length} page={visiblePage} onChange={setListPage} />
                    </div>
                  )}
                  {staff && (
                    <details className={s.personLookup}>
                      <summary>Não encontrou na lista? Buscar em todos os cadastros</summary>
                      <div className={s.personLookupContent}>
                        <PersonPicker token={token} roles={user.grants.map(grant => grant.roleCode)} label="Procurar ficha por nome" value={searchedPerson} onChange={setSearchedPerson} placeholder="Digite o nome da pessoa" />
                        <button type="button" className={s.openFicha} disabled={!searchedPerson} onClick={() => { setFichaId(searchedPerson); setSearchedPerson(""); }}>Abrir ficha selecionada</button>
                      </div>
                    </details>
                  )}
                </section>
              </div>
            )}
            {showsAdmissions && (
              <div>
                <section className={s.panel} aria-busy={checking}>
                  <div className={s.panelHeading}>
                    <div className={s.panelHeadingCopy}><h2>Protocolos de admissão</h2><span role="status">{loadedGroups.admissions ? `${filteredAdmissions.length.toLocaleString("pt-BR")} ${filteredAdmissions.length === 1 ? "protocolo encontrado" : "protocolos encontrados"}` : "Processos da secretaria"}</span></div>
                    <input type="search" value={query} onChange={event => updateQuery(event.target.value)} placeholder="Buscar processo" aria-label="Buscar admissão" />
                  </div>
                  <div className={s.viewFilter} role="group" aria-label="Filtrar protocolos">
                    <button type="button" aria-pressed={!showHistory} onClick={() => { setShowHistory(false); setListPage(0); }}>Em andamento</button>
                    <button type="button" aria-pressed={showHistory} onClick={() => { setShowHistory(true); setListPage(0); }}>Todos</button>
                  </div>
                  {!staff ? <p className={s.empty}>Seu perfil não consulta os processos.</p> : !loadedGroups.admissions ? (
                    <p className={s.empty} role="status">{checking ? "Carregando admissões…" : "Não foi possível carregar as admissões. Use Atualizar para tentar novamente."}</p>
                  ) : (
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
              </div>
            )}
            {secretary && view === "secretary" && admissionForm && (
              <Modal
                open
                appearance="workspace"
                title={admissionForm === "existing" ? "Iniciar admissão" : "Cadastrar pessoa"}
                description={admissionForm === "existing"
                  ? "Escolha uma pessoa cadastrada e a modalidade de admissão."
                  : "Preencha os dados iniciais da pessoa. A admissão pode ser aberta depois."}
                onClose={closeSecretaryAction}
              >
                <form className={s.form} onSubmit={submitSecretariatForm} aria-busy={busy}>
                  {formFeedback && <Alert appearance="workspace" tone="danger" title="Confira o formulário">{formFeedback}</Alert>}
                  {admissionForm === "existing" ? (
                    <>
                      <PersonPicker token={token} roles={user.grants.map(grant => grant.roleCode)} label="Pessoa para admissão" value={admissionPerson} onChange={setAdmissionPerson} placeholder="Buscar pelo nome" required disabled={busy} />
                      <label>Modalidade
                        <select value={modality} onChange={event => setModality(event.target.value)} disabled={busy}>
                          <option value="BATISMO">Batismo</option>
                          <option value="TRANSFERENCIA">Transferência</option>
                          <option value="RECONCILIACAO">Reconciliação</option>
                          <option value="OUTRO">Outro</option>
                        </select>
                      </label>
                    </>
                  ) : (
                    <>
                      <label>Nome<input value={newName} onChange={event => setNewName(event.target.value)} required minLength={3} maxLength={160} autoComplete="off" disabled={busy} /></label>
                      <label>E-mail de homologação<input value={newEmail} onChange={event => setNewEmail(event.target.value)} required type="email" placeholder="nome@example.test" disabled={busy} /></label>
                    </>
                  )}
                  <div className={s.formActions}>
                    <button type="button" className={ui.workspaceSecondary} onClick={closeSecretaryAction} disabled={busy}>Cancelar</button>
                    <button type="submit" disabled={busy || (admissionForm === "existing" && !admissionPerson)}>
                      {busy ? "Salvando…" : admissionForm === "existing" ? "Abrir protocolo" : "Salvar cadastro"}
                    </button>
                  </div>
                </form>
              </Modal>
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
                onHouseholdCreated={secretary ? household => setHouseholds(rows => [household, ...rows]) : undefined}
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
