"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import { AppShell, UIIcon } from "./AppShell";
import { PersonaBoard } from "./PersonaHome";
import { PersonPicker } from "./PersonPicker";
import { SecretaryDossier, credentialFromMemberships } from "./SecretaryDossier";
import { apiGet, apiLogin, apiPost, clearToken, isInvalidSession, loadStoredToken, storeToken, type LoginResult } from "../lib/api";
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
  if (/\(409\)|409/.test(error.message)) return "Existe um conflito de cadastro ou de etapa. Atualize a lista antes de continuar.";
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

const rowKey = (membership: Membership) => membership.person.id;

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
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [searchedPerson, setSearchedPerson] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [modality, setModality] = useState("BATISMO");

  const refresh = useCallback(async (activeToken: string) => {
    const me = await apiGet<AuthUser>("/auth/me", activeToken);
    setUser(me);
    const secretaria = hasRole(me, "SECRETARIA") || hasRole(me, "PLATFORM_ADMIN");
    const staff = secretaria || hasRole(me, "PASTOR");
    const settled = await Promise.allSettled([
      secretaria ? apiGet<{ memberships: Membership[] }>("/memberships", activeToken) : Promise.resolve({ memberships: [] as Membership[] }),
      staff ? apiGet<{ admissions: Admission[] }>("/admissions", activeToken) : Promise.resolve({ admissions: [] as Admission[] }),
      secretaria ? apiGet<{ households: Household[] }>("/households", activeToken) : Promise.resolve({ households: [] as Household[] }),
    ]);
    const invalid = settled.find(item => item.status === "rejected" && isInvalidSession(item.reason));
    if (invalid && invalid.status === "rejected") throw invalid.reason;
    const [people, processes, families] = settled;
    if (people.status === "fulfilled") setMemberships(people.value.memberships);
    if (processes.status === "fulfilled") setAdmissions(processes.value.admissions);
    if (families.status === "fulfilled") setHouseholds(families.value.households);
    if (settled.some(item => item.status === "rejected")) {
      setError("Parte da lista não carregou. Você continua conectado.");
    }
  }, []);

  useEffect(() => {
    const stored = loadStoredToken();
    if (!stored) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    void refresh(stored).then(() => {
      if (!cancelled) setToken(stored);
    }).catch(err => {
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
  const pending = admissions.filter(admission => !["APPROVED", "REJECTED", "CANCELLED"].includes(admission.status));
  const active = memberships.filter(membership => membership.status === "ACTIVE");
  const credentials = memberships.filter(membership => Boolean(membership.activeCredentialId));
  const q = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = memberships.filter(membership => [membership.person.displayName, membership.person.email ?? "", membership.status, membership.id].join(" ").toLocaleLowerCase("pt-BR").includes(q));
  const filteredAdmissions = admissions.filter(admission => {
    const member = membershipByPerson.get(admission.personId);
    return [member?.person.displayName ?? "", admission.modality ?? "", admission.status].join(" ").toLocaleLowerCase("pt-BR").includes(q);
  });

  function logout() {
    clearToken();
    setToken(null);
    setUser(null);
    setMemberships([]);
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
      setError(displayError(err));
      if (isInvalidSession(err)) {
        clearToken();
        setToken(null);
      }
    } finally {
      setBusy(false);
      setChecking(false);
    }
  }

  async function run(action: () => Promise<unknown>, message: string) {
    if (!token) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh(token);
      setNotice(message);
    } catch (err) {
      setError(displayError(err));
    } finally {
      setBusy(false);
    }
  }

  function createAdmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !secretary) return;
    const name = newName.trim();
    const email = newEmail.trim().toLowerCase();
    if (name.length < 3 || !email.endsWith("@example.test")) {
      setError("Use um nome e um e-mail terminado em @example.test. Este ambiente não recebe cadastro real.");
      return;
    }
    void run(
      () => apiPost("/admissions", token, { displayName: name, email, modality }),
      "Protocolo aberto.",
    );
    setNewName("");
    setNewEmail("");
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
    members: "Pessoas e famílias",
    secretary: "Admissões e secretaria",
    cards: "Carteirinhas",
  };
  const activeNav = view === "overview" ? "visao" : view === "members" ? "membros" : view === "secretary" ? "secretaria" : "carteirinha";

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
        <div className={s.topline}>
          <span className={s.environment}>Ambiente de homologação</span>
        </div>
        {checking ? <section className={s.loginPanel} role="status"><h1>Verificando sessão…</h1></section> : !token || !user ? (
          <section className={s.loginPanel} aria-labelledby="login-hml">
            <span className={s.kicker}>Ambiente de homologação</span>
            <h1 id="login-hml">Entre no ID Riacho 1</h1>
            <p>Use a conta autorizada deste ambiente. O site público continua separado.</p>
            <form onSubmit={login} className={s.form}>
              <label>E-mail<input type="email" required autoComplete="username" value={loginEmail} onChange={event => setLoginEmail(event.target.value)} placeholder="nome@example.test" /></label>
              <label>Senha<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
              <button type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar na homologação"}</button>
            </form>
          </section>
        ) : (
          <div>
            {view !== "overview" && (
              <header className={s.heading}>
                <div>
                  <span className={s.kicker}>ID Riacho 1</span>
                  <h1>{names[view]}</h1>
                  <p>
                    {view === "members" && "Pessoas e núcleos familiares no seu alcance."}
                    {view === "secretary" && "Protocolos de admissão e fichas da secretaria."}
                    {view === "cards" && "Emissão e situação das carteirinhas."}
                  </p>
                </div>
                <button type="button" className={s.secondaryButton} onClick={() => { if (token) void run(() => refresh(token), "Dados atualizados."); }} disabled={busy}>
                  <UIIcon name="refresh" size={17} /> Atualizar
                </button>
              </header>
            )}
            {notice && <div role="status" className={s.notice}>{notice}</div>}
            {error && <div role="alert" className={s.error}>{error}</div>}
            {view !== "overview" && (
              <div className={s.stats}>
                {secretary && <div><span>Pessoas com vínculo</span><strong>{memberships.length}</strong><small>Nesta congregação</small></div>}
                {secretary && <div><span>Membros ativos</span><strong>{active.length}</strong><small>Vínculo ativo</small></div>}
                {staff && <div><span>Admissões pendentes</span><strong>{pending.length}</strong><small>Etapas em aberto</small></div>}
                {secretary && <div><span>Credenciais ativas</span><strong>{credentials.length}</strong><small>Carteirinhas emitidas</small></div>}
              </div>
            )}
            {view === "overview" && <PersonaBoard />}
            {view === "members" && (
              <div className={s.grid}>
                <section className={s.panel}>
                  <div className={s.panelHeading}>
                    <h2>Diretório de membros</h2>
                    <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nome ou situação" aria-label="Buscar membros" />
                  </div>
                  {!secretary ? <p className={s.empty}>Seu perfil não lista todas as pessoas.</p> : (
                    <div className={s.tableWrap}>
                      <table>
                        <thead>
                          <tr><th>Nome</th><th>Situação</th><th>E-mail</th><th>Carteirinha</th><th>Ficha</th></tr>
                        </thead>
                        <tbody>
                          {filtered.map(membership => (
                            <tr key={rowKey(membership)}>
                              <td data-label="Nome"><strong>{membership.person.displayName}</strong></td>
                              <td data-label="Situação">{label(membership.status)}</td>
                              <td data-label="E-mail">{membership.person.email ?? "—"}</td>
                              <td data-label="Carteirinha">{membership.activeCredentialId ? "Ativa" : "Não emitida"}</td>
                              <td data-label="Ficha">
                                <button type="button" className={s.openFicha} onClick={() => setFichaId(membership.person.id)} aria-label={"Abrir ficha de " + membership.person.displayName}>Abrir ficha</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filtered.length === 0 && <p className={s.empty}>Nenhuma pessoa encontrada.</p>}
                    </div>
                  )}
                </section>
                <section className={s.panel}>
                  <h2>Núcleos familiares</h2>
                  {secretary ? <strong className={s.bigNumber}>{households.length}</strong> : null}
                  <p>{secretary ? "Famílias vinculadas à congregação." : "A lista de famílias fica com a secretaria."}</p>
                  <div className={s.slimList}>{households.slice(0, 8).map(household => <span key={household.id}>{household.label}</span>)}</div>
                  {secretary && households.length === 0 && <p className={s.empty}>Nenhuma família registrada.</p>}
                </section>
              </div>
            )}
            {view === "secretary" && (
              <div className={s.grid}>
                <section className={s.panel}>
                  <div className={s.panelHeading}>
                    <h2>Protocolos de admissão</h2>
                    <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar processo" aria-label="Buscar admissão" />
                  </div>
                  {!staff ? <p className={s.empty}>Seu perfil não consulta os processos.</p> : (
                    <div className={s.admissions}>
                      {filteredAdmissions.map(admission => {
                        const canAct = admission.currentStep === "pastor" ? pastor : secretary;
                        const done = ["APPROVED", "REJECTED", "CANCELLED"].includes(admission.status);
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
                              <small>{label(admission.status)} · {label(admission.modality ?? "")}</small>
                            </div>
                            <div className={s.admissionActions}>
                              <button type="button" className={s.openFicha} onClick={() => setFichaId(admission.personId)} aria-label={"Abrir ficha de " + personName}>Abrir ficha</button>
                              <button type="button" disabled={busy || done || !canAct} onClick={() => nextAdmission(admission)}>
                                {done ? "Concluído" : !canAct ? "Ação reservada" : "Concluir " + stepLabel}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                      {filteredAdmissions.length === 0 && <p className={s.empty}>Não há protocolos neste filtro.</p>}
                    </div>
                  )}
                </section>
                <section className={s.panel}>
                  <h2>Buscar pessoa e abrir ficha</h2>
                  {staff && token ? (
                    <>
                      <PersonPicker token={token} roles={user.grants.map(grant => grant.roleCode)} label="Pessoa" value={searchedPerson} onChange={setSearchedPerson} placeholder="Buscar pelo nome" />
                      <button type="button" className={s.openFicha} disabled={!searchedPerson} onClick={() => setFichaId(searchedPerson)}>Abrir ficha da busca</button>
                    </>
                  ) : <p className={s.empty}>A busca de pessoas fica com a secretaria, o pastor ou a administração.</p>}
                  <h2 className={s.follow}>Abrir protocolo</h2>
                  <p>O cadastro cria a pessoa, o vínculo e a admissão juntos. Use apenas nomes deste ambiente e o domínio example.test.</p>
                  {secretary ? (
                    <form className={s.form} onSubmit={createAdmission}>
                      <label>Nome<input value={newName} onChange={event => setNewName(event.target.value)} required minLength={3} placeholder="Maria Oliveira" /></label>
                      <label>E-mail<input value={newEmail} onChange={event => setNewEmail(event.target.value)} required type="email" placeholder="maria.oliveira@example.test" /></label>
                      <label>Modalidade
                        <select value={modality} onChange={event => setModality(event.target.value)}>
                          <option value="BATISMO">Batismo</option>
                          <option value="TRANSFERENCIA">Transferência</option>
                          <option value="RECONCILIACAO">Reconciliação</option>
                          <option value="OUTRO">Outro</option>
                        </select>
                      </label>
                      <button type="submit" disabled={busy}>{busy ? "Salvando…" : "Cadastrar e iniciar admissão"}</button>
                    </form>
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
                onClose={() => setFichaId(null)}
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
