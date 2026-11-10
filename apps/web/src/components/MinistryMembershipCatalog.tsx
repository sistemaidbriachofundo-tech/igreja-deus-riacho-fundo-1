"use client";

import { useState } from "react";
import type {
  ConversionResult,
  DeskReady,
  FormalRole,
  InterestRow,
  MembershipChange,
} from "../lib/ministry-desk";
import {
  activeFormalMembers,
  humanWriteNotice,
  interestStageLabel,
  memberStatusLabel,
  roleLabel,
  visibleSchedule,
} from "../lib/ministry-view";
import { SyntheticAvatar } from "./ministry/ministry-visuals";
import styles from "./ministry-membership-catalog.module.css";

type Props = {
  desk: DeskReady;
  conversion: ConversionResult | null;
  convertingId: string | null;
  change: MembershipChange | null;
  pending: boolean;
  onConvert: (interestId: string) => void;
  onAdmit: (personId: string, role: FormalRole) => void;
  onEnd: (membershipId: string) => void;
};

export function MinistryMembershipCatalog({
  desk,
  conversion,
  convertingId,
  change,
  pending,
  onConvert,
  onAdmit,
  onEnd,
}: Props) {
  const members = desk.membership.kind === "ready" ? desk.membership.members : [];
  const active = activeFormalMembers(members);
  const schedule = visibleSchedule(desk);
  const canWrite = desk.membership.kind === "ready";

  return (
    <div className={styles.columns}>
      <section className={styles.panel} data-region="formal-members" aria-labelledby="formal-members-title">
        <h2 id="formal-members-title">Equipe formal</h2>
        <p>Somente pessoas com vínculo gravado neste ministério. Interesse de voluntariado não entra aqui.</p>
        {schedule ? <p className={styles.schedule}>Encontro habitual: {schedule}</p> : null}
        {canWrite ? (
          <>
            {active.length === 0 ? (
              <div className={styles.invite} data-region="invite">
                <strong>Nenhum integrante formal</strong>
                <p>Convide uma pessoa que já tenha cadastro. A lista continua vazia até o vínculo ser gravado.</p>
              </div>
            ) : null}
            {members.length > 0 ? (
              <div className={styles.people}>
                {members.map((member) => (
                  <div className={styles.row} key={member.id}>
                    <SyntheticAvatar name={member.displayName} />
                    <div>
                      <strong>{member.displayName}</strong>
                      <small>
                        {roleLabel(member.role)} · {memberStatusLabel(member.status)}
                      </small>
                    </div>
                    {member.status === "ENCERRADO" ? (
                      <span className={styles.tag}>Encerrado</span>
                    ) : (
                      <button type="button" disabled={pending} onClick={() => onEnd(member.id)}>
                        {pending ? "Registrando…" : "Encerrar vínculo"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            <AdmitForm pending={pending} onAdmit={onAdmit} />
          </>
        ) : (
          <p className={styles.schedule}>Inclusão e remoção permanecem indisponíveis.</p>
        )}
        {change ? (
          <div className={change.applied ? styles.schedule : styles.blocked} role="status">
            <strong>{change.applied ? "Alteração registrada" : "Convite não registrado"}</strong>
            <p>{humanWriteNotice(change.code, change.applied, change.message)}</p>
          </div>
        ) : null}
      </section>

      <section className={styles.panel} data-region="volunteer-interests" aria-labelledby="interests-title">
        <h2 id="interests-title">Interesses de voluntariado</h2>
        <p>{desk.interestsMessage}</p>
        {desk.interests.length === 0 ? (
          <p className={styles.schedule}>Nenhum interesse neste ministério.</p>
        ) : (
          <div className={styles.people}>
            {desk.interests.map((interest) => (
              <InterestLine
                key={interest.id}
                interest={interest}
                busy={convertingId === interest.id}
                canConvert={canWrite}
                onConvert={onConvert}
              />
            ))}
          </div>
        )}
        {conversion ? (
          <div className={conversion.created ? styles.schedule : styles.blocked} role="status">
            <strong>{conversion.created ? "Integrante registrado" : "Vínculo não criado"}</strong>
            <p>{humanWriteNotice(conversion.code, conversion.created, conversion.message)}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AdmitForm({
  pending,
  onAdmit,
}: {
  pending: boolean;
  onAdmit: (personId: string, role: FormalRole) => void;
}) {
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<FormalRole>("INTEGRANTE");
  return (
    <form
      className={styles.admit}
      onSubmit={(event) => {
        event.preventDefault();
        if (!personId.trim() || pending) return;
        onAdmit(personId.trim(), role);
      }}
    >
      <label>
        Pessoa já cadastrada
        <input
          name="personId"
          value={personId}
          autoComplete="off"
          placeholder="Código da pessoa"
          onChange={(event) => setPersonId(event.target.value)}
        />
      </label>
      <label>
        Função na equipe
        <select name="role" value={role} onChange={(event) => setRole(event.target.value as FormalRole)}>
          <option value="LIDER">Liderança</option>
          <option value="COORDENADOR">Coordenação</option>
          <option value="INTEGRANTE">Integrante</option>
          <option value="APOIO">Apoio</option>
        </select>
      </label>
      <button type="submit" disabled={pending || personId.trim().length === 0}>
        {pending ? "Registrando…" : "Incluir no vínculo formal"}
      </button>
    </form>
  );
}

function InterestLine({
  interest,
  busy,
  canConvert,
  onConvert,
}: {
  interest: InterestRow;
  busy: boolean;
  canConvert: boolean;
  onConvert: (interestId: string) => void;
}) {
  return (
    <div className={styles.row}>
      <SyntheticAvatar name={interest.displayName} />
      <div>
        <strong>{interest.displayName}</strong>
        <small>{interestStageLabel(interest.stage)} · não é integrante</small>
      </div>
      <span className={styles.tag}>Interesse</span>
      {canConvert ? (
        <button type="button" disabled={busy} onClick={() => onConvert(interest.id)}>
          {busy ? "Registrando…" : "Registrar como integrante"}
        </button>
      ) : null}
    </div>
  );
}
