"use client";

import { useRef, useState, type FormEvent } from "react";
import { RosterCoverVacancy } from "./RosterCoverVacancy";
import { apiPatch, apiPost } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import type { FormalMember } from "../../lib/ministry-desk";
import { ROSTER_LOCATION_LABELS, ROSTER_SERVICE_TYPES, type RosterLocation, rosterPositionSummary, type EscalaAssignment, type EscalaModule, type EscalaModuleRules, type EscalaPosition, type MinistryEscala } from "../../lib/ministry-presentation";
import { assignmentStatusLabel } from "../../lib/serving-rosters";
import { UIIcon } from "../AppShell";
import { RosterPreviewPanel } from "../serving/RosterPreviewPanel";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import ui from "../ui/ui.module.css";
import s from "./roster-editor.module.css";

export type RosterActionsProps = {
  token: string;
  ministryId: string;
  members: FormalMember[];
  onRefresh: () => void;
  onRulesSaved?: (rules: EscalaModuleRules) => void;
  onOpen: (rosterId: string, moduleId?: string) => void;
  modules?: EscalaModule[];
  moduleId?: string;
  allowGeneral?: boolean;
  allowPublish?: boolean;
  requireModuleMembership?: boolean;
  managedModuleMemberships?: boolean;
  hideMembershipLinks?: boolean;
};

const churchDateTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function RosterEditor({ token, ministryId, onRefresh, onOpen, roster, modules = [], moduleId, allowGeneral = true, buttonClass }: RosterActionsProps & { roster?: MinistryEscala; buttonClass?: string }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { confirm, confirmation } = useActionConfirmation();
  const published = roster?.status === "PUBLISHED";
  const dateLocked = Boolean(roster?.assignedCount) && !published;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const title = String(fields.get("title") ?? "").trim();
    const localTime = String(fields.get("when") ?? "");
    const selectedModule = fields.get("moduleId");
    const serviceType = fields.get("serviceType");
    setBusy(true);
    setError("");
    try {
      const date = new Date(localTime + "-03:00");
      if (!dateLocked && !Number.isFinite(date.getTime())) throw new Error("Informe a data e a hora do culto.");
      const serviceAt = dateLocked && roster ? roster.serviceAt : date.toISOString();
      if (published && roster && new Date(serviceAt).getTime() !== new Date(roster.serviceAt).getTime() &&
          !(await confirm({ title: "Alterar o horário do culto?", subject: title,
            description: "Os voluntários receberão um aviso e precisarão confirmar presença novamente.", action: "Alterar horário" }))) return;
      const result = roster
        ? await apiPatch<{ id: string }>("/rosters/" + encodeURIComponent(roster.id), token, {
          title, serviceAt, ...(selectedModule !== null ? { moduleId: selectedModule || null } : {}),
        })
        : await apiPost<{ id: string }>("/rosters", token, {
          title, serviceAt, ministryId, ...(selectedModule ? { moduleId: selectedModule } : {}),
          ...(serviceType ? { serviceType } : {}),
        });
      setEditing(false);
      onOpen(result.id, typeof selectedModule === "string" ? selectedModule : undefined);
      onRefresh();
    } catch (error) {
      setError(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.editor}>
      {confirmation}
      <button type="button" className={buttonClass ?? (roster ? ui.workspaceSecondary : ui.workspacePrimary)} aria-expanded={editing} onClick={() => setEditing(value => !value)}>
        <UIIcon name="calendar" size={16} /> {roster ? "Editar culto" : "Nova escala"}
      </button>
      {editing && (
        <form className={s.form} onSubmit={save}>
          <label>Nome do culto<input name="title" defaultValue={roster?.title} maxLength={160} required /></label>
          <label>Data e hora de Brasília<input name="when" type="datetime-local" disabled={dateLocked} defaultValue={roster ? churchDateTime.format(new Date(roster.serviceAt)).replace(" ", "T") : ""} required /></label>
          {modules.length > 0 && !published && (
            <label>Módulo<select name="moduleId" required={!allowGeneral} defaultValue={(roster ? roster.moduleId : moduleId) ?? ""}>
              {allowGeneral && <option value="">Escala geral do ministério</option>}
              {modules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}
            </select></label>
          )}
          {!roster && modules.length > 0 && <label>Tipo de culto<select name="serviceType">
            <option value="">Identificar pelo dia e horário</option>
            {Object.entries(ROSTER_SERVICE_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>}
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
  const [notice, setNotice] = useState("");
  const [covering, setCovering] = useState("");
  const base = "/rosters/" + encodeURIComponent(roster.id);
  const draft = roster.status === "DRAFT";
  const open = draft || roster.status === "PUBLISHED";
  const rules = props.modules?.find(module => module.id === roster.moduleId)?.rules;
  const summary = rosterPositionSummary(roster.positions ?? []);

  async function mutate(path: string, data?: unknown, method: "POST" | "PATCH" = "POST", success = "Escala atualizada.") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (method === "PATCH") await apiPatch(path, token, data);
      else await apiPost(path, token, data);
      setNotice(success);
      onRefresh();
    } catch (error) {
      setError(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  function savePosition(event: FormEvent<HTMLFormElement>, position?: EscalaPosition) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const roleLabel = String(fields.get("roleLabel") ?? "").trim();
    const path = base + "/slots" + (position ? "/" + encodeURIComponent(position.id) : "");
    const requiresCouple = fields.has("requiresCouple");
    void mutate(path, { roleLabel, ...(position ? {} : { requiresCouple }) }, position ? "PATCH" : "POST");
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
    void mutate(path, { personId, ...(partnerPersonId ? { partnerPersonId } : {}) }, "POST",
      assignment ? "Substituição registrada. Aguardando a confirmação de quem vai assumir." : "Pessoa escalada. Aguardando confirmação.");
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
      {notice && <p className={s.success} role="status">{notice}</p>}
      {open && new Date(roster.serviceAt).getTime() > Date.now() && <RosterEditor {...props} />}
      {draft && roster.capacity && <CapacityEditor
        key={roster.capacity.map(group => `${group.id}:${group.count}`).join("|")}
        groups={roster.capacity} busy={busy} onSave={groups => void mutate(base + "/capacity", { groups }, "PATCH", "Quantidade atualizada neste culto.")} />}
      {roster.moduleId && !members.length && <p className={s.vacancy}>Cadastre integrantes neste módulo para preencher as vagas.</p>}
      {Boolean(roster.positions?.length) && <dl className={s.counts} aria-label="Cobertura do culto">
        <div><dt>Vagas abertas</dt><dd>{summary.open}</dd></div>
        <div><dt>A confirmar</dt><dd>{summary.pending}</dd></div>
        <div><dt>Confirmadas</dt><dd>{summary.confirmed}</dd></div>
      </dl>}
      {open && Boolean(roster.positions?.length) && <details className={s.previewTools}>
        <summary>Preencher escala com sugestões</summary>
        <RosterPreviewPanel key={roster.id} token={token} rosterId={roster.id} onApplied={draft ? onRefresh : undefined} />
      </details>}
      {roster.positions?.map(position => {
        const current = position.assignments.filter(item => item.status === "PENDING" || item.status === "CONFIRMED");
        const declined = position.assignments.filter(item => item.status === "DECLINED");
        const latestDecline = declined.reduce<EscalaAssignment | undefined>((latest, item) =>
          !latest || (item.declinedAt ?? "") >= (latest.declinedAt ?? "") ? item : latest, undefined);
        const replacing = !current.length ? latestDecline : undefined;
        const eligible = members.filter(member => !position.requiredQualification ||
          rules?.qualifications[position.requiredQualification]?.includes(member.personId));
        const listed = [...current, ...position.assignments.filter(item => !current.includes(item))];
        const coverable = roster.status === "PUBLISHED" && Boolean(roster.moduleId) && !current.length && Date.parse(roster.serviceAt) > Date.now();
        const manualForm = <PersonForm members={eligible.filter(member => member.personId !== replacing?.personId)}
          busy={busy} couple={position.requiresCouple} pairs={roster.moduleId ? rules?.couples ?? [] : undefined}
          label={replacing ? "Salvar substituição" : "Escalar"} onSubmit={event => savePerson(event, position, replacing)} />;
        return (
        <section className={s.position} key={position.id} id={`posto-${position.id}`} tabIndex={-1} aria-label={position.label}>
          <header className={s.positionHeading}>
            <h4>{position.label}</h4>
            {(position.requiresCouple || position.requiredQualification) && <span>
              {[position.requiresCouple && "Casal", position.requiredQualification === "diaconia"
                ? "Diaconia" : position.requiredQualification].filter(Boolean).join(" · ")}
            </span>}
          </header>
          <div className={s.location}>{Object.entries(ROSTER_LOCATION_LABELS).map(([field, label]) => {
            const value = position[field as keyof RosterLocation];
            return value && <span key={field}>{label} <strong>{value}</strong></span>;
          })}</div>
          {draft && <details><summary>Editar posição</summary><form className={s.form} onSubmit={event => savePosition(event, position)}>
            <label>Nome da posição<input name="roleLabel" defaultValue={position.label} maxLength={100} required /></label>
            <button className={ui.workspaceSecondary} type="submit" disabled={busy}>Salvar posição</button>
          </form></details>}
          {listed.map(assignment => (
            <div key={assignment.id} className={s.person}>
              <div><strong>{names.get(assignment.personId) ?? (assignment.personName || "Integrante escalado")}</strong>
                {assignment.personResponseStatus && <small>{assignmentStatusLabel[assignment.personResponseStatus]}</small>}
                {assignment.partnerPersonId && <span className={s.partner}>
                  <strong>{names.get(assignment.partnerPersonId) ?? (assignment.partnerName || "Parceiro escalado")}</strong>
                  {assignment.partnerResponseStatus && <small>{assignmentStatusLabel[assignment.partnerResponseStatus]}</small>}
                </span>}
                {assignment.declinedAt && assignment.status === "SUBSTITUTED" && <small>Recusou antes da substituição</small>}
                {assignment.substituteForId && <small>Substituição</small>}
              </div>
              <span className={s.assignmentStatus} data-status={assignment.status}>{assignmentStatusLabel[assignment.status]}</span>
              {open && (current.includes(assignment) || !coverable && replacing?.id === assignment.id) && eligible.some(member => member.personId !== assignment.personId) && <details id={current[0]?.id === assignment.id ? `trocar-${position.id}` : undefined} tabIndex={-1}>
                <summary>{assignment.status === "DECLINED" ? "Escalar substituto" : "Substituir"}</summary>
                <PersonForm members={eligible.filter(member => member.personId !== assignment.personId)} busy={busy} couple={position.requiresCouple}
                  pairs={roster.moduleId ? rules?.couples ?? [] : undefined}
                  label="Salvar substituição" onSubmit={event => savePerson(event, position, assignment)} />
              </details>}
            </div>
          ))}
          {!current.length && <p className={s.vacancy}>{replacing ? "Vaga aberta após recusa" : "Vaga aberta"}</p>}
          {coverable && <button type="button" className={ui.workspaceSecondary} aria-expanded={covering === position.id}
            onClick={() => setCovering(value => value === position.id ? "" : position.id)}>Cobrir vaga</button>}
          {coverable && covering === position.id && <RosterCoverVacancy key={position.id} slotId={position.id}
            requiresCouple={position.requiresCouple} previousId={replacing?.id} token={token} serviceAt={roster.serviceAt}
            onRefresh={onRefresh} manualForm={manualForm} />}
          {open && !current.length && !replacing && !coverable && manualForm}
        </section>
      ); })}
      {draft && !roster.capacity && (
        <form className={s.form} onSubmit={savePosition}>
          <label>Nova posição<input name="roleLabel" placeholder="Ex. Recepção" maxLength={100} required /></label>
          <label className={s.checkbox}><input type="checkbox" name="requiresCouple" /> Posição para casal</label>
          <button className={ui.workspaceSecondary} type="submit" disabled={busy}>Adicionar posição</button>
        </form>
      )}
      {props.allowPublish !== false && draft && Boolean(roster.positions?.length) && <button type="button" className={ui.workspacePrimary} disabled={busy} onClick={() => void publish()}>Publicar escala</button>}
      {error && <p className={s.error} role="alert">{error}</p>}
    </div>
  );
}

function CapacityEditor({ groups, busy, onSave }: {
  groups: NonNullable<MinistryEscala["capacity"]>;
  busy: boolean;
  onSave: (groups: { id: string; count: number }[]) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  return <details className={s.previewTools}>
    <summary>Ajustar quantidade deste culto</summary>
    <form ref={form} className={s.form} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      onSave(groups.map(group => ({ id: group.id, count: Number(data.get(group.id)) })));
    }}>
      {groups.map(group => <label key={group.id}>{group.label}
        <small>Padrão {group.defaultCount} · mínimo atual {group.minimumCount}</small>
        <input name={group.id} type="number" min={group.minimumCount} step={1} defaultValue={group.count} required />
      </label>)}
      <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => {
        for (const group of groups) {
          const field = form.current?.elements.namedItem(group.id);
          if (field instanceof HTMLInputElement) field.value = String(Math.max(group.minimumCount, group.defaultCount));
        }
      }}>Restaurar padrão</button>
      <button type="submit" className={ui.workspacePrimary} disabled={busy}>{busy ? "Salvando…" : "Salvar quantidade"}</button>
    </form>
  </details>;
}

function PersonForm({ members, busy, couple, pairs, label, onSubmit }: {
  members: FormalMember[]; busy: boolean; couple: boolean; pairs?: [string, string][]; label: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [person, setPerson] = useState("");
  if (couple && pairs) return <CoupleForm members={members} busy={busy} pairs={pairs} label={label} onSubmit={onSubmit} />;

  const people = members;
  const partners = person ? people.filter(member => member.personId !== person) : [];
  if (!people.length) return <p className={s.vacancy}>Nenhum {couple ? "casal elegível" : "integrante elegível"} disponível para esta posição.</p>;
  return (
    <form className={s.form} onSubmit={onSubmit}>
      <label>Integrante<select name="personId" value={person} onChange={event => setPerson(event.target.value)} required>
        <option value="">Selecionar</option>{people.map(member => <option key={member.personId} value={member.personId}>{member.displayName}</option>)}
      </select></label>
      {couple && <label>Par<select key={person} name="partnerPersonId" required disabled={!person}>
        <option value="">Selecionar</option>{partners.map(member => <option key={member.personId} value={member.personId}>{member.displayName}</option>)}
      </select></label>}
      <button type="submit" className={ui.workspaceSecondary} disabled={busy || !person || (couple && !partners.length)}>{label}</button>
    </form>
  );
}

function CoupleForm({ members, busy, pairs, label, onSubmit }: {
  members: FormalMember[]; busy: boolean; pairs: [string, string][]; label: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [selected, setSelected] = useState("");
  const names = new Map(members.map(member => [member.personId, member.displayName]));
  const eligible = pairs.filter(pair => pair.every(id => names.has(id)));
  const selectedPair = eligible.find(([first]) => first === selected);
  if (!eligible.length) return <p className={s.vacancy}>Nenhum casal elegível disponível para esta vaga.</p>;
  return <form className={s.form} onSubmit={onSubmit}>
    <label>Casal<select name="personId" value={selectedPair?.[0] ?? ""} onChange={event => setSelected(event.target.value)} required>
      <option value="">Selecionar casal</option>
      {eligible.map(([first, second]) => <option value={first} key={first}>{names.get(first)} e {names.get(second)}</option>)}
    </select></label>
    <input type="hidden" name="partnerPersonId" value={selectedPair?.[1] ?? ""} />
    <button type="submit" className={ui.workspaceSecondary} disabled={busy || !selectedPair}>{label}</button>
  </form>;
}
