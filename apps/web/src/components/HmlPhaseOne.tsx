"use client";

import { ECCLESIASTICAL_ROLES, sortByName, type EcclesiasticalRole } from "@idbrf/shared";

import { isAdminEnabled, isProductionAdmin } from "../lib/admin-environment";
import { WorkspaceSearch } from "./ui/WorkspaceSearch";
import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import { AppNavLink, AppShell, UIIcon } from "./AppShell";
import { PersonaBoard } from "./PersonaHome";
import { PersonPicker } from "./PersonPicker";
import { PersonPortrait } from "./PersonPortrait";
import { SecretaryDossier, credentialFromMemberships } from "./SecretaryDossier";
import { PersonPhotoInput } from "./secretaria/PersonPhotoInput";
import { savePersonPhoto } from "../lib/my-account";
import { ECCLESIASTICAL_ROLE_LABELS, ECCLESIASTICAL_ROLE_TOTAL_LABELS } from "./secretaria/EcclesiasticalRoleFields";
import { NewPersonIntake, type NewPersonProfile } from "./secretaria/NewPersonIntake";
import { personUnder18 } from "./secretaria/new-person-intake-model";
import { AdmissionDocuments } from "./secretaria/AdmissionDocuments";
import { AdmissionRequirements } from "./secretaria/AdmissionRequirements";
import { SecretaryDashboard } from "./secretaria/SecretaryDashboard";
import { apiGet, apiPost, clearToken, isInvalidSession, loadStoredToken, type LoginResult } from "../lib/api";
import { LoginScreen } from "./LoginScreen";
import { clearPanelReads, readPanel } from "../lib/panel-read";
import { Alert } from "./ui/Alert";
import { Modal } from "./ui/Modal";
import { useFeedback } from "./ui/FeedbackProvider";
import { PageHeader } from "./ui/PageHeader";
import ui from "./ui/ui.module.css";
import s from "./hml-phase-one.module.css";
import { withBasePath } from "../lib/paths";

type View = "overview" | "members" | "secretary" | "cards" | "pastoral";
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
  ecclesiasticalRoles?: EcclesiasticalRole[];
  ministryLeader?: boolean;
};
function memberHasFunction(membership: Membership, role: EcclesiasticalRole) {
  return Boolean(membership.ecclesiasticalRoles?.includes(role) || (role === "MINISTRY_LEADER" && membership.ministryLeader));
}

