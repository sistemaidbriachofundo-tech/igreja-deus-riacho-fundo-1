"use client";

import { useEffect } from "react";
import { formatChurchDate } from "../../lib/das-operations";
import { assignmentStatusLabel, type PersonalAssignment } from "../../lib/serving-rosters";
import { UIIcon } from "../AppShell";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import styles from "./serving.module.css";

function needsResponse(item: PersonalAssignment) {
  return item.status === "PENDING" && item.rosterStatus === "PUBLISHED";
}

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
  const { confirm, confirmation } = useActionConfirmation();
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash.startsWith("escala-")) document.getElementById(hash)?.scrollIntoView({ block: "center" });
  }, [assignments]);
  const ordered = [...assignments].sort((a, b) => Number(needsResponse(b)) - Number(needsResponse(a)));

  async function decline(item: PersonalAssignment) {
    if (await confirm({
      title: "Recusar esta escala?",
      subject: `${item.title} · ${formatChurchDate(item.serviceAt)} · ${item.roleLabel}`,
      description: "Sua resposta ficará visível para a liderança, que poderá escalar outra pessoa.",
      action: "Recusar escala",
      cancel: "Voltar",
      tone: "danger",
    })) onDecline(item.id);
  }

  return (
    <div data-surface="membro">
      {confirmation}
      {notice && (
        <p className={styles.notice} role="status" data-persist="roster">
          {notice}
        </p>
      )}
      <section className={styles.memberAgenda} aria-label="Agenda pessoal">
        <header><h2>Sua agenda</h2></header>
        {assignments.length === 0 ? (
          <p role="status" data-agenda="empty">
            Você ainda não tem escalas nesta agenda.
          </p>
        ) : (
          <div className={styles.agenda}>
            {ordered.map((item) => {
              const open = needsResponse(item);
              return (
                <article key={item.id} className={styles.agendaItem} id={`escala-${item.id}`} data-assignment={item.id}>
                  <div className={styles.rosterHeader}>
                    <div>
                      <h3>{item.title}</h3>
                      <p className={styles.footnote}>
                        {[item.ministryName, item.roleLabel, item.sector, item.zone, item.side].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className={styles.badge} data-status={item.status}>
                      {item.status === "PENDING" && item.rosterStatus === "CLOSED"
                        ? "Encerrada sem resposta"
                        : assignmentStatusLabel[item.status]}
                    </span>
                  </div>
                  <p className={styles.agendaTime}>
                    <UIIcon name="calendar" size={16} />
                    <time dateTime={item.serviceAt}>{formatChurchDate(item.serviceAt)}</time>
                  </p>
                  {(item.substituteForId || item.participation === "partner") && <p className={styles.footnote}>
                    {[item.substituteForId && "Substituição", item.participation === "partner" && "Participação em dupla"].filter(Boolean).join(" · ")}
                  </p>}
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
                        Confirmar presença
                      </button>
                      <button
                        type="button"
                        className={styles.agendaDecline}
                        disabled={busy}
                        onClick={() => void decline(item)}
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
