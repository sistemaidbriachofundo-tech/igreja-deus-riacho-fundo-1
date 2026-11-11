"use client";

import { useState, type FormEvent } from "react";
import { apiPatch, apiPost } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import type { FormalMember } from "../../lib/ministry-desk";
import type { EscalaAssignment, EscalaPosition, MinistryEscala } from "../../lib/ministry-presentation";
import { UIIcon } from "../AppShell";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import ui from "../ui/ui.module.css";
import s from "./roster-editor.module.css";

export type RosterActionsProps = {
  token: string;
  ministryId: string;
  members: FormalMember[];
  onRefresh: () => void;
  onOpen: (rosterId: string) => void;
};

const churchDateTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function RosterEditor({ token, ministryId, onRefresh, onOpen, roster }: RosterActionsProps & { roster?: MinistryEscala }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasAssignments = Boolean(roster?.assignedCount);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const title = String(fields.get("title") ?? "").trim();
    const localTime = String(fields.get("when") ?? "");
    setBusy(true);
    setError("");
    try {
      const date = new Date(localTime + "-03:00");
      if (!hasAssignments && !Number.isFinite(date.getTime())) throw new Error("Informe a data e a hora do culto.");
      const serviceAt = hasAssignments && roster ? roster.serviceAt : date.toISOString();
      const result = roster
        ? await apiPatch<{ id: string }>("/rosters/" + encodeURIComponent(roster.id), token, { title, serviceAt })
        : await apiPost<{ id: string }>("/rosters", token, { title, serviceAt, ministryId });
      setEditing(false);
      onOpen(result.id);
      onRefresh();
    } catch (error) {
      setError(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.editor}>
      <button type="button" className={roster ? ui.workspaceSecondary : ui.workspacePrimary} aria-expanded={editing} onClick={() => setEditing(value => !value)}>
        <UIIcon name="calendar" size={16} /> {roster ? "Editar culto" : "Nova escala"}
      </button>
      {editing && (
        <form className={s.form} onSubmit={save}>
          <label>Nome do culto<input name="title" defaultValue={roster?.title} maxLength={160} required /></label>
          <label>Data e hora de Brasília<input name="when" type="datetime-local" disabled={hasAssignments} defaultValue={roster ? churchDateTime.format(new Date(roster.serviceAt)).replace(" ", "T") : ""} required /></label>
          <button className={ui.workspacePrimary} type="submit" disabled={busy}>{busy ? "Salvando…" : roster ? "Salvar alterações" : "Criar escala"}</button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}

export function RosterActions(props: RosterActionsProps & { roster: MinistryEscala }) {
  const { roster, members, token, onRefresh } = props;
  const { confirm, confirmation } = useActionConfirmation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = "/rosters/" + encodeURIComponent(roster.id);
  const draft = roster.status === "DRAFT";
  const open = draft || roster.status === "PUBLISHED";

  async function mutate(path: string, data?: unknown, method: "POST" | "PATCH" = "POST") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (method === "PATCH") await apiPatch(path, token, data);
      else await apiPost(path, token, data);
      onRefresh();
    } catch (error) {
      setError(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  function savePosition(event: FormEvent<HTMLFormElement>, position?: EscalaPosition) {
    event.preventDefault();
    const roleLabel = String(new FormData(event.currentTarget).get("roleLabel") ?? "").trim();
    const path = base + "/slots" + (position ? "/" + encodeURIComponent(position.id) : "");
    void mutate(path, { roleLabel }, position ? "PATCH" : "POST");
  }

  function savePerson(event: FormEvent<HTMLFormElement>, position: EscalaPosition, assignment?: EscalaAssignment) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const personId = String(fields.get("personId") ?? "");
    const partnerPersonId = String(fields.get("partnerPersonId") ?? "");
    if (!personId) return;
    const path = assignment
      ? "/rosters/assignments/" + encodeURIComponent(assignment.id) + "/substitute"
      : "/rosters/slots/" + encodeURIComponent(position.id) + "/assign";
    void mutate(path, { personId, ...(partnerPersonId ? { partnerPersonId } : {}) });
  }

  async function publish() {
    if (await confirm({ title: "Publicar escala?", subject: roster.title, description: "A escala ficará disponível para as pessoas escaladas consultarem.", action: "Publicar escala" })) {
      await mutate(base + "/publish");
    }
  }

  const names = new Map(members.map(member => [member.personId, member.displayName]));
  return (
    <div className={s.editor}>
      {confirmation}
      {draft && <RosterEditor {...props} />}
      {roster.positions?.map(position => (
        <section className={s.position} key={position.id} aria-label={position.label}>
          <h4>{position.label}</h4>
          {draft && <details><summary>Renomear posição</summary><form className={s.form} onSubmit={event => savePosition(event, position)}>
            <label>Nome da posição<input name="roleLabel" defaultValue={position.label} maxLength={100} required /></label>
            <button className={ui.workspaceSecondary} type="submit" disabled={busy}>Salvar posição</button>
          </form></details>}
          {position.assignments.map(assignment => (
            <div key={assignment.id} className={s.person}>
              <div><strong>{names.get(assignment.personId) ?? (assignment.personName || "Integrante escalado")}</strong>
                {assignment.partnerPersonId && <span> · {names.get(assignment.partnerPersonId) ?? (assignment.partnerName || "Parceiro escalado")}</span>}
                <small>{assignment.status === "CONFIRMED" ? "Confirmado" : "Aguardando confirmação"}</small>
              </div>
              {open && members.length > 0 && <details><summary>Substituir</summary>
                <PersonForm members={members.filter(member => member.personId !== assignment.personId)} busy={busy} couple={position.requiresCouple} label="Salvar substituição" onSubmit={event => savePerson(event, position, assignment)} />
              </details>}
            </div>
          ))}
          {!position.assignments.length && <p>Posição livre</p>}
          {open && !position.assignments.length && members.length > 0 && (
            <PersonForm members={members} busy={busy} couple={position.requiresCouple} label="Escalar" onSubmit={event => savePerson(event, position)} />
          )}
        </section>
      ))}
      {draft && (
        <form className={s.form} onSubmit={savePosition}>
          <label>Nova posição<input name="roleLabel" placeholder="Ex. Recepção" maxLength={100} required /></label>
          <button className={ui.workspaceSecondary} type="submit" disabled={busy}>Adicionar posição</button>
        </form>
      )}
      {draft && Boolean(roster.positions?.length) && <button type="button" className={ui.workspacePrimary} disabled={busy} onClick={() => void publish()}>Publicar escala</button>}
      {error && <p className={s.error} role="alert">{error}</p>}
    </div>
  );
}

function PersonForm({ members, busy, couple, label, onSubmit }: {
  members: FormalMember[]; busy: boolean; couple: boolean; label: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className={s.form} onSubmit={onSubmit}>
      <label>Integrante<select name="personId" required><option value="">Selecionar</option>{members.map(member => <option key={member.personId} value={member.personId}>{member.displayName}</option>)}</select></label>
      {couple && <label>Parceiro<select name="partnerPersonId" required><option value="">Selecionar</option>{members.map(member => <option key={member.personId} value={member.personId}>{member.displayName}</option>)}</select></label>}
      <button type="submit" className={ui.workspaceSecondary} disabled={busy || !members.length}>{label}</button>
    </form>
  );
}
