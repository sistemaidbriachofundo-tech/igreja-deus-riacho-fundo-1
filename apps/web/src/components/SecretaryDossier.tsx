"use client";

import { useEffect, useId, useReducer, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { usePersonaAccess } from "./AppShell";
import { PersonPicker } from "./PersonPicker";
import { apiGet, apiPatch } from "../lib/api";
import {
  Ficha360Dialog,
  type CredentialView,
} from "./secretaria/Ficha360Dialog";
import {
  fichaReducer,
  initialFichaState,
  loadAdmissionDocuments,
  loadPersonDossier,
  savePersonDossier,
  type AdmissionDocumentList,
  type DossierClient,
  type EditablePersonFields,
  type PersonRecord,
} from "./secretary-dossier";

type HouseholdOption = { id: string; label: string };

type Props = {
  token: string;
  personId: string;
  households: HouseholdOption[];
  canEdit: boolean;
  canReadDocuments: boolean;
  credential: CredentialView;
  onClose: () => void;
  onPersonSaved?: (person: PersonRecord) => void;
  onSessionExpired: () => void;
};

const client: DossierClient = { get: apiGet, patch: apiPatch };

export function SecretaryDossier({
  token,
  personId,
  households,
  canEdit,
  canReadDocuments,
  credential,
  onClose,
  onPersonSaved,
  onSessionExpired,
}: Props) {
  const titleId = useId();
  const { roles } = usePersonaAccess();
  const [state, dispatch] = useReducer(fichaReducer, initialFichaState);
  const [documents, setDocuments] = useState<AdmissionDocumentList[] | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    setDocuments(null);
    void loadPersonDossier(client, token, personId).then((result) => {
      if (cancelled) return;
      const elapsedMs = performance.now() - started;
      if (result.ok)
        dispatch({ type: "load-ok", data: result.data, elapsedMs });
      else dispatch({ type: "load-fail", failure: result.failure, elapsedMs });
    });
    return () => {
      cancelled = true;
    };
  }, [token, personId]);

  const admissionKey =
    state.dossier?.admissionHistory.map((item) => item.id).join("|") ?? "";

  useEffect(() => {
    if (!canReadDocuments || admissionKey.length === 0) {
      setDocuments(null);
      return;
    }
    let cancelled = false;
    void loadAdmissionDocuments(client, token, admissionKey.split("|")).then(
      (lists) => {
        if (!cancelled) setDocuments(lists);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [canReadDocuments, token, admissionKey]);

  async function reload(context: "after-save" | "manual", startedAt?: number) {
    const started = startedAt ?? performance.now();
    const result = await loadPersonDossier(client, token, personId);
    const elapsedMs = performance.now() - started;
    if (result.ok)
      dispatch({ type: "reopen-ok", data: result.data, elapsedMs, context });
    else
      dispatch({
        type: "reopen-fail",
        failure: result.failure,
        elapsedMs,
        context,
      });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.form || !state.baseline || !canEdit) return;
    const started = performance.now();
    dispatch({ type: "saving" });
    const saved = await savePersonDossier(
      client,
      token,
      personId,
      state.form,
      state.baseline,
      state.versions,
    );
    if (!saved.ok) {
      if ("unchanged" in saved) dispatch({ type: "save-unchanged" });
      else if (saved.partialPerson) {
        onPersonSaved?.(saved.partialPerson);
        dispatch({
          type: "save-partial",
          person: saved.partialPerson,
          failure: saved.failure,
        });
      } else dispatch({ type: "save-fail", failure: saved.failure });
      return;
    }
    if (saved.person) onPersonSaved?.(saved.person);
    dispatch({ type: "save-ok", person: saved.person });
    await reload("after-save", started);
  }

  const dirty =
    state.form &&
    state.baseline &&
    (state.form.displayName !== state.baseline.displayName ||
      state.form.email !== state.baseline.email ||
      state.form.notes !== state.baseline.notes ||
      state.form.isMinor !== state.baseline.isMinor ||
      state.form.legalGuardianPersonId !==
        state.baseline.legalGuardianPersonId ||
      state.form.householdId !== state.baseline.householdId);

  function requestClose() {
    if (state.phase === "saving" || state.phase === "reopening") return;
    if (
      dirty &&
      !window.confirm("Descartar as alterações que ainda não foram salvas?")
    )
      return;
    onClose();
  }

  async function reopen() {
    if (
      dirty &&
      !window.confirm(
        "Atualizar esta ficha e descartar as alterações que ainda não foram salvas?",
      )
    )
      return;
    dispatch({ type: "reopening" });
    await reload("manual");
  }

  const dialog = (
    <Ficha360Dialog
      titleId={titleId}
      state={state}
      households={households}
      canEdit={canEdit}
      canReadDocuments={canReadDocuments}
      credential={credential}
      documents={documents}
      guardianPicker={
        state.form && (
          <PersonPicker
            token={token}
            roles={roles}
            label="Responsável legal"
            value={state.form.legalGuardianPersonId}
            selectedPerson={state.dossier?.legalGuardian ?? undefined}
            onChange={(id) => {
              if (state.form)
                dispatch({
                  type: "edit",
                  form: { ...state.form, legalGuardianPersonId: id },
                });
            }}
            excludeIds={[personId]}
            adultsOnly
            required={state.form.isMinor}
            disabled={
              !canEdit ||
              state.phase === "saving" ||
              state.phase === "reopening"
            }
            help="Busque uma pessoa adulta já cadastrada na igreja."
          />
        )
      }
      onClose={requestClose}
      onEdit={(next: EditablePersonFields) =>
        dispatch({ type: "edit", form: next })
      }
      onSubmit={(event) => void onSubmit(event)}
      onReopen={() => void reopen()}
      onSessionExpired={onSessionExpired}
    />
  );

  if (typeof document !== "undefined")
    return createPortal(dialog, document.body);
  return dialog;
}

export function credentialFromMemberships(
  known: boolean,
  memberships: Array<{
    person: { id: string };
    activeCredentialId: string | null;
  }>,
  personId: string | null,
): CredentialView {
  if (!known || !personId) return { known: false };
  const match = memberships.find((item) => item.person.id === personId);
  return { known: true, activeCredentialId: match?.activeCredentialId ?? null };
}
