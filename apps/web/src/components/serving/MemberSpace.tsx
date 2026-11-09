"use client";

import { useState, type FormEvent } from "react";
import { withBasePath } from "../../lib/paths";
import styles from "./serving.module.css";

type Probe = "forbidden" | "allowed" | "unavailable" | null;

export function MemberSpace({
  email,
  personId,
  busy,
  notice,
  probe,
  onConfirm,
  onDecline,
  onProbe,
}: {
  email: string;
  personId: string;
  busy: boolean;
  notice: string;
  probe: Probe;
  onConfirm: (assignmentId: string) => void;
  onDecline: (assignmentId: string) => void;
  onProbe: () => void;
}) {
  const [assignmentId, setAssignmentId] = useState("");
  const ready = assignmentId.trim().length > 0;

  function submit(event: FormEvent<HTMLFormElement>, action: "confirm" | "decline") {
    event.preventDefault();
    const id = assignmentId.trim();
    if (!id) return;
    if (action === "confirm") onConfirm(id);
    else onDecline(id);
  }

  return (
    <div data-surface="membro">
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      <section className={styles.card}>
        <h2>Sua sessão</h2>
        <p>
          Conta <strong>{email}</strong>
        </p>
        <p className={styles.footnote}>
          Identificador da sua pessoa na homologação: {personId || "não informado pela API"}.
        </p>
        <p>
          <a href={withBasePath("/app/membros/carteirinha/")}>Abrir a carteirinha já publicada</a>
        </p>
      </section>
      <section className={styles.card}>
        <h2>Sua escala</h2>
        <p>
          A API atual autoriza o membro a confirmar ou recusar a própria atribuição pelo identificador.
          Não há consulta da agenda pessoal, então esta tela não monta uma lista.
        </p>
        <form className={styles.form} onSubmit={(event) => submit(event, "confirm")}>
          <label className={styles.form}>
            Identificador da sua atribuição
            <input
              className={styles.field}
              value={assignmentId}
              onChange={(event) => setAssignmentId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={busy || !ready}>
              Confirmar minha escala
            </button>
            <button
              type="button"
              className={styles.danger}
              disabled={busy || !ready}
              onClick={() => onDecline(assignmentId.trim())}
            >
              Recusar minha escala
            </button>
          </div>
        </form>
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
            Esta conta pode listar escalas na API. A lista fica em Atmosfera e Louvor. Meu Espaço não a mostra.
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
