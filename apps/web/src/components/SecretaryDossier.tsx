"use client";

import { useEffect, useId, useMemo, useReducer, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiPatch } from "../lib/api";
import {
  UNSUPPORTED_PERSON_FIELDS,
  dossierLabel,
  fichaReducer,
  initialFichaState,
  loadPersonDossier,
  savePersonDossier,
  type DossierClient,
  type EditablePersonFields,
  type PersonDossier,
} from "./secretary-dossier";
import s from "./secretary-dossier.module.css";

type HouseholdOption = { id: string; label: string };

type Props = {
  token: string;
  personId: string;
  households: HouseholdOption[];
  canEdit: boolean;
  onClose: () => void;
  onSessionExpired: () => void;
};

const client: DossierClient = { get: apiGet, patch: apiPatch };

function formatWhen(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "—";
}

function notesOf(dossier: PersonDossier | null) {
  const notes = dossier?.memberships.find((item) => item.notes)?.notes;
  return notes?.trim() ? notes : "—";
}

export function SecretaryDossier({
  token,
  personId,
  households,
  canEdit,
  onClose,
  onSessionExpired,
}: Props) {
  const titleId = useId();
  const [state, dispatch] = useReducer(fichaReducer, initialFichaState);
  const busy = state.phase === "loading" || state.phase === "saving" || state.phase === "reopening";
  const sessionExpired = [state.loadError, state.saveError, state.refreshError].some((failure) => failure?.kind === "session");

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    void loadPersonDossier(client, token, personId).then((result) => {
      if (cancelled) return;
      const elapsedMs = performance.now() - started;
      if (result.ok) dispatch({ type: "load-ok", data: result.data, elapsedMs });
      else dispatch({ type: "load-fail", failure: result.failure, elapsedMs });
    });
    return () => {
      cancelled = true;
    };
  }, [token, personId]);

  const householdOptions = useMemo(() => {
    const options = households.map((item) => ({ id: item.id, label: item.label }));
    const current = state.form?.householdId;
    if (current && !options.some((item) => item.id === current)) {
      options.unshift({
        id: current,
        label: state.dossier?.household?.id === current
          ? state.dossier.household.label
          : "Família vinculada",
      });
    }
    return options;
  }, [households, state.form?.householdId, state.dossier]);

  function edit(next: EditablePersonFields) {
    dispatch({ type: "edit", form: next });
  }

  async function reload(context: "after-save" | "manual", startedAt?: number) {
    const started = startedAt ?? performance.now();
    const result = await loadPersonDossier(client, token, personId);
    const elapsedMs = performance.now() - started;
    if (result.ok) dispatch({ type: "reopen-ok", data: result.data, elapsedMs, context });
    else dispatch({ type: "reopen-fail", failure: result.failure, elapsedMs, context });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.form || !state.baseline || !canEdit) return;
    const started = performance.now();
    dispatch({ type: "saving" });
    const saved = await savePersonDossier(client, token, personId, state.form, state.baseline);
    if (!saved.ok) {
      if ("unchanged" in saved) dispatch({ type: "save-unchanged" });
      else dispatch({ type: "save-fail", failure: saved.failure });
      return;
    }
    dispatch({ type: "save-ok", person: saved.person });
    await reload("after-save", started);
  }

  async function reopen() {
    const dirty = state.form && state.baseline
      && (state.form.isMinor !== state.baseline.isMinor
        || state.form.legalGuardianPersonId !== state.baseline.legalGuardianPersonId
        || state.form.householdId !== state.baseline.householdId);
    if (dirty && !window.confirm("Reabrir substitui o que ainda não foi salvo pelos dados atuais da API.")) return;
    dispatch({ type: "reopening" });
    await reload("manual");
  }

  const person = state.person;
  const dossier = state.dossier;
  const unsupported = person
    ? {
        displayName: person.displayName,
        email: person.email ?? "—",
        status: dossierLabel(person.status),
        kind: dossierLabel(person.kind),
        notes: notesOf(dossier),
      }
    : null;

  // Fora do contexto de empilhamento do AppShell; o cabeçalho fixo não cobre a ficha.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={s.overlay}>
      <section
        className={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-can-edit={canEdit ? "true" : "false"}
        data-phase={state.phase}
      >
        <header className={s.header}>
          <div>
            <span className={s.kicker}>FICHA SINTÉTICA · SECRETARIA</span>
            <h2 id={titleId}>{person?.displayName ?? "Ficha da pessoa"}</h2>
            <p>Identificador {personId}. Somente dados fictícios de homologação.</p>
          </div>
          <button type="button" className={s.close} onClick={onClose} aria-label="Fechar ficha">Fechar</button>
        </header>

        {state.phase === "loading" && <p className={s.status} role="status">Abrindo ficha…</p>}
        {state.phase === "saving" && <p className={s.status} role="status">Salvando campos permitidos…</p>}
        {state.phase === "reopening" && <p className={s.status} role="status">Reabrindo ficha na API…</p>}

        {state.loadError && (
          <div role="alert" className={s.error} data-failure="load" data-kind={state.loadError.kind}>
            <strong>Falha ao abrir.</strong> {state.loadError.message}
          </div>
        )}
        {state.saveError && (
          <div role="alert" className={s.error} data-failure="save" data-kind={state.saveError.kind}>
            <strong>Falha ao salvar.</strong> {state.saveError.message}
          </div>
        )}
        {state.refreshError && (
          <div role="alert" className={s.error} data-failure="refresh" data-kind={state.refreshError.kind}>
            <strong>Falha ao reabrir.</strong> {state.refreshError.message}
          </div>
        )}
        {state.notice && <div role="status" className={s.notice}>{state.notice}</div>}

        {state.form && person && unsupported && (
          <>
            <form className={s.form} onSubmit={onSubmit}>
              <fieldset disabled={busy || !canEdit}>
                <legend>Campos que a API grava</legend>
                <label className={s.check}>
                  <input
                    type="checkbox"
                    checked={state.form.isMinor}
                    onChange={(event) => edit({ ...state.form as EditablePersonFields, isMinor: event.target.checked })}
                  />
                  Pessoa menor de idade
                </label>
                <label>
                  Responsável legal
                  <input
                    value={state.form.legalGuardianPersonId}
                    autoComplete="off"
                    placeholder="Identificador da pessoa adulta fictícia"
                    onChange={(event) => edit({ ...state.form as EditablePersonFields, legalGuardianPersonId: event.target.value })}
                  />
                </label>
                {dossier?.legalGuardian && (
                  <p className={s.hint}>Responsável atual na ficha: {dossier.legalGuardian.displayName}</p>
                )}
                <label>
                  Família
                  <select
                    aria-label="Família"
                    value={state.form.householdId}
                    onChange={(event) => edit({ ...state.form as EditablePersonFields, householdId: event.target.value })}
                  >
                    <option value="">Sem família vinculada</option>
                    {householdOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <p className={s.hint}>Menor de idade só é aceito com responsável legal adulto. A API recusa o restante.</p>
              </fieldset>
              <div className={s.actions}>
                {canEdit && (
                  <button type="submit" className={s.primary} disabled={busy}>
                    {state.phase === "saving" ? "Salvando…" : "Salvar campos permitidos"}
                  </button>
                )}
                <button type="button" className={s.secondary} onClick={() => void reopen()} disabled={busy}>
                  Reabrir ficha
                </button>
                {sessionExpired && (
                  <button type="button" className={s.secondary} onClick={onSessionExpired}>Entrar novamente</button>
                )}
              </div>
              {!canEdit && <p className={s.hint}>Seu perfil pode consultar a ficha. A gravação exige Secretaria.</p>}
            </form>

            <section className={s.locked} aria-label="Campos fora do contrato de gravação">
              <h3>Consulta — a API ainda não grava estes campos</h3>
              <p>
                O PATCH atual de pessoa aceita apenas menor, responsável legal e família.
                Nome, e-mail, situação, tipo e observações aparecem para leitura e não são simulados nem salvos neste navegador.
              </p>
              <div className={s.lockedGrid}>
                {UNSUPPORTED_PERSON_FIELDS.map((field) => (
                  <label key={field.key}>
                    {field.label}
                    <input value={unsupported[field.key]} readOnly aria-readonly="true" />
                  </label>
                ))}
              </div>
            </section>

            <section className={s.context} aria-label="Prontuário">
              <h3>Prontuário</h3>
              <dl>
                <div><dt>Foto</dt><dd>{person.photo?.hasStorageKey ? "Arquivo privado registrado. A imagem não é baixada aqui." : "Nenhuma foto registrada."}</dd></div>
                <div><dt>Vínculos</dt><dd>{dossier?.memberships.length ? dossier.memberships.map((item) => dossierLabel(item.status)).join(", ") : "—"}</dd></div>
                <div><dt>Pessoas na família</dt><dd>{dossier?.household ? dossier.household.members.map((item) => item.displayName).join(", ") : "—"}</dd></div>
                <div><dt>Dependentes</dt><dd>{dossier?.dependents.length ? dossier.dependents.map((item) => item.displayName).join(", ") : "—"}</dd></div>
              </dl>
              <h3>Admissões</h3>
              {dossier?.admissionHistory.length ? dossier.admissionHistory.map((item) => (
                <article key={item.id} className={s.history}>
                  <strong>{dossierLabel(item.status)}</strong>
                  <span>{dossierLabel(item.modality)} · {dossierLabel(item.currentStep)}</span>
                  <small>Atualizado em {formatWhen(item.updatedAt)}</small>
                </article>
              )) : <p className={s.hint}>Nenhuma admissão neste escopo.</p>}
            </section>
          </>
        )}

        {(state.loadMs !== null || state.saveMs !== null) && (
          <p className={s.timing}>
            {state.loadMs !== null && <span>Abertura da ficha: {Math.round(state.loadMs)} ms neste navegador. </span>}
            {state.saveMs !== null && <span>Salvar e reabrir: {Math.round(state.saveMs)} ms neste navegador.</span>}
          </p>
        )}
      </section>
    </div>,
    document.body
  );
}
