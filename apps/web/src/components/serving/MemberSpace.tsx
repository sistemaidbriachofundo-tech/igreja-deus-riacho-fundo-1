"use client";

import { useEffect, useState, type ReactNode } from "react";
import { formatChurchDate } from "../../lib/das-operations";
import { assignmentStatusLabel, type PersonalAssignment } from "../../lib/serving-rosters";
import { UIIcon } from "../ui/UIIcon";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import styles from "./member-schedule.module.css";

const dateLabel = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long",
});
const clock = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", hour: "numeric", minute: "2-digit", hourCycle: "h23",
});

function isUpcoming(item: PersonalAssignment, now: number) {
  return item.rosterStatus === "PUBLISHED" && Date.parse(item.serviceAt) >= now &&
    item.status !== "DECLINED" && item.status !== "SUBSTITUTED";
}

export function MemberSpace({
  assignments, busy, notice, onConfirm, onDecline, invitations, availability,
}: {
  assignments: readonly PersonalAssignment[];
  busy: boolean;
  notice: string;
  onConfirm: (assignmentId: string) => void;
  onDecline: (assignmentId: string) => void;
  invitations?: ReactNode;
  availability?: ReactNode;
}) {
  const { confirm, confirmation } = useActionConfirmation();
  const [target, setTarget] = useState("");
  useEffect(() => {
    function readTarget() { setTarget(window.location.hash.slice(1)); }
    readTarget();
    window.addEventListener("hashchange", readTarget);
    return () => window.removeEventListener("hashchange", readTarget);
  }, []);
  useEffect(() => {
    if (!target.startsWith("escala-")) return;
    const article = document.getElementById(target);
    if (article) {
      article.closest("details")?.setAttribute("open", "");
      article.scrollIntoView({ block: "center" });
    }
  }, [assignments, target]);

  const now = Date.now();
  const ordered = [...assignments].filter(item => item.rosterStatus !== "DRAFT")
    .sort((a, b) => Date.parse(a.serviceAt) - Date.parse(b.serviceAt));
  const upcoming = ordered.filter(item => isUpcoming(item, now));
  const previous = ordered.filter(item => !isUpcoming(item, now)).reverse();

  async function decline(item: PersonalAssignment) {
    if (await confirm({
      title: "Você não poderá servir neste culto?",
      subject: `${item.moduleName ?? item.roleLabel} · ${formatChurchDate(item.serviceAt)}`,
      description: "A liderança receberá sua resposta e poderá chamar outra pessoa.",
      action: "Registrar recusa",
      cancel: "Voltar",
      tone: "danger",
    })) onDecline(item.id);
  }

  function renderAssignment(item: PersonalAssignment, featured = false) {
    const date = new Date(item.serviceAt);
    const status = item.ownResponseStatus ?? item.status;
    const open = isUpcoming(item, now) && status === "PENDING";
    const team = item.moduleName ?? item.roleLabel;
    const legacyLocation = item.moduleName ? [] : [item.sector, item.zone, item.side].filter(Boolean);
    const closed = status === "PENDING" && !open;
    return (
      <article key={item.id} className={styles.assignment} data-featured={featured}
        id={`escala-${item.id}`} data-assignment={item.id}>
        <div className={styles.heading}>
          <span className={styles.status} data-status={closed ? "CLOSED" : status}>
            {status === "CONFIRMED" && <UIIcon name="check" size={17} />}
            {closed ? "Encerrada sem resposta" : open ? "Aguardando sua resposta" : assignmentStatusLabel[status]}
          </span>
          <time dateTime={item.serviceAt} className={styles.when}>
            <span>{dateLabel.format(date)}</span>
            <strong>{clock.format(date).replace(":00", "h").replace(":", "h")}</strong>
          </time>
          <h3>{team}</h3>
          {item.title !== team && <p>{item.title}</p>}
          {(item.locationName || legacyLocation.length > 0) &&
            <p>{[item.locationName, ...legacyLocation].filter(Boolean).join(" · ")}</p>}
        </div>
        {(item.arrivalContactName || item.arrivalInstructions) && <div className={styles.arrival}>
          {item.arrivalContactName && <p><strong>Ao chegar, procure {item.arrivalContactName}.</strong></p>}
          {item.arrivalInstructions && <p>{item.arrivalInstructions}</p>}
        </div>}
        {item.companionName && <p className={styles.context}>
          <strong>Você serve com {item.companionName}.</strong>
          {item.companionResponseStatus && <span>{assignmentStatusLabel[item.companionResponseStatus]}</span>}
        </p>}
        {!item.companionName && item.participation === "partner" && <p className={styles.context}>Participação em dupla</p>}
        {item.substituteForId && <p className={styles.context}>Substituição</p>}
        {item.sameDayConflict && <p className={styles.context}>Você tem outra posição na escala deste dia.</p>}
        {open && (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => onConfirm(item.id)}>
              <UIIcon name="check" size={21} /> Confirmar presença
            </button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => void decline(item)}>Não posso ir</button>
          </div>
        )}
      </article>
    );
  }

  return (
    <div data-surface="membro" className={styles.workspace}>
      {confirmation}
      {notice && <p className={styles.notice} role="status" data-persist="roster">{notice}</p>}
      {invitations}
      <section aria-labelledby="member-next-roster">
        <h2 id="member-next-roster">Próxima escala</h2>
        {upcoming[0] ? renderAssignment(upcoming[0], true) : <div className={styles.empty} role="status" data-agenda="empty">
          <strong>Você ainda não tem uma próxima escala publicada.</strong>
          <p>Quando a liderança publicar seu próximo compromisso, ele aparecerá aqui.</p>
        </div>}
      </section>
      {availability}
      {upcoming.length > 1 && <section aria-labelledby="member-other-rosters">
        <h2 id="member-other-rosters">Outras escalas</h2>
        <div className={styles.list}>{upcoming.slice(1).map(item => renderAssignment(item))}</div>
      </section>}
      {previous.length > 0 && <details className={styles.history}>
        <summary>Histórico de escalas</summary>
        <div className={styles.list}>{previous.map(item => renderAssignment(item))}</div>
      </details>}
    </div>
  );
}
