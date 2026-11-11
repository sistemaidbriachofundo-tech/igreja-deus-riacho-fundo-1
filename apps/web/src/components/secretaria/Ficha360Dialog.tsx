"use client";

import { PersonPortrait } from "../PersonPortrait";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "../ui/Alert";
import { AppNavLink } from "../AppShell";
import { useDialogLifecycle } from "../ui/dialog";
import ui from "../ui/ui.module.css";
import {
  dossierLabel,
  type AdmissionDocumentList,
  type DossierFailure,
  type EditablePersonFields,
  type FichaState,
  type PersonDossier,
} from "../secretary-dossier";
import s from "../secretary-dossier.module.css";

type HouseholdOption = { id: string; label: string };

export type CredentialView =
  | { known: false }
  | { known: true; activeCredentialId: string | null };

type Props = {
  titleId: string;
  guardianPicker?: ReactNode;
  state: FichaState;
  households: HouseholdOption[];
  canEdit: boolean;
  canReadDocuments: boolean;
  credential: CredentialView;
  documents: AdmissionDocumentList[] | null;
  onCreateHousehold?: (label: string) => Promise<string>;
  onClose: () => void;
  onEdit: (next: EditablePersonFields) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReopen: () => void;
  onSessionExpired: () => void;
};

function formatWhen(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "—";
}

function FailureNotice({
  failure,
  title,
  onRetry,
  onSessionExpired,
}: {
  failure: DossierFailure;
  title: string;
  onRetry?: () => void;
  onSessionExpired: () => void;
}) {
  const session = failure.kind === "session";
  const retry = failure.kind === "unknown" ? onRetry : undefined;

  return (
    <Alert
      appearance="workspace"
      tone={session || failure.kind === "conflict" ? "warning" : "danger"}
      title={session ? "Sua sessão expirou" : title}
    >
      {session ? "Entre novamente para continuar." : failure.message}
      {(session || retry) && (
        <div>
          <button
            type="button"
            className={ui.workspaceSecondary}
            onClick={session ? onSessionExpired : retry}
          >
            {session ? "Entrar novamente" : "Tentar novamente"}
          </button>
        </div>
      )}
    </Alert>
  );
}

