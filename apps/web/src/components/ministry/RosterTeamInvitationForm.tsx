"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { apiPost } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { rosterInvitePath, rosterRouteUnavailable } from "../../lib/roster-invitations";
import { rosterModuleContains, type EscalaModule } from "../../lib/ministry-presentation";
import { PersonPicker, canSearchPersons } from "../PersonPicker";
import ui from "../ui/ui.module.css";
import styles from "../ministry-membership-catalog.module.css";

export function RosterTeamInvitationForm({ token, roles, ministryId, modules, initialModuleId, onClose, onSent }: {
  token: string;
  roles: readonly string[];
  ministryId: string;
  modules: readonly EscalaModule[];
  initialModuleId?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [moduleId, setModuleId] = useState(initialModuleId ?? (modules.length === 1 ? modules[0].id : ""));
  const [personId, setPersonId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const team = modules.find(item => item.id === moduleId);
  const excluded = team?.rules?.volunteerIds ?? [];

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!team || !personId || saving || rosterModuleContains(team, personId)) return;
    setSaving(true);
    setError("");
    try {
      await apiPost(rosterInvitePath(ministryId), token, { personId, moduleId });
      onSent();
    } catch (failure) {
      setError(rosterRouteUnavailable(failure) ? "O envio de convites para equipes ainda não está disponível nesta API." : dasError(failure));
      setSaving(false);
    }
  }

  return <dialog ref={dialog} aria-labelledby={titleId} className={styles.teamDrawer}
    onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <header><h2 id={titleId}>Convidar voluntário</h2><button type="button" className={ui.workspaceSecondary}
      disabled={saving} onClick={onClose}>Fechar</button></header>
    <form onSubmit={submit}>
      <label>Equipe<select value={moduleId} disabled={saving} required onChange={event => { setModuleId(event.target.value); setPersonId(""); }}>
        <option value="">Selecione uma equipe</option>
        {modules.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <PersonPicker key={moduleId} token={token} roles={roles} label="Pessoa para convidar"
        value={personId} onChange={setPersonId} required disabled={!team || saving}
        searchPath={!canSearchPersons(roles) && team ? `/ministries/${encodeURIComponent(ministryId)}/roster-modules/${encodeURIComponent(team.id)}/invitation-people` : undefined}
        excludeIds={excluded} />
      <p>A pessoa recebe o convite em Meu Espaço. A resposta aparece em Integrantes.</p>
      {error && <p role="alert" className={styles.invitationError}>{error}</p>}
      <footer><button type="submit" className={styles.invitePrimary} disabled={!team || !personId || saving}>
        {saving ? "Enviando…" : "Enviar convite"}
      </button></footer>
    </form>
  </dialog>;
}
