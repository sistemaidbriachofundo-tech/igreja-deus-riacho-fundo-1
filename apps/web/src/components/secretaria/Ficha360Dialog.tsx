import { PersonPortrait } from "../PersonPortrait";
import type { FormEvent } from "react";
import {
  REGULATED_PERSON_FIELDS,
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
  state: FichaState;
  households: HouseholdOption[];
  canEdit: boolean;
  canReadDocuments: boolean;
  credential: CredentialView;
  documents: AdmissionDocumentList[] | null;
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

function failureBlock(failure: DossierFailure | null, slot: string, title: string) {
  if (!failure) return null;
  return (
    <div role="alert" className={s.error} data-failure={slot} data-kind={failure.kind}>
      <strong>{title}</strong> {failure.message}
    </div>
  );
}

export function Ficha360Dialog({
  titleId,
  state,
  households,
  canEdit,
  canReadDocuments,
  credential,
  documents,
  onClose,
  onEdit,
  onSubmit,
  onReopen,
  onSessionExpired,
}: Props) {
  const busy = state.phase === "loading" || state.phase === "saving" || state.phase === "reopening";
  const sessionExpired = [state.loadError, state.saveError, state.refreshError].some((failure) => failure?.kind === "session");
  const person = state.person;
  const dossier = state.dossier;
  const form = state.form;
  const options = householdOptions(households, form?.householdId ?? "", dossier);

  return (
    <div className={s.overlay}>
      <section
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
            <PersonPortrait name={person?.displayName ?? "Pessoa"} size="large" />
            <div>
              <h2 id={titleId}>{person?.displayName ?? "Cadastro de pessoa"}</h2>
            </div>
          </div>
          <button type="button" className={s.close} onClick={onClose} aria-label="Fechar ficha">Fechar</button>
        </header>

        {state.phase === "loading" && <p className={s.status} role="status">Abrindo ficha…</p>}
        {state.phase === "saving" && <p className={s.status} role="status">Salvando ficha…</p>}
        {state.phase === "reopening" && <p className={s.status} role="status">Atualizando ficha…</p>}

        {failureBlock(state.loadError, "load", "Falha ao abrir.")}
        {failureBlock(state.saveError, "save", "Falha ao salvar.")}
        {failureBlock(state.refreshError, "refresh", "Falha ao reabrir.")}
        {state.notice && <div role="status" className={s.notice}>{state.notice}</div>}

        {form && person && dossier && (
          <>
            <form className={s.form} onSubmit={onSubmit}>
              <fieldset disabled={busy || !canEdit}>
                <legend>Dados pessoais</legend>
                <label>
                  Nome
                  <input
                    data-field="displayName"
                    value={form.displayName}
                    autoComplete="off"
                    maxLength={160}
                    onChange={(event) => onEdit({ ...form, displayName: event.target.value })}
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
                    onChange={(event) => onEdit({ ...form, email: event.target.value })}
                  />
                </label>
                <p className={s.hint}>Use um endereço @example.test. Deixe em branco para remover o contato.</p>
                <label className={s.check}>
                  <input
                    data-field="isMinor"
                    type="checkbox"
                    checked={form.isMinor}
                    onChange={(event) => onEdit({ ...form, isMinor: event.target.checked })}
                  />
                  Pessoa menor de idade
                </label>
                <label>
                  Responsável legal
                  <input
                    data-field="legalGuardianPersonId"
                    value={form.legalGuardianPersonId}
                    autoComplete="off"
                    placeholder="Código do cadastro do responsável"
                    onChange={(event) => onEdit({ ...form, legalGuardianPersonId: event.target.value })}
                  />
                </label>
                {dossier.legalGuardian && (
                  <p className={s.hint}>
                    Responsável atual: {dossier.legalGuardian.displayName}
                    {dossier.legalGuardian.email ? ` · ${dossier.legalGuardian.email}` : ""}
                  </p>
                )}
                <label>
                  Família
                  <select
                    data-field="householdId"
                    aria-label="Família"
                    value={form.householdId}
                    onChange={(event) => onEdit({ ...form, householdId: event.target.value })}
                  >
                    <option value="">Sem família vinculada</option>
                    {options.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Observação do vínculo mais recente
                  <textarea
                    data-field="notes"
                    value={form.notes}
                    maxLength={4000}
                    rows={3}
                    disabled={busy || !canEdit || !state.versions.membershipId}
                    onChange={(event) => onEdit({ ...form, notes: event.target.value })}
                  />
                </label>
                {canEdit && !state.versions.membershipId && (
                  <p className={s.hint}>Não há vínculo nesta congregação para gravar observação.</p>
                )}
              </fieldset>
              <div className={s.actions}>
                {canEdit && (
                  <button type="submit" className={s.primary} disabled={busy}>
                    {state.phase === "saving" ? "Salvando…" : "Salvar"}
                  </button>
                )}
                <button type="button" className={s.secondary} onClick={onReopen} disabled={busy}>
                  Reabrir ficha
                </button>
                {sessionExpired && (
                  <button type="button" className={s.secondary} onClick={onSessionExpired}>Entrar novamente</button>
                )}
              </div>
              {!canEdit && <p className={s.hint}>Seu perfil pode consultar a ficha. A gravação exige Secretaria.</p>}
            </form>

            <section className={s.locked} aria-label="Situação do cadastro">
              <h3>Situação do cadastro</h3>
              <p>
                A situação muda conforme a admissão ou a transferência.
              </p>
              <div className={s.lockedGrid}>
                {REGULATED_PERSON_FIELDS.map((field) => (
                  <label key={field.key}>
                    {field.label}
                    <input value={dossierLabel(person[field.key])} readOnly aria-readonly="true" />
                  </label>
                ))}
              </div>
            </section>

            <section className={s.context} aria-label="Vínculos familiares">
              <h3>Família e dependentes</h3>
              <dl>
                <div>
                  <dt>Pessoas na família</dt>
                  <dd>{dossier.household ? dossier.household.members.map((item) => item.displayName + (item.isMinor ? " (menor)" : "")).join(", ") : "—"}</dd>
                </div>
                <div>
                  <dt>Dependentes</dt>
                  <dd>{dossier.dependents.length ? dossier.dependents.map((item) => item.displayName).join(", ") : "—"}</dd>
                </div>
                <div>
                  <dt>Foto para o cadastro e a carteirinha</dt>
                  <dd>{person.photo?.hasStorageKey
                    ? "Referência de foto cadastrada. Visualização e atualização ainda dependem do serviço privado de imagens."
                    : "Ainda sem foto. O espaço fica reservado para envio autorizado pelo membro ou pela secretaria."}</dd>
                </div>
                <div>
                  <dt>Credencial</dt>
                  <dd>{credentialText(credential)}</dd>
                </div>
              </dl>
            </section>

            <section className={s.context} aria-label="Histórico eclesiástico">
              <h3>Histórico eclesiástico</h3>
              {dossier.memberships.length ? dossier.memberships.map((item) => (
                <article key={item.id} className={s.history}>
                  <strong>{dossierLabel(item.status)}</strong>
                  <span>Vínculo desde {formatWhen(item.joinedAt)}</span>
                  {item.id !== state.versions.membershipId && item.notes && <small>Observação: {item.notes}</small>}
                </article>
              )) : <p className={s.hint}>Nenhum vínculo neste escopo.</p>}
              <h3>Protocolos de admissão</h3>
              {dossier.admissionHistory.length ? dossier.admissionHistory.map((item) => (
                <article key={item.id} className={s.history} data-admission={item.id}>
                  <strong>{dossierLabel(item.status)}</strong>
                  <span>{dossierLabel(item.modality)} · {dossierLabel(item.currentStep)}</span>
                  <small>
                    Documentação {item.checklist.documentsComplete ? "completa" : "pendente"}
                    {" · "}Secretaria {item.checklist.secretariaApproved ? "aprovou" : "pendente"}
                    {" · "}Pastoral {item.checklist.pastorApproved ? "aprovou" : "pendente"}
                  </small>
                  <small>Atualizado em {formatWhen(item.updatedAt)}</small>
                  <DocumentList
                    canRead={canReadDocuments}
                    list={documents?.find((entry) => entry.admissionId === item.id) ?? null}
                    pending={canReadDocuments && documents === null}
                  />
                </article>
              )) : <p className={s.hint}>Nenhum protocolo neste escopo.</p>}
              {!canReadDocuments && <p className={s.hint}>Documentos de admissão não são pedidos para este perfil.</p>}
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
  const options = households.map((item) => ({ id: item.id, label: item.label }));
  if (current && !options.some((item) => item.id === current)) {
    options.unshift({
      id: current,
      label: dossier?.household?.id === current ? dossier.household.label : "Família vinculada",
    });
  }
  return options;
}

function credentialText(credential: CredentialView) {
  if (!credential.known) return "A listagem de credenciais exige Secretaria.";
  if (!credential.activeCredentialId) return "Nenhuma credencial ativa.";
  return "Credencial ativa registrada. O arquivo não é baixado nesta ficha.";
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
  if (pending || !list) return <small>Consultando documentos do protocolo…</small>;
  if (list.failure) return <small>Documentos: {list.failure.message}</small>;
  if (list.documents.length === 0) return <small>Nenhum documento anexado neste protocolo.</small>;
  return (
    <ul className={s.documents}>
      {list.documents.map((document) => (
        <li key={document.id}>
          {document.displayName} · {document.contentType} · {document.byteSize} bytes
        </li>
      ))}
    </ul>
  );
}
