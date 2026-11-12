"use client";

import { useState, type FormEvent } from "react";
import { PersonPicker, canSearchPersons } from "../PersonPicker";
import { RosterPreviewPanel } from "./RosterPreviewPanel";
import { formatChurchDate } from "../../lib/das-operations";
import {
  assignmentStatusLabel,
  blocksForRoster,
  canConfirmAssignment,
  canSubstituteAssignment,
  isRosterLead,
  otherRosterTitles,
  rosterStatusLabel,
  type MinistryView,
  type RosterView,
  type ServingSurfaceId,
  type SimultaneousBlock,
} from "../../lib/serving-rosters";
import styles from "./serving.module.css";

type Props = {
  surface: ServingSurfaceId;
  ministry: MinistryView | null;
  rosters: RosterView[];
  blocks: SimultaneousBlock[];
  roles: readonly string[];
  actorPersonId: string;
  token: string;
  busy: boolean;
  notice: string;
  onCreate: (input: { title: string; serviceAtLocal: string }) => void;
  onAddSlot: (rosterId: string, roleLabel: string, requiresCouple: boolean) => void;
  onAssign: (slotId: string, personId: string, partnerPersonId: string) => void;
  onConfirm: (assignmentId: string) => void;
  onDecline: (assignmentId: string) => void;
  onSubstitute: (assignmentId: string, personId: string) => void;
  onPublish: (rosterId: string) => void;
  onClose: (rosterId: string) => void;
};

