"use client";

import { useEffect } from "react";
import { formatChurchDate } from "../../lib/das-operations";
import { assignmentStatusLabel, type PersonalAssignment } from "../../lib/serving-rosters";
import { UIIcon } from "../ui/UIIcon";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import styles from "./serving.module.css";

function needsResponse(item: PersonalAssignment) {
  return item.status === "PENDING" && item.rosterStatus === "PUBLISHED";
}

const assignmentDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});

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
        <header><UIIcon name="roster" size={20} /><h2>Sua agenda</h2></header>
        {assignments.length === 0 ? (
          <div className={styles.agendaEmpty} role="status" data-agenda="empty">
            <UIIcon name="calendar" size={23} />
            <div><strong>Sem escalas na agenda</strong><p>Seus horários de serviço aparecem aqui quando a liderança publicar a escala.</p></div>
          </div>
        ) : (
          <div className={styles.agenda}>
            {ordered.map((item) => {
              const open = needsResponse(item);
              const parts = assignmentDate.formatToParts(new Date(item.serviceAt));
              const day = parts.find(part => part.type === "day")?.value;
              const month = parts.find(part => part.type === "month")?.value.replace(".", "");
              const hour = parts.find(part => part.type === "hour")?.value;
              const minute = parts.find(part => part.type === "minute")?.value;
              const closed = item.status === "PENDING" && item.rosterStatus === "CLOSED";
              return (
                <article key={item.id} className={styles.agendaItem} id={`escala-${item.id}`} data-assignment={item.id}>
                  <div className={styles.agendaDate} aria-hidden="true"><strong>{day}</strong><span>{month}</span></div>
                  <div className={styles.agendaEntry}>
                    <h3>{item.title}</h3>
                    <p className={styles.footnote}>
                      {[item.ministryName, item.roleLabel, item.sector, item.zone, item.side].filter(Boolean).join(" · ")}
                    </p>
                    <div className={styles.agendaMeta}>
                      <time dateTime={item.serviceAt} className={styles.agendaTime}>
                        <UIIcon name="clock" size={15} />
                        <span className={styles.agendaAccessibleDate}>{formatChurchDate(item.serviceAt)}</span>
                        <span aria-hidden="true">{hour}:{minute}</span>
                      </time>
                      <span className={styles.badge} data-status={closed ? "CLOSED" : item.status}>
                        {item.status === "CONFIRMED" && <UIIcon name="check" size={13} />}
                        {closed ? "Encerrada sem resposta" : assignmentStatusLabel[item.status]}
                      </span>
                    </div>
                    {(item.substituteForId || item.participation === "partner") && <p className={styles.footnote}>
                      {[item.substituteForId && "Substituição", item.participation === "partner" && "Participação em dupla"].filter(Boolean).join(" · ")}
                    </p>}
                  </div>
                  {item.sameDayConflict && (
                    <p className={styles.agendaConflict} role="status">
                      Você tem outra posição na escala deste dia.
                    </p>
                  )}
                  {open && (
                    <div className={styles.actions}>
                      <button type="button" className={styles.primary} disabled={busy} onClick={() => onConfirm(item.id)}>
                        <UIIcon name="check" size={17} /> Confirmar presença
                      </button>
                      <button type="button" className={styles.agendaDecline} disabled={busy} onClick={() => void decline(item)}>
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