export function Ficha360Dialog({
  titleId,
  guardianPicker,
  state,
  households,
  canEdit,
  canReadDocuments,
  credential,
  documents,
  onCreateHousehold,
  onClose,
  onEdit,
  onSubmit,
  onReopen,
  onSessionExpired,
}: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const [newFamily, setNewFamily] = useState("");
  const [familyOpen, setFamilyOpen] = useState(false);
  const [creatingFamily, setCreatingFamily] = useState(false);
  const [familyFeedback, setFamilyFeedback] = useState<{ error: boolean; text: string } | null>(null);
  function close() {
    if (!creatingFamily) onClose();
  }
  useDialogLifecycle(true, close, dialogRef);
  const busy =
    state.phase === "loading" ||
    state.phase === "saving" ||
    state.phase === "reopening";
  const person = state.person;
  const dossier = state.dossier;
  const form = state.form;
  const openAdmission = dossier?.admissionHistory.find(item => !["APPROVED", "REJECTED", "CANCELLED"].includes(item.status));
  const loadFailure = state.refreshError ?? state.loadError;
  const editFailure = state.saveError ?? state.refreshError;
  const options = householdOptions(
    households,
    form?.householdId ?? "",
    dossier,
  );

  async function createFamily() {
    const name = newFamily.trim();
    if (!form || !onCreateHousehold || creatingFamily || name.length < 3) return;
    setCreatingFamily(true);
    setFamilyFeedback(null);
    try {
      const householdId = await onCreateHousehold(name);
      onEdit({ ...form, householdId });
      setFamilyOpen(false);
      setNewFamily("");
      setFamilyFeedback({ error: false, text: "Família cadastrada. Salve a ficha para confirmar o vínculo." });
    } catch {
      setFamilyFeedback({ error: true, text: "Não foi possível cadastrar a família. Tente novamente." });
    } finally {
      setCreatingFamily(false);
    }
  }

  return (
    <div className={s.overlay}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-can-edit={canEdit ? "true" : "false"}
        data-phase={state.phase}
        data-ficha="360"
      >
        <header className={s.header}>
          <div className={s.identityHeader}>
            <PersonPortrait
              name={person?.displayName ?? "Pessoa"}
              photoUrl={person?.photoUrl}
              size="large"
            />
            <div>
              <h2 id={titleId}>
                {person?.displayName ?? "Cadastro de pessoa"}
              </h2>
            </div>
          </div>
          <button
            type="button"
            className={s.close}
            disabled={state.phase === "saving" || state.phase === "reopening" || creatingFamily}
            onClick={close}
            aria-label="Fechar ficha"
          >
            Fechar
          </button>
        </header>

        {!form && (
          <div className={s.feedback}>
            {busy && (
              <Alert
                appearance="workspace"
                tone="info"
                title="Abrindo ficha…"
              />
            )}
            {!busy && loadFailure && (
              <FailureNotice
                failure={loadFailure}
                title="Não foi possível abrir a ficha"
                onRetry={onReopen}
                onSessionExpired={onSessionExpired}
              />
            )}
          </div>
        )}

        {form && person && dossier && (
          <>
            <form className={s.form} onSubmit={onSubmit}>
              <fieldset disabled={busy || !canEdit || creatingFamily}>
                <legend>Dados pessoais</legend>
                <label>
                  Nome
                  <input
                    data-field="displayName"
                    value={form.displayName}
                    autoComplete="off"
                    maxLength={160}
                    onChange={(event) =>
                      onEdit({ ...form, displayName: event.target.value })
                    }
                  />
                </label>
                <label>
                  E-mail de contato
                  <input
                    data-field="email"
                    type="email"
                    value={form.email}
                    autoComplete="off"
                    placeholder="pessoa.demo@example.test"
                    onChange={(event) =>
                      onEdit({ ...form, email: event.target.value })
                    }
                  />
                </label>
                <p className={s.hint}>
                  Use um endereço @example.test. Deixe em branco para remover o
                  contato.
                </p>
                {form.address !== undefined && <label>
                  Endereço residencial
                  <textarea value={form.address} maxLength={500} rows={2} autoComplete="street-address"
                    onChange={event => onEdit({ ...form, address: event.target.value })} />
                </label>}
                <label className={s.check}>
                  <input
                    data-field="isMinor"
                    type="checkbox"
                    checked={form.isMinor}
                    onChange={(event) =>
                      onEdit({ ...form, isMinor: event.target.checked })
                    }
                  />
                  Pessoa menor de idade
                </label>
                {(form.isMinor || form.legalGuardianPersonId) && (
                  <div className={s.guardianField}>
                    {guardianPicker ?? (
                      <p className={s.hint}>
                        Responsável legal:{" "}
                        {dossier.legalGuardian?.displayName ?? "Não informado"}
                      </p>
                    )}
                  </div>
                )}
                {dossier.legalGuardian &&
                  form.legalGuardianPersonId !== dossier.legalGuardian.id && (
                    <p className={s.hint}>
                      Responsável atual: {dossier.legalGuardian.displayName}
                      {dossier.legalGuardian.email
                        ? ` · ${dossier.legalGuardian.email}`
                        : ""}
                    </p>
                  )}
                <label>
                  Família
                  <select
                    data-field="householdId"
                    aria-label="Família"
                    value={form.householdId}
                    onChange={(event) =>
                      onEdit({ ...form, householdId: event.target.value })
                    }
                  >
                    <option value="">Sem família vinculada</option>
                    {options.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                {canEdit && onCreateHousehold && (
                  <div className={s.familyEditor}>
                    {familyOpen ? (
                      <>
                        <label>Nome da nova família<input value={newFamily} maxLength={120} onChange={(event) => setNewFamily(event.target.value)} onKeyDown={event => {
                          if (event.key === "Enter") { event.preventDefault(); void createFamily(); }
                        }} /></label>
                        <div className={s.actions}>
                          <button type="button" className={s.secondary} onClick={() => { setFamilyOpen(false); setFamilyFeedback(null); setNewFamily(""); }}>Cancelar</button>
                          <button type="button" className={s.primary} disabled={newFamily.trim().length < 3 || creatingFamily} onClick={() => void createFamily()}>
                            {creatingFamily ? "Cadastrando…" : "Cadastrar família"}
                          </button>
                        </div>
                      </>
                    ) : <button type="button" className={s.secondary} onClick={() => { setFamilyOpen(true); setFamilyFeedback(null); }}>Nova família</button>}
                    {familyFeedback && (familyFeedback.error || (!busy && person.householdId !== form.householdId)) && (
                      <p className={s.hint} role={familyFeedback.error ? "alert" : "status"}>{familyFeedback.text}</p>
                    )}
                  </div>
                )}
                <label>
                  Observação do vínculo mais recente
                  <textarea
                    data-field="notes"
                    value={form.notes}
                    maxLength={4000}
                    rows={3}
                    disabled={busy || !canEdit || !state.versions.membershipId}
                    onChange={(event) =>
                      onEdit({ ...form, notes: event.target.value })
                    }
                  />
                </label>
                {canEdit && !state.versions.membershipId && (
                  <p className={s.hint}>
                    Não há vínculo nesta congregação para gravar observação.
                  </p>
                )}
              </fieldset>
              {busy && (
                <Alert
                  appearance="workspace"
                  tone="info"
                  title={
                    state.phase === "saving"
                      ? "Salvando ficha…"
                      : "Atualizando ficha…"
                  }
                />
              )}
              {!busy && editFailure && (
                <FailureNotice
                  failure={editFailure}
                  title={
                    state.saveError
                      ? "Confira a ficha antes de salvar novamente"
                      : "Atualização incompleta"
                  }
                  onSessionExpired={onSessionExpired}
                />
              )}
              {state.notice && (
                <Alert
                  appearance="workspace"
                  tone={state.notice.tone}
                  title={state.notice.title}
                >
                  {state.notice.detail}
                </Alert>
              )}
              <div className={s.actions}>
                {canEdit && (
                  <button type="submit" className={s.primary} disabled={busy || creatingFamily}>
                    {state.phase === "saving" ? "Salvando…" : "Salvar"}
                  </button>
                )}
                <button
                  type="button"
                  className={s.secondary}
                  onClick={onReopen}
                  disabled={busy || creatingFamily}
                >
                  Atualizar ficha
                </button>
              </div>
              {!canEdit && (
                <p className={s.hint}>
                  Seu perfil pode consultar a ficha. A gravação exige
                  Secretaria.
                </p>
              )}
            </form>

            <section className={s.locked} aria-label="Situação do cadastro">
              <h3>Situação do cadastro</h3>
              <dl className={s.statusGrid}>
                <div><dt>Cadastro pessoal</dt><dd>{dossierLabel(person.status)}</dd></div>
                <div><dt>Tipo de cadastro</dt><dd>{dossierLabel(person.kind)}</dd></div>
                <div><dt>Vínculo na congregação</dt><dd>{dossier.memberships[0] ? dossierLabel(dossier.memberships[0].status) : "Sem vínculo"}</dd></div>
              </dl>
              {canEdit && (openAdmission || person.kind === "VISITOR") && <AppNavLink className={ui.workspaceSecondary}
                href={openAdmission ? `/app/secretaria/admissoes/?protocolo=${encodeURIComponent(openAdmission.id)}` : `/app/secretaria/admissoes/?acao=admissao&cadastro=${encodeURIComponent(person.id)}`}>
                {openAdmission ? "Ver protocolo de admissão" : "Iniciar admissão desta pessoa"}
              </AppNavLink>}
              <p>A condição de membro é registrada na aprovação da admissão.</p>
            </section>

            <section className={s.context} aria-label="Vínculos familiares">
              <h3>Família e dependentes</h3>
              <dl>
                <div>
                  <dt>Pessoas na família</dt>
                  <dd>
                    {dossier.household
                      ? dossier.household.members
                          .map(
                            (item) =>
                              item.displayName +
                              (item.isMinor ? " (menor)" : ""),
                          )
                          .join(", ")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Dependentes</dt>
                  <dd>
                    {dossier.dependents.length
                      ? dossier.dependents
                          .map((item) => item.displayName)
                          .join(", ")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Foto para o cadastro e a carteirinha</dt>
                  <dd>
                    {person.photoUrl ? "Foto cadastrada." : person.photo?.hasStorageKey
                      ? "Foto cadastrada. A imagem não está disponível nesta consulta."
                      : "Sem foto cadastrada."}
                  </dd>
                </div>
                <div>
                  <dt>Credencial</dt>
                  <dd>{credentialText(credential)}</dd>
                </div>
              </dl>
            </section>

            <section className={s.context} aria-label="Histórico eclesiástico">
              <h3>Histórico eclesiástico</h3>
              {dossier.memberships.length ? (
                dossier.memberships.map((item) => (
                  <article key={item.id} className={s.history}>
                    <strong>{dossierLabel(item.status)}</strong>
                    <span>Vínculo desde {formatWhen(item.joinedAt)}</span>
                    {item.id !== state.versions.membershipId && item.notes && (
                      <small>Observação: {item.notes}</small>
                    )}
                  </article>
                ))
              ) : (
                <p className={s.hint}>Nenhum vínculo nesta congregação.</p>
              )}
              <h3>Protocolos de admissão</h3>
              {dossier.admissionHistory.length ? (
                dossier.admissionHistory.map((item) => (
                  <article
                    key={item.id}
                    className={s.history}
                    data-admission={item.id}
                  >
                    <strong>{dossierLabel(item.status)}</strong>
                    <span>
                      {dossierLabel(item.modality)} ·{" "}
                      {dossierLabel(item.currentStep)}
                    </span>
                    <small>
                      Documentação{" "}
                      {item.checklist.documentsComplete
                        ? "completa"
                        : "pendente"}
                      {" · "}Secretaria{" "}
                      {item.checklist.secretariaApproved
                        ? "aprovou"
                        : "pendente"}
                      {" · "}Pastoral{" "}
                      {item.checklist.pastorApproved ? "aprovou" : "pendente"}
                    </small>
                    <small>Atualizado em {formatWhen(item.updatedAt)}</small>
                    <DocumentList
                      canRead={canReadDocuments}
                      list={
                        documents?.find(
                          (entry) => entry.admissionId === item.id,
                        ) ?? null
                      }
                      pending={canReadDocuments && documents === null}
                    />
                  </article>
                ))
              ) : (
                <p className={s.hint}>Nenhum protocolo neste escopo.</p>
              )}
              {!canReadDocuments && (
                <p className={s.hint}>
                  Documentos de admissão não são pedidos para este perfil.
                </p>
              )}
            </section>
          </>
        )}
      </section>
    </div>
  );
}

function householdOptions(
  households: HouseholdOption[],
  current: string,
  dossier: PersonDossier | null,
) {
  const options = households.map((item) => ({
    id: item.id,
    label: item.label,
  }));
  if (current && !options.some((item) => item.id === current)) {
    options.unshift({
      id: current,
      label:
        dossier?.household?.id === current
          ? dossier.household.label
          : "Família vinculada",
    });
  }
  return options;
}

function credentialText(credential: CredentialView) {
  if (!credential.known)
    return "Consulte a Secretaria para verificar a carteirinha.";
  if (!credential.activeCredentialId) return "Nenhuma credencial ativa.";
  return "Carteirinha ativa. Consulte a área de Carteirinhas para visualizar.";
}

function DocumentList({
  canRead,
  list,
  pending,
}: {
  canRead: boolean;
  list: AdmissionDocumentList | null;
  pending: boolean;
}) {
  if (!canRead) return null;
  if (pending || !list)
    return <small>Consultando documentos do protocolo…</small>;
  if (list.failure) return <small>Documentos: {list.failure.message}</small>;
  if (list.documents.length === 0)
    return <small>Nenhum documento anexado neste protocolo.</small>;
  return (
    <ul className={s.documents}>
      {list.documents.map((document) => (
        <li key={document.id}>
          {document.displayName} · {document.contentType} · {document.byteSize}{" "}
          bytes
        </li>
      ))}
    </ul>
  );
}