export function MinistryRosterDesk({
  surface,
  ministry,
  rosters,
  blocks,
  roles,
  actorPersonId,
  token,
  busy,
  notice,
  onCreate,
  onAddSlot,
  onAssign,
  onConfirm,
  onDecline,
  onSubstitute,
  onPublish,
  onClose,
}: Props) {
  const lead = isRosterLead(roles);
  const [title, setTitle] = useState("");
  const [serviceAtLocal, setServiceAtLocal] = useState("");
  const [roleDraft, setRoleDraft] = useState<Record<string, { label: string; couple: boolean }>>({});
  const [assignDraft, setAssignDraft] = useState<Record<string, { personId: string; partnerPersonId: string }>>({});
  const [replacement, setReplacement] = useState<Record<string, string>>({});

  if (!ministry) {
    return (
      <section className={styles.blocked} role="status" data-blocked="ministry">
        <h2>Ministério ainda não disponível nesta conta</h2>
        <p>Se você faz parte da equipe, peça à Secretaria para verificar seu acesso.</p>
      </section>
    );
  }

  function createRoster(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead || title.trim().length < 1 || !serviceAtLocal) return;
    onCreate({ title: title.trim(), serviceAtLocal });
  }

  return (
    <div data-surface={surface}>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      <section className={styles.card}>
        <h2>{ministry.name}</h2>
        {ministry.scheduleText && (
          <p>{ministry.scheduleText}</p>
        )}
        {surface === "louvor" && (
          <p className={styles.footnote} data-blocked="rehearsal">
            O calendário de ensaios ainda está indisponível.
          </p>
        )}
      </section>

      {rosters.length === 0 ? (
        <p className={styles.card} role="status">
          Nenhuma escala cadastrada para este ministério.
        </p>
      ) : (
        <div className={styles.schedule}>
          {rosters.map((roster) => {
            const rosterBlocks = blocksForRoster(blocks, roster.id);
            return (
              <article className={styles.roster} key={roster.id}>
                <div className={styles.rosterHeader}>
                  <div>
                    <h3>{roster.title}</h3>
                    <p className={styles.footnote}>{formatChurchDate(roster.serviceAt)}</p>
                  </div>
                  <span className={styles.badge}>{rosterStatusLabel[roster.status]}</span>
                </div>
                {lead && roster.status !== "CLOSED" && roster.slots.length > 0 && <RosterPreviewPanel token={token} rosterId={roster.id} />}
                {roster.slots.map((slot) => (
                  <section className={styles.slot} key={slot.id}>
                    <div className={styles.slotHeader}>
                      <strong>{slot.roleLabel}</strong>
                      {slot.requiresCouple && <span className={styles.badge}>Exige casal</span>}
                    </div>
                    {slot.assignments.length === 0 && (
                      <p className={styles.footnote}>Nenhuma pessoa designada nesta função.</p>
                    )}
                    {slot.assignments.map((assignment) => {
                      const block = rosterBlocks.find(
                        (item) =>
                          item.personId === assignment.personId ||
                          item.personId === assignment.partnerPersonId,
                      );
                      const active =
                        assignment.status === "PENDING" || assignment.status === "CONFIRMED";
                      const showConflict = Boolean(block && active);
                      const others = block ? otherRosterTitles(block, roster.id) : [];
                      const canAnswer = canConfirmAssignment(
                        roles,
                        actorPersonId,
                        assignment.personId,
                      );
                      return (
                        <div
                          className={styles.assignment}
                          key={assignment.id}
                          data-conflict={showConflict ? "true" : "false"}
                        >
                          <span className={styles.person}>
                            {assignment.personName ?? "Pessoa escalada"}
                            {assignment.partnerPersonId
                              ? ` · ${assignment.partnerName ?? "Par na escala"}`
                              : ""}
                          </span>
                          <span className={styles.badge}>{assignmentStatusLabel[assignment.status]}</span>
                          {showConflict && (
                            <p className={styles.conflict} role="status">
                              {block?.internal
                                ? "Esta pessoa ocupa mais de uma posição neste dia."
                                : `Esta pessoa já está em outra posição neste dia${others.length ? `: ${others.join(", ")}` : ""}.`}
                            </p>
                          )}
                          {assignment.status === "PENDING" && canAnswer && (
                            <div className={styles.actions}>
                              <button type="button" className={styles.primary} disabled={busy} onClick={() => onConfirm(assignment.id)}>
                                Confirmar
                              </button>
                              <button type="button" className={styles.danger} disabled={busy} onClick={() => onDecline(assignment.id)}>
                                Recusar
                              </button>
                            </div>
                          )}
                          {canSubstituteAssignment(roles) &&
                            assignment.status !== "SUBSTITUTED" &&
                            roster.status !== "CLOSED" && (
                              <form
                                className={styles.form}
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const next = (replacement[assignment.id] ?? "").trim();
                                  if (!next) return;
                                  onSubstitute(assignment.id, next);
                                }}
                              >
                                <PersonField
                                  token={token}
                                  roles={roles}
                                  label="Pessoa substituta"
                                  value={replacement[assignment.id] ?? ""}
                                  onChange={(next) =>
                                    setReplacement((current) => ({
                                      ...current,
                                      [assignment.id]: next,
                                    }))
                                  }
                                />
                                <button type="submit" className={styles.ghost} disabled={busy}>
                                  Pedir substituição
                                </button>
                              </form>
                            )}
                        </div>
                      );
                    })}
                    {lead && roster.status !== "CLOSED" && (
                      <form
                        className={styles.form}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const draft = assignDraft[slot.id] ?? { personId: "", partnerPersonId: "" };
                          if (!draft.personId.trim()) return;
                          onAssign(slot.id, draft.personId.trim(), draft.partnerPersonId.trim());
                          setAssignDraft((current) => ({
                            ...current,
                            [slot.id]: { personId: "", partnerPersonId: "" },
                          }));
                        }}
                      >
                        <PersonField
                          token={token}
                          roles={roles}
                          label="Designar pessoa nesta função"
                          value={assignDraft[slot.id]?.personId ?? ""}
                          onChange={(next) =>
                            setAssignDraft((current) => ({
                              ...current,
                              [slot.id]: {
                                personId: next,
                                partnerPersonId: current[slot.id]?.partnerPersonId ?? "",
                              },
                            }))
                          }
                        />
                        {slot.requiresCouple && (
                          <PersonField
                            token={token}
                            roles={roles}
                            label="Par, se a regra exigir"
                            value={assignDraft[slot.id]?.partnerPersonId ?? ""}
                            onChange={(next) =>
                              setAssignDraft((current) => ({
                                ...current,
                                [slot.id]: {
                                  personId: current[slot.id]?.personId ?? "",
                                  partnerPersonId: next,
                                },
                              }))
                            }
                          />
                        )}
                        <button
                          type="submit"
                          className={styles.primary}
                          disabled={busy || !(assignDraft[slot.id]?.personId ?? "").trim()}
                        >
                          Designar
                        </button>
                      </form>
                    )}
                  </section>
                ))}
                {lead && roster.status === "DRAFT" && (
                  <form
                    className={styles.form}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const draft = roleDraft[roster.id] ?? { label: "", couple: false };
                      if (draft.label.trim().length < 1) return;
                      onAddSlot(roster.id, draft.label.trim(), draft.couple);
                      setRoleDraft((current) => ({
                        ...current,
                        [roster.id]: { label: "", couple: false },
                      }));
                    }}
                  >
                    <h3>Nova função neste horário</h3>
                    <label className={styles.form}>
                      Nome da função
                      <input
                        className={styles.field}
                        value={roleDraft[roster.id]?.label ?? ""}
                        onChange={(event) =>
                          setRoleDraft((current) => ({
                            ...current,
                            [roster.id]: {
                              label: event.target.value,
                              couple: current[roster.id]?.couple ?? false,
                            },
                          }))
                        }
                        required
                        maxLength={80}
                      />
                    </label>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={roleDraft[roster.id]?.couple ?? false}
                        onChange={(event) =>
                          setRoleDraft((current) => ({
                            ...current,
                            [roster.id]: {
                              label: current[roster.id]?.label ?? "",
                              couple: event.target.checked,
                            },
                          }))
                        }
                      />
                      Posição para casal
                    </label>
                    <button
                      type="submit"
                      className={styles.primary}
                      disabled={busy || (roleDraft[roster.id]?.label ?? "").trim().length < 1}
                    >
                      Adicionar função
                    </button>
                  </form>
                )}
                {lead && (
                  <div className={styles.actions}>
                    {roster.status === "DRAFT" && roster.slots.length > 0 && (
                      <button type="button" className={styles.primary} disabled={busy} onClick={() => onPublish(roster.id)}>
                        Publicar escala
                      </button>
                    )}
                    {roster.status === "PUBLISHED" && (
                      <button type="button" className={styles.ghost} disabled={busy} onClick={() => onClose(roster.id)}>
                        Fechar escala
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {lead && (
        <form className={`${styles.card} ${styles.form}`} onSubmit={createRoster}>
          <h2>Nova escala</h2>
          <div className={styles.formGrid}>
            <label>
              Título
              <input className={styles.field} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={140} />
            </label>
            <label>
              Data e horário
              <input
                className={styles.field}
                type="datetime-local"
                value={serviceAtLocal}
                onChange={(event) => setServiceAtLocal(event.target.value)}
                required
              />
            </label>
            <button type="submit" className={styles.primary} disabled={busy}>
              Registrar escala
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function PersonField({
  token,
  roles,
  label,
  value,
  onChange,
}: {
  token: string;
  roles: readonly string[];
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  if (canSearchPersons(roles)) {
    return (
      <PersonPicker
        token={token}
        roles={roles}
        label={label}
        value={value}
        onChange={onChange}
      />
    );
  }
  return (
    <label className={styles.form}>
      {label}
      <input
        className={styles.field}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Identificador sintético da pessoa"
        autoComplete="off"
      />
    </label>
  );
}
