"use client";

import { formatChurchDate } from "../../lib/das-operations";
import { assignmentStatusLabel, type PersonalAssignment } from "../../lib/serving-rosters";
import styles from "./serving.module.css";

export function MemberSpace({
  assignments,
  busy,
  notice,
  onConfirm,
  onDecline,
}: {
  assignments: readonly PersonalAssignment[];
  busy: boolean;
  notice: string;
  onConfirm: (assignmentId: string) => void;
  onDecline: (assignmentId: string) => void;
}) {
  return (
    <div data-surface="membro">
      {notice && (
        <p className={styles.notice} role="status" data-persist="roster">
          {notice}
        </p>
      )}
      <section className={styles.card} aria-label="Agenda pessoal">
        <h2>Sua agenda</h2>
        {assignments.length === 0 ? (
          <p role="status" data-agenda="empty">
            Você ainda não tem escalas nesta agenda.
          </p>
        ) : (
          <div className={styles.agenda}>
            {assignments.map((item) => {
              const open = item.status === "PENDING" && item.rosterStatus !== "CLOSED";
              return (
                <article key={item.id} className={styles.roster} data-assignment={item.id}>
                  <div className={styles.rosterHeader}>
                    <div>
                      <h3>{item.title}</h3>
                      <p className={styles.footnote}>
                        {[item.ministryName, item.roleLabel].filter(Boolean).join(" · ")}
                      </p>
                      <p className={styles.footnote}>{formatChurchDate(item.serviceAt)}</p>
                    </div>
                    <span className={styles.badge} data-status={item.status}>
                      {assignmentStatusLabel[item.status]}
                    </span>
                  </div>
                  {item.participation === "partner" && <p className={styles.footnote}>Participação em dupla</p>}
                  {item.sameDayConflict && (
                    <p className={styles.conflict} role="status">
                      Você tem outra posição na escala deste dia.
                    </p>
                  )}
                  {open && (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={busy}
                        onClick={() => onConfirm(item.id)}
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        className={styles.danger}
                        disabled={busy}
                        onClick={() => onDecline(item.id)}
                      >
                        Recusar
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
