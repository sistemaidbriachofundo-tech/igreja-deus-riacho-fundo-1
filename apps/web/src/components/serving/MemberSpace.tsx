"use client";

import { withBasePath } from "../../lib/paths";
import { formatChurchDate } from "../../lib/das-operations";
import type { PersonalAssignment } from "../../lib/serving-rosters";
import styles from "./serving.module.css";

type Probe = "forbidden" | "allowed" | "unavailable" | null;

export function MemberSpace({
  email,
  personId,
  assignments,
  busy,
  notice,
  probe,
  onConfirm,
  onDecline,
  onProbe,
}: {
  email: string;
  personId: string;
  assignments: readonly PersonalAssignment[];
  busy: boolean;
  notice: string;
  probe: Probe;
  onConfirm: (assignmentId: string) => void;
  onDecline: (assignmentId: string) => void;
  onProbe: () => void;
}) {
  return (
    <div data-surface="membro">
      {notice && (
        <p className={styles.notice} role="status" data-persist="roster">
          {notice}
        </p>
      )}
      <section className={styles.card}>
        <h2>Sua sessão</h2>
        <p>
          Conta <strong>{email}</strong>
        </p>
        <p className={styles.footnote}>
          A agenda abaixo usa a pessoa do token: {personId || "não informado pela API"}.
        </p>
        <p>
          <a href={withBasePath("/app/membros/carteirinha/")}>Abrir a carteirinha já publicada</a>
        </p>
      </section>
      <section className={styles.card} aria-label="Agenda pessoal">
        <h2>Sua agenda</h2>
        <p className={styles.footnote}>
          Só entram as posições em que esta pessoa é titular ou par. Confirmar e recusar gravam na API e não enviam mensagem.
        </p>
        {assignments.length === 0 ? (
          <p role="status" data-agenda="empty">
            Nenhuma escala da sua pessoa foi encontrada.
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
                        {item.ministryName ?? "Sem ministério"}
                        {item.ministrySlug ? ` · ${item.ministrySlug}` : ""} · {item.roleLabel}
                      </p>
                      <p className={styles.footnote}>{formatChurchDate(item.serviceAt)}</p>
                    </div>
                    <span className={styles.badge} data-status={item.status}>
                      {item.status}
                    </span>
                  </div>
                  <p className={styles.footnote}>
                    {item.participation === "partner"
                      ? "Você está como par nesta função."
                      : "Você está designado nesta função."}
                  </p>
                  {item.sameDayConflict && (
                    <p className={styles.conflict} role="status">
                      Há outra posição ativa sua neste dia. A API recusa uma nova designação com ROSTER_SAME_DAY.
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
      <section className={styles.card}>
        <h2>Permissão de listagem</h2>
        <p>
          Esta verificação chama GET /rosters e mostra só o resultado da autorização. O conteúdo da resposta não entra na tela.
        </p>
        <button type="button" className={styles.ghost} disabled={busy} onClick={onProbe}>
          Verificar se esta conta pode listar escalas
        </button>
        {probe === "forbidden" && (
          <p className={styles.conflict} role="status" data-probe="forbidden">
            A API recusou a listagem. Nenhuma escala de outra pessoa foi carregada nesta tela.
          </p>
        )}
        {probe === "allowed" && (
          <p className={styles.notice} role="status" data-probe="allowed">
            Esta conta pode listar escalas na API legada. Meu Espaço continua mostrando só a agenda do token.
          </p>
        )}
        {probe === "unavailable" && (
          <p className={styles.conflict} role="alert" data-probe="unavailable">
            Não foi possível ler o resultado da autorização. Nada foi listado.
          </p>
        )}
      </section>
    </div>
  );
}