type Admission = {
  id: string;
  personId: string;
  personName?: string | null;
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
  initialSecretarySection?: SecretarySection;
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
  ACLAMACAO: "Aclamação",
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
  if (/ADMISSION_DOCUMENTS_REQUIRED/.test(error.message)) return "Anexe os documentos marcados como obrigatórios antes de avançar.";
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
  const active = sortByName(memberships.filter(membership => membership.status === "ACTIVE"), row => row.person.displayName);
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

export function HmlPhaseOne({ view, CredentialPreview, initialSecretarySection = "resumo" }: HmlPhaseOneProps) {
  const pastoralView = view === "pastoral";
  const { showFeedback } = useFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "warning"; title: string; detail?: string } | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [familiesLoaded, setFamiliesLoaded] = useState(false);
  const [loadedGroups, setLoadedGroups] = useState({ people: false, admissions: false });
  const [query, setQuery] = useState("");
  const [listPage, setListPage] = useState(0);
  const [membershipStatus, setMembershipStatus] = useState("");
  const [churchFunction, setChurchFunction] = useState<EcclesiasticalRole | null>(null);
  const [familyFilter, setFamilyFilter] = useState("");
  const [secretarySection, setSecretarySection] = useState<SecretarySection>(initialSecretarySection);
  const [showHistory, setShowHistory] = useState(false);
  const [admissionStage, setAdmissionStage] = useState("");
  const [admissionProtocol, setAdmissionProtocol] = useState("");
  const [configureDocuments, setConfigureDocuments] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [pastoralDecision, setPastoralDecision] = useState<"APPROVE" | "REJECT" | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [admissionForm, setAdmissionForm] = useState<"existing" | "new" | null>(null);
  const [admissionPerson, setAdmissionPerson] = useState("");
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [intakePhoto, setIntakePhoto] = useState<File | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [summaryRevision, setSummaryRevision] = useState(0);
  const [searchedPerson, setSearchedPerson] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const emptyNewProfile = (): NewPersonProfile => ({
    address: "", birthDate: "", baptismDate: "", firstAttendedOn: "",
    weddingDate: "", sex: "", isMinor: false,
    legalGuardianPersonId: "", householdId: "", householdLabel: "",
  });
  const [newProfile, setNewProfile] = useState(emptyNewProfile);
  const [modality, setModality] = useState("BATISMO");

  useEffect(() => {
    if (view !== "secretary") return;
    const readSection = () => {
      const params = new URLSearchParams(window.location.search);
      const action = params.get("acao");
      const section = params.get("aba");
      setSecretarySection(section === "pessoas" || section === "admissoes" ? section : initialSecretarySection);
      setAdmissionForm(action === "cadastrar" ? "new" : action === "admissao" ? "existing" : null);
      setAdmissionPerson(action === "admissao" ? params.get("cadastro") ?? "" : "");
      setFichaId(params.get("pessoa"));
      setAdmissionStage(params.get("etapa") ?? "");
      setAdmissionProtocol(params.get("protocolo") ?? "");
      const role = params.get("funcao");
      setChurchFunction(ECCLESIASTICAL_ROLES.find(option => option === role) ?? null);
      const status = params.get("situacao") ?? "";
      setMembershipStatus(["ACTIVE", "INACTIVE", "PENDING_ADMISSION", "TRANSFERRED"].includes(status) ? status : "");
    };
    readSection();
    window.addEventListener("popstate", readSection);
    return () => window.removeEventListener("popstate", readSection);
  }, [view, initialSecretarySection]);

  useEffect(() => {
    if (!pastoralView) return;
    const readSelection = () => {
      const params = new URLSearchParams(window.location.search);
      const protocol = params.get("protocolo") ?? "";
      setAdmissionProtocol(protocol);
      setShowHistory(Boolean(protocol));
      setFichaId(params.get("pessoa"));
    };
    readSelection();
    window.addEventListener("popstate", readSelection);
    return () => window.removeEventListener("popstate", readSelection);
  }, [pastoralView]);

  useEffect(() => {
    if (view !== "members") return;
    const openFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setFichaId(params.get("pessoa"));
      const status = params.get("situacao") ?? "";
      setMembershipStatus(["ACTIVE", "INACTIVE", "PENDING_ADMISSION", "TRANSFERRED"].includes(status) ? status : "");
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
    const readAdmissions = pastoralView ? hasRole(me, "PASTOR") || hasRole(me, "PLATFORM_ADMIN") : staff && view === "secretary";
    const readMemberships = secretaria && view !== "overview" && !pastoralView;
    const settled = await Promise.allSettled([
      readMemberships
        ? readPanel(activeToken, "/memberships", () => apiGet<{ memberships: Membership[] }>("/memberships", activeToken), { fresh })
        : Promise.resolve({ memberships: [] as Membership[] }),
      readAdmissions
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
    if (families.status === "fulfilled") { setHouseholds(families.value.households); setFamiliesLoaded(true); }
    setLoadedGroups(previous => ({
      people: previous.people || (readMemberships && people.status === "fulfilled"),
      admissions: previous.admissions || (readAdmissions && processes.status === "fulfilled"),
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
  }, [view, pastoralView]);

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
  const churchFunctionCounts = useMemo(() => {
    const activeMembers = memberships.filter(row => row.status === "ACTIVE" && row.person.status === "ACTIVE");
    return ECCLESIASTICAL_ROLES.map(role => ({
      role,
      total: loadedGroups.people ? activeMembers.filter(member => memberHasFunction(member, role)).length : null,
    }));
  }, [memberships, loadedGroups.people]);
  const filtered = sortByName(memberships.filter(membership =>
    (!churchFunction || (membership.status === "ACTIVE" && membership.person.status === "ACTIVE" && memberHasFunction(membership, churchFunction))) &&
    (!familyFilter || membership.person.householdId === familyFilter) &&
    (!membershipStatus || membership.status === membershipStatus) &&
    [membership.person.displayName, membership.person.email ?? "", label(membership.status)].join(" ").toLocaleLowerCase("pt-BR").includes(q)
  ), membership => membership.person.displayName);
  const selectedFamily = households.find(household => household.id === familyFilter);

  const admissionName = (admission: Admission) => membershipByPerson.get(admission.personId)?.person.displayName ?? admission.personName;
  const filteredAdmissions = sortByName((showHistory ? admissions : pending).filter(admission => {
    if (pastoralView && admission.currentStep !== "pastor") return false;
    if (admissionStage && admission.currentStep !== admissionStage) return false;
    if (admissionProtocol && admission.id !== admissionProtocol) return false;
    return [admissionName(admission) ?? "", admission.modality ?? "", admission.status].join(" ").toLocaleLowerCase("pt-BR").includes(q);
  }), admissionName);

  const showsPeople = view === "members" || (view === "secretary" && secretary && secretarySection === "pessoas");
  const showsAdmissions = pastoralView || (view === "secretary" && (!secretary || secretarySection === "admissoes"));
  const resultCount = showsAdmissions ? filteredAdmissions.length : filtered.length;
  const visiblePage = Math.min(listPage, Math.max(0, Math.ceil(resultCount / PAGE_SIZE) - 1));
  const firstRow = visiblePage * PAGE_SIZE;

  function updateQuery(value: string) {
    setQuery(value);
    setListPage(0);
  }

  function startSecretaryAction(next: "new" | "existing") {
    setAdmissionForm(next);
  }

  function closeSecretaryAction() {
    if (busy) return;
    resetSecretaryAction();
  }

  function resetSecretaryAction() {
    setAdmissionForm(null);
    setNewName("");
    setNewEmail("");
    setIntakePhoto(null);
    setNewProfile(emptyNewProfile());
    setAdmissionPerson("");
    setModality("BATISMO");
    const url = new URL(window.location.href);
    if (url.searchParams.has("acao")) {
      url.searchParams.delete("acao");
      url.searchParams.delete("cadastro");
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
    setFamiliesLoaded(false);
    setLoadedGroups({ people: false, admissions: false });
    setFichaId(null);
    setError("");
    setNotice(null);
    window.location.assign(withBasePath("/login/"));
  }

  /** Retorna à página protegida somente após /auth/me confirmar a nova sessão. */
  async function finishMfaLogin(): Promise<void> {
    const accessToken = loadStoredToken();
    if (!accessToken) {
      setError("Sessão não encontrada. Entre novamente.");
      return;
    }
    setChecking(true);
    setError("");
    try {
      await apiGet<AuthUser>("/auth/me", accessToken, { fresh: true });
      await refresh(accessToken, true);
      setToken(accessToken);
    } catch (problem) {
      if (isInvalidSession(problem)) clearToken();
      setToken(null);
      setUser(null);
      setError(displayError(problem));
    } finally {
      setChecking(false);
    }
  }

  function showFormIssue(message: string, focusId?: string) {
    showFeedback({
      tone: "error",
      title: "Confira o formulário",
      message,
      ...(focusId ? { focusId, actionLabel: "Corrigir campo" } : {}),
    });
  }

  async function run(
    action: () => Promise<unknown>,
    message: string,
    reportError: (detail: string) => void = (detail) => showFeedback({
      tone: "error", title: "Não foi possível concluir", message: detail,
    }),
  ): Promise<boolean> {
    if (!token) return false;
    setBusy(true);
    setError("");
    setNotice(null);
    try {
      await action();
      const updated = await refresh(token, true).catch(() => false);
      showFeedback({
        tone: updated ? "success" : "warning",
        title: message,
        message: updated
          ? "A operação foi salva. Você pode continuar."
          : "A operação foi salva, mas não conseguimos atualizar a lista. Use Atualizar para conferir.",
        actionLabel: "Continuar",
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
    const computedMinor = newProfile.birthDate ? personUnder18(newProfile.birthDate) : newProfile.isMinor;
    if (admissionForm === "existing" && !admissionPerson) {
      showFormIssue("Selecione uma pessoa cadastrada para iniciar a admissão.");
      return;
    }
    if (admissionForm === "new" && name.length < 3) {
      showFormIssue("Informe o nome completo com pelo menos 3 caracteres.", "intake-person-name");
      return;
    }
    if (admissionForm === "new" && !/^[^\s@]+@example\.test$/i.test(email)) {
      showFormIssue(
        "Este é um ambiente de testes. Informe um e-mail fictício terminado em @example.test (por exemplo: pessoa@example.test). E-mails reais não são permitidos nesta base.",
        "intake-person-email",
      );
      return;
    }
    if (admissionForm === "new" && computedMinor && !newProfile.legalGuardianPersonId) {
      showFormIssue("Para cadastrar uma pessoa menor de idade, selecione um responsável legal adulto.");
      return;
    }
    if (admissionForm === "new" && newProfile.householdId && newProfile.householdLabel.trim()) {
      showFormIssue("Escolha uma família existente ou informe uma nova, não as duas opções ao mesmo tempo.");
      return;
    }
    let createdPersonId: string | null = null;
    let photoPending = false;
    const completed = admissionForm === "existing"
      ? await run(() => apiPost("/admissions", token, { personId: admissionPerson, modality }), "Protocolo de admissão aberto.", showFormIssue)
      : await run(async () => {
          const candidates = await apiPost<{ hits: Array<{ person: { email: string | null } }> }>(
            "/persons/candidates", token, { displayName: name, email },
          );
          if (candidates.hits.some(hit => hit.person.email?.toLowerCase() === email)) {
            throw new Error("E-mail já cadastrado.");
          }
          const created = await apiPost<{person:{id:string}}>("/memberships", token, {
            displayName: name, email,
            address: newProfile.address.trim() || undefined,
            birthDate: newProfile.birthDate || undefined,
            baptismDate: newProfile.baptismDate || undefined,
            weddingDate: newProfile.weddingDate || undefined,
            firstAttendedOn: newProfile.firstAttendedOn || undefined,
            sex: newProfile.sex || undefined,
            ecclesiasticalRoles: newProfile.ecclesiasticalRoles,
            isMinor: computedMinor,
            legalGuardianPersonId: newProfile.legalGuardianPersonId || undefined,
            householdId: newProfile.householdId || undefined,
            householdLabel: newProfile.householdLabel.trim() || undefined,
          });
          createdPersonId = created?.person?.id ?? null;
          if (intakePhoto && createdPersonId) {
            try {
              await savePersonPhoto(token, createdPersonId, intakePhoto);
            } catch {
              photoPending = true;
            }
          }
          return created;
        }, "Pessoa cadastrada. Abra a Ficha 360 para completar sua história.", showFormIssue);
    if (completed) {
      resetSecretaryAction();
      if (createdPersonId) {
        setPendingPhoto(photoPending ? intakePhoto : null);
        setFichaId(createdPersonId);
      }
    }
  }

  async function nextAdmission(admission: Admission, selectedModality?: string) {
    if (!token || busy) return;
    setReviewError("");
    const stage = admission.currentStep;
    if (stage === "pastor" && !pastor) return;
    if (stage !== "pastor" && !secretary) return;
    return run(
      () => apiPost("/admissions/" + encodeURIComponent(admission.id) + "/advance", token, {
        completeStep: stage,
        decision: stage === "pastor" || stage === "secretaria" ? "APPROVE" : undefined,
        modality: stage === "modality" ? selectedModality : undefined,
      }),
      stage === "pastor" ? "Aprovação pastoral registrada." : "Etapa registrada.",
      setReviewError,
    );
  }

  async function submitPastoralDecision(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    if (!token || !pastor || busy || !pastoralDecision) return;
    setReviewError("");
    const decision = pastoralDecision;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    const saved = await run(() => apiPost(`/admissions/${encodeURIComponent(id)}/advance`, token, {
      completeStep: "pastor", decision, ...(decision === "REJECT" && reason ? { rejectionReason: reason } : {}),
    }), decision === "APPROVE" ? "Aprovação pastoral registrada." : "Recusa pastoral registrada.", setReviewError);
    if (saved) closeReview();
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

  const reviewedAdmission = reviewId ? admissions.find(admission => admission.id === reviewId) : undefined;
  function closeReview() {
    setReviewId(null);
    setReviewError("");
    setPastoralDecision(null);
  }

  const names: Record<View, string> = {
    overview: "Início",
    members: "Secretaria",
    secretary: "Secretaria",
    cards: "Carteirinhas",
    pastoral: "Admissões pastorais",
  };
  const activeNav = pastoralView ? "pastoral" : view === "overview" ? "visao" : view === "members" || view === "secretary" ? "secretaria" : "carteirinha";

  if (!isAdminEnabled()) {
    return (
      <AppShell active={activeNav} meta="Área administrativa">
        <section className={s.loginPanel}>
          <h1>Ambiente indisponível</h1>
          <p>Esta área não está habilitada nesta publicação.</p>
        </section>
      </AppShell>
    );
  }

  // A versão anterior exibia uma tela de senha própria e ignorava o desafio MFA.
  // Todos os acessos devem passar pelo mesmo fluxo seguro da rota /login.
  if (!token || !user) {
    if (checking) {
      return <main className={s.loginPanel} role="status"><h1>Verificando sessão…</h1></main>;
    }
    return <>
      {error && <div role="alert" className={s.loginPanel}>{error}</div>}
      <LoginScreen onAuthenticated={() => { void finishMfaLogin(); }} />
    </>;
  }

  return (
    <AppShell active={activeNav} meta={names[view]} pastoralSection={pastoralView ? "admissoes" : undefined} secretarySection={view === "secretary" ? secretary ? secretarySection : "admissoes" : undefined}>
      <div className={s.page} data-ficha-open={fichaId ? "true" : undefined} data-hml-view={view}>
        <div className={s.workspace}>
            {view !== "overview" && (
              <PageHeader
                appearance="workspace"
                heading="h1"
                title={names[view]}
                description={pastoralView ? "Consulte as fichas e os protocolos que chegaram à etapa pastoral." : view === "secretary" ? "Pessoas, famílias e admissões" : view === "cards" ? "Emissão e situação das carteirinhas" : undefined}
                actions={<>
                  {view === "members" && secretary && <AppNavLink className={ui.workspacePrimary} href="/app/secretaria/admissoes/?acao=cadastrar#cadastro">Cadastrar pessoa</AppNavLink>}
                  {view === "secretary" && secretary && <button type="button" className={ui.workspacePrimary} onClick={() => startSecretaryAction(secretarySection === "admissoes" ? "existing" : "new")}>
                    <UIIcon name="plus" size={17} /> {secretarySection === "admissoes" ? "Iniciar admissão" : "Cadastrar pessoa"}
                  </button>}
                  <button type="button" className={ui.workspaceQuiet} onClick={() => {
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
              <nav className={`${ui.workspaceTabs} ${s.secretaryTabs}`} aria-label="Áreas da secretaria">
                {secretary && <AppNavLink aria-current={secretarySection === "resumo" ? "page" : undefined} href="/app/secretaria/"><UIIcon name="grid" size={17} />Visão geral</AppNavLink>}
                {secretary && <AppNavLink aria-current={secretarySection === "pessoas" ? "page" : undefined} href="/app/secretaria/pessoas/"><UIIcon name="people" size={17} />Pessoas</AppNavLink>}
                <AppNavLink aria-current={!secretary || secretarySection === "admissoes" ? "page" : undefined} href="/app/secretaria/admissoes/"><UIIcon name="layers" size={17} />Admissões</AppNavLink>
                {secretary && <AppNavLink href="/app/membros/carteirinha/"><UIIcon name="badge" size={17} />Carteirinhas</AppNavLink>}
              </nav>
            )}
            {view === "overview" && <PersonaBoard />}
            {view === "secretary" && secretary && secretarySection === "resumo" && (
              <div className={s.secretaryOverview}>

                <SecretaryDashboard token={token} revision={summaryRevision}
                  households={familiesLoaded ? households.length : null}
                  credentials={loadedGroups.people ? memberships.filter(row => Boolean(row.activeCredentialId)).length : null}
                  churchFunctionCounts={churchFunctionCounts}
                  onOpenPerson={setFichaId} />
                <section className={s.admissionPipeline} aria-labelledby="secretaria-pipeline-title">
                  <header className={s.pipelineHead}>
                    <div><span className={s.pipelineEyebrow}>PROCESSOS EM ANDAMENTO</span>
                      <h2 id="secretaria-pipeline-title">Jornada de admissão</h2>
                      <p>Acompanhe cada etapa até a aprovação pastoral.</p></div>
                    <AppNavLink className={s.pipelineAll} href="/app/secretaria/admissoes/">
                      Ver todos os protocolos <UIIcon name="arrow" size={16}/>
                    </AppNavLink>
                  </header>
                  <div className={s.pipelineSteps}>
                    {([
                      ["modality", "Em preparação", "Modalidade e abertura"],
                      ["documents", "Documentação", "Dados e anexos"],
                      ["secretaria", "Análise da Secretaria", "Conferência de informações"],
                      ["pastor", "Aprovação pastoral", "Decisão final"],
                    ] as const).map(([step, label, detail], index) => (
                      <AppNavLink key={step} className={s.pipelineStep} href={`/app/secretaria/admissoes/?etapa=${step}`}>
                        <span className={s.pipelineNumber}>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{loadedGroups.admissions
                          ? admissions.filter(row => row.currentStep === step && !CLOSED_ADMISSIONS.includes(row.status)).length.toLocaleString("pt-BR")
                          : "—"}</strong>
                        <span className={s.pipelineLabel}>{label}</span>
                        <small>{detail}</small>
                        <UIIcon name="arrow" size={16}/>
                      </AppNavLink>
                    ))}
                  </div>
                </section>
              </div>
            )}
            {showsPeople && (
              <div className={s.peopleWorkspace}>
                <section className={`${s.panel} ${s.directoryPanel}`} aria-busy={checking}>
                  <div className={s.panelHeading}>
                    <div className={s.panelHeadingCopy}><span className={s.sectionMark}><UIIcon name="people" size={22} /></span><div><h2>Cadastro de pessoas</h2><span role="status">{loadedGroups.people ? `${filtered.length.toLocaleString("pt-BR")} ${filtered.length === 1 ? "pessoa encontrada" : "pessoas encontradas"}` : "Cadastros da congregação"}{selectedFamily ? ` · ${selectedFamily.label}` : ""}</span></div></div>
                    <WorkspaceSearch className={s.directorySearch} value={query} onChange={event => updateQuery(event.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar pessoas por nome ou e-mail" />
                  </div>

                  {secretary && <div className={s.peopleFilters} role="group" aria-label="Filtrar cadastro de pessoas">
                    <div className={ui.workspaceChoices} role="group" aria-label="Situação das pessoas">
                      {[["", "Todas"], ["ACTIVE", "Ativas"], ["INACTIVE", "Inativas"], ["PENDING_ADMISSION", "Em admissão"], ["TRANSFERRED", "Transferidos"]].map(([status, title]) =>
                        <button key={status} type="button" aria-pressed={membershipStatus === status}
                          onClick={() => { setMembershipStatus(status); setChurchFunction(null); setListPage(0); }}><UIIcon name={status === "ACTIVE" ? "check" : status === "PENDING_ADMISSION" ? "clock" : status === "TRANSFERRED" ? "arrow" : status === "INACTIVE" ? "close" : "people"} size={15} />{title}</button>
                      )}
                    </div>
                    <label className={s.familySelect}>Família
                      <select aria-label="Filtrar pessoas por família" value={familyFilter} onChange={event => { setFamilyFilter(event.target.value); setListPage(0); }}>
                        <option value="">Todas as famílias</option>
                        {households.map(family => <option key={family.id} value={family.id}>{family.label}</option>)}
                      </select>
                    </label>
                  </div>}
                  {secretary && (familyFilter || query || membershipStatus || churchFunction) && <div className={s.activeFilters}>
                    <span>{churchFunction ? ECCLESIASTICAL_ROLE_TOTAL_LABELS[churchFunction] : selectedFamily ? `Família: ${selectedFamily.label}` : "Filtros ativos"}</span>
                    <button type="button" onClick={() => { setFamilyFilter(""); setMembershipStatus(""); setChurchFunction(null); updateQuery(""); }}>Limpar filtros</button>
                  </div>}
                  {secretary && <section className={s.churchFunctionSummary} aria-labelledby="church-functions-title">
                    <h3 id="church-functions-title">Funções eclesiásticas</h3>
                    <p>Totais de membros ativos nesta congregação.</p>
                    <div className={s.churchFunctionCards}>
                      {churchFunctionCounts.map(({ role, total }) => (
                        <button type="button" key={role} aria-pressed={churchFunction === role} disabled={!loadedGroups.people}
                          onClick={() => { setChurchFunction(churchFunction === role ? null : role); setMembershipStatus(""); setListPage(0); }}>
                          <span>{ECCLESIASTICAL_ROLE_TOTAL_LABELS[role]}</span>
                          <strong>{total === null ? "—" : total.toLocaleString("pt-BR")}</strong>
                        </button>
                      ))}
                    </div>
                  </section>}
                  {!secretary ? <p className={s.empty}>Use a busca acima para consultar uma ficha.</p> : !loadedGroups.people ? (
                    <p className={s.empty} role="status">{checking ? "Carregando cadastros…" : "Não foi possível carregar os cadastros. Use Atualizar para tentar novamente."}</p>
                  ) : (
                    <div>
                      <ul className={s.peopleResults} aria-label="Pessoas encontradas">
                        {filtered.slice(firstRow, firstRow + PAGE_SIZE).map(membership => {
                          const { person, status } = membership;
                          const roles = ECCLESIASTICAL_ROLES.filter(role => memberHasFunction(membership, role));
                          return <li key={person.id}>
                            <div className={s.personIdentity}>
                              <PersonPortrait name={person.displayName} size="small" />
                              <div>
                                <strong>{person.displayName}</strong>
                                {person.email && <small>{person.email}</small>}
                                {roles.length > 0 && <small className={s.personFunctions}>{roles.map(role => ECCLESIASTICAL_ROLE_LABELS[role]).join(" · ")}</small>}
                              </div>
                            </div>
                            <div className={s.peopleMembership}>
                              <span className={s.statusPill} data-status={status}>{label(status)}</span>
                              <small>{person.householdId ? householdById.get(person.householdId) ?? "Vínculo não encontrado" : "Sem vínculo familiar"}</small>
                            </div>
                            <button type="button" className={s.openFicha} onClick={() => setFichaId(person.id)} aria-label={"Ver ficha de " + person.displayName}>Ver ficha <UIIcon name="arrow" size={14}/></button>
                          </li>;
                        })}
                      </ul>
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
                <section className={`${s.panel} ${s.directoryPanel}`} aria-busy={checking}>
                  <div className={s.panelHeading}>
                    <div className={s.panelHeadingCopy}><span className={s.sectionMark}><UIIcon name="layers" size={22} /></span><div><h2>Protocolos de admissão</h2><span role="status">{loadedGroups.admissions ? `${filteredAdmissions.length.toLocaleString("pt-BR")} ${filteredAdmissions.length === 1 ? "protocolo encontrado" : "protocolos encontrados"}` : "Carregando protocolos"}</span></div></div>
                    <WorkspaceSearch className={s.directorySearch} value={query} onChange={event => updateQuery(event.target.value)} placeholder="Buscar processo" aria-label="Buscar admissão" />
                  </div>
                  <div className={ui.workspaceChoices} role="group" aria-label="Filtrar protocolos">
                    {(admissionStage || admissionProtocol) && <AppNavLink className={ui.workspaceSecondary} href={pastoralView ? "/app/pastoral/admissoes/" : "/app/secretaria/admissoes/"}
                      onNavigate={pastoralView ? () => { setAdmissionProtocol(""); setShowHistory(false); setListPage(0); } : undefined}>Limpar seleção</AppNavLink>}
                    <button type="button" aria-pressed={!showHistory} onClick={() => { setShowHistory(false); setListPage(0); }}><UIIcon name="clock" size={15} />Em andamento</button>
                    <button type="button" aria-pressed={showHistory} onClick={() => { setShowHistory(true); setListPage(0); }}><UIIcon name="layers" size={15} />Todos</button>
                    {secretary && !pastoralView && <button type="button" onClick={() => setConfigureDocuments(true)}>Documentos por modalidade</button>}
                  </div>
                  {!staff ? <p className={s.empty}>Seu perfil não consulta os processos.</p> : !loadedGroups.admissions ? (
                    <p className={s.empty} role="status">{checking ? "Carregando admissões…" : "Não foi possível carregar as admissões. Use Atualizar para tentar novamente."}</p>
                  ) : (
                    <div className={s.admissions}>
                      {filteredAdmissions.slice(firstRow, firstRow + PAGE_SIZE).map(admission => {
                        const done = CLOSED_ADMISSIONS.includes(admission.status);
                        const personName = admissionName(admission) ?? "Pessoa em admissão";
                        const stepLabel = admission.currentStep === "pastor"
                          ? "decisão pastoral"
                          : admission.currentStep === "secretaria"
                            ? "secretaria"
                            : "documentação";
                        return (
                          <article key={admission.id} className={s.admission} data-step={done ? undefined : admission.currentStep}>
                            <div className={s.admissionIdentity}>
                              <PersonPortrait name={personName} size="small" />
                              <div><strong>{personName}</strong>
                                <small><span className={s.statusPill} data-status={admission.status}>{label(admission.status)}</span> {label(admission.modality ?? "")}</small>
                                {!done && <small className={s.admissionStage}>Etapa atual · {stepLabel}</small>}
                              </div>
                            </div>
                            <div className={s.admissionActions}>
                              <button type="button" className={ui.workspaceSecondary}
                                aria-label={"Revisar protocolo de " + personName} onClick={() => { setReviewError(""); setReviewId(admission.id); }}>Revisar protocolo</button>
                            </div>
                          </article>
                        );
                      })}
                      {filteredAdmissions.length === 0 && !error && <p className={s.empty}>Não há protocolos neste filtro.</p>}
                      <ListPager total={filteredAdmissions.length} page={visiblePage} onChange={setListPage} />
                    </div>
                  )}
                </section>
                {pastoralView && <section id="consultar-pessoa" className={s.panel} aria-labelledby="pastoral-person-title">
                  <h2 id="pastoral-person-title">Consultar ficha de uma pessoa</h2>
                  <div className={s.personLookupContent}>
                    <PersonPicker token={token} roles={user.grants.map(grant => grant.roleCode)} label="Procurar ficha por nome" value={searchedPerson} onChange={setSearchedPerson} />
                    <button type="button" className={s.openFicha} disabled={!searchedPerson} onClick={() => { setFichaId(searchedPerson); setSearchedPerson(""); }}>Abrir ficha selecionada</button>
                  </div>
                </section>}
              </div>
            )}
            {configureDocuments && token && secretary && !pastoralView &&
              <AdmissionRequirements token={token} onClose={() => setConfigureDocuments(false)} />}
            {reviewedAdmission && token && !fichaId && (
              <Modal open appearance="workspace" size="wide" title="Revisão do protocolo"
                description={admissionName(reviewedAdmission) ?? "Pessoa em admissão"}
                onClose={() => { if (!busy && !documentBusy) closeReview(); }}>
                <div className={s.protocolReview}>
                  {reviewError && <p role="alert">{reviewError}</p>}
                  <dl className={s.protocolFacts}>
                    <div><dt>Modalidade</dt><dd>{label(reviewedAdmission.modality ?? "")}</dd></div>
                    <div><dt>Situação</dt><dd>{label(reviewedAdmission.status)}</dd></div>
                    <div><dt>Registro</dt><dd>{formatDate(reviewedAdmission.createdAt)}</dd></div>
                  </dl>
                  <div><button type="button" className={ui.workspaceSecondary} disabled={documentBusy || busy}
                    onClick={() => setFichaId(reviewedAdmission.personId)}>Abrir ficha da pessoa</button></div>
                  <AdmissionDocuments key={reviewedAdmission.id} token={token} admissionId={reviewedAdmission.id} onBusy={setDocumentBusy}
                    canUpload={secretary && !pastoralView && !CLOSED_ADMISSIONS.includes(reviewedAdmission.status) && ["modality", "documents", "secretaria"].includes(reviewedAdmission.currentStep)} />
                  {!CLOSED_ADMISSIONS.includes(reviewedAdmission.status) && reviewedAdmission.currentStep === "pastor" && pastor && (
                    pastoralDecision ? <form className={s.form} onSubmit={event => void submitPastoralDecision(event, reviewedAdmission.id)}>
                      <h3>{pastoralDecision === "APPROVE" ? "Confirmar aprovação pastoral" : "Confirmar recusa da admissão"}</h3>
                      {pastoralDecision === "REJECT" && <label>Motivo da recusa (opcional)<textarea name="reason" maxLength={500} rows={3} disabled={busy} /></label>}
                      <div className={s.protocolActions}>
                        <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => { setReviewError(""); setPastoralDecision(null); }}>Voltar à revisão</button>
                        <button type="submit" className={ui.workspacePrimary} disabled={busy || documentBusy}>{busy ? "Registrando…" : "Confirmar decisão"}</button>
                      </div>
                    </form> : <div className={s.protocolActions}>
                      <button type="button" className={ui.workspaceSecondary} disabled={busy || documentBusy} onClick={() => setPastoralDecision("REJECT")}>Recusar admissão</button>
                      <button type="button" className={ui.workspacePrimary} disabled={busy || documentBusy} onClick={() => setPastoralDecision("APPROVE")}>Aprovar admissão</button>
                    </div>
                  )}
                  {!CLOSED_ADMISSIONS.includes(reviewedAdmission.status) && reviewedAdmission.currentStep !== "pastor" && secretary && !pastoralView && (
                    <form className={s.form} onSubmit={async event => {
                      event.preventDefault();
                      const chosen = new FormData(event.currentTarget).get("reviewModality");
                      if (await nextAdmission(reviewedAdmission, typeof chosen === "string" ? chosen : undefined)) closeReview();
                    }}>
                      {reviewedAdmission.currentStep === "modality" && <label>Modalidade da admissão
                        <select name="reviewModality" required defaultValue={reviewedAdmission.modality ?? ""} disabled={busy || documentBusy}>
                          <option value="">Selecione a modalidade</option>
                          {["BATISMO", "TRANSFERENCIA", "RECONCILIACAO", "ACLAMACAO", "OUTRO"].map(value => <option key={value} value={value}>{label(value)}</option>)}
                        </select></label>}
                      <div><button type="submit" className={ui.workspacePrimary} disabled={busy || documentBusy}>
                        {reviewedAdmission.currentStep === "secretaria" ? "Encaminhar à Pastoral"
                          : reviewedAdmission.currentStep === "modality" ? "Registrar modalidade" : "Concluir etapa de documentação"}
                      </button></div>
                    </form>
                  )}
                </div>
              </Modal>
            )}
            {secretary && view === "secretary" && admissionForm && (
              <Modal
                open
                appearance="workspace"
                size={admissionForm === "new" ? "wide" : "regular"}
                title={admissionForm === "existing" ? "Iniciar admissão" : "Cadastrar pessoa"}
                description={admissionForm === "existing"
                  ? "Escolha uma pessoa cadastrada e a modalidade de admissão."
                  : "Registre identificação, família e histórico. Ser membro exige aprovação pastoral."}
                onClose={closeSecretaryAction}
              >
                <form className={s.form} onSubmit={submitSecretariatForm} noValidate aria-busy={busy}>
                  {admissionForm === "existing" ? (
                    <>
                      <PersonPicker token={token} roles={user.grants.map(grant => grant.roleCode)} label="Pessoa para admissão" value={admissionPerson} onChange={setAdmissionPerson} selectedPerson={membershipByPerson.get(admissionPerson)?.person} placeholder="Buscar pelo nome" required disabled={busy} />
                      <label>Modalidade
                        <select value={modality} onChange={event => setModality(event.target.value)} disabled={busy}>
                          <option value="BATISMO">Batismo</option>
                          <option value="TRANSFERENCIA">Transferência</option>
                          <option value="RECONCILIACAO">Reconciliação</option>
                          <option value="ACLAMACAO">Aclamação</option>
                          <option value="OUTRO">Outro</option>
                        </select>
                      </label>
                    </>
                  ) : (
                    <>
                    <NewPersonIntake
                      name={newName}
                      email={newEmail}
                      profile={newProfile}
                      families={households}
                      token={token}
                      roles={user.grants.map(grant => grant.roleCode)}
                      busy={busy}
                      onName={setNewName}
                      onEmail={setNewEmail}
                      onProfile={setNewProfile}
                    />
                    <PersonPhotoInput photo={intakePhoto} onChange={setIntakePhoto} disabled={busy} />
                    </>
                  )}
                  <div className={s.formActions}>
                    <button type="button" className={ui.workspaceSecondary} onClick={closeSecretaryAction} disabled={busy}>Cancelar</button>
                    <button type="submit" disabled={busy}>
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
                pendingPhoto={pendingPhoto}
                households={households}
                canEdit={secretary && !pastoralView}
                canReadDocuments={staff}
                credential={credentialFromMemberships(secretary, memberships, fichaId)}
                onClose={() => {
                  setFichaId(null);
                  setPendingPhoto(null);
                  const url = new URL(window.location.href);
                  if (url.searchParams.has("pessoa")) {
                    url.searchParams.delete("pessoa");
                    window.history.replaceState(null, "", url);
                  }
                }}
                onMembershipRolesSaved={(membershipId, ecclesiasticalRoles) => {
                  clearPanelReads();
                  setMemberships(rows => rows.map(row => row.id === membershipId ? { ...row, ecclesiasticalRoles } : row));
                }}
                onPersonSaved={person => {
                  setMemberships(rows => rows.map(row => row.person.id === person.id ? { ...row, person } : row));
                  setSummaryRevision(version => version + 1);
                }}
                onHouseholdCreated={secretary ? household => setHouseholds(rows => [household, ...rows]) : undefined}
                onSessionExpired={logout}
              />
            )}
            {!isProductionAdmin() && <p className={s.footerNote}>Ambiente de homologação. Não cadastre dados de pessoas reais.</p>}
          </div>
      </div>
    </AppShell>
  );
}
