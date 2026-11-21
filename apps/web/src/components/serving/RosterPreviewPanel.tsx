"use client";

import { useId, useState } from "react";
import type { RosterPreviewDto } from "@idbrf/shared";
import { ApiRequestError, apiGet, apiPost } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import ui from "../ui/ui.module.css";
import styles from "./roster-preview.module.css";

const reasons: Record<string, string> = {
  EMPTY_TEAM: "O ministério ainda não tem integrantes ativos.",
  DAY_CONFLICT: "Já há escala no mesmo dia.",
  NO_AVAILABILITY: "Fora da disponibilidade cadastrada.",
  IMPEDIMENT: "Há impedimento no horário do culto.",
  MIN_INTERVAL: "Intervalo mínimo entre escalas.",
  MONTHLY_LIMIT: "Limite de escalas no mês.",
  COUPLE_REQUIRED: "A posição exige indicação de um casal.",
};

export function RosterPreviewPanel({ token, rosterId, onApplied }: { token: string; rosterId: string; onApplied?: () => void }) {
  const titleId = useId();
  const [preview, setPreview] = useState<RosterPreviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<number | null>(null);
  const endpoint = `/rosters/${encodeURIComponent(rosterId)}/preview`;

  async function simulate() {
    setLoading(true);
    setPreview(null);
    setError("");
    setApplied(null);
    try {
      const result = await apiGet<RosterPreviewDto>(endpoint, token);
      setPreview(result);
    } catch (problem) {
      setError(dasError(problem));
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (loading || !preview?.fingerprint || !onApplied) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiPost<{ applied: number; unfilled: RosterPreviewDto["positions"] }>(
        endpoint + "/apply", token, { fingerprint: preview.fingerprint },
      );
      setPreview({ rosterId, positions: result.unfilled });
      setApplied(result.applied);
      onApplied();
    } catch (problem) {
      if (problem instanceof ApiRequestError && problem.status === 409) setPreview(null);
      setError(dasError(problem));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby={titleId} aria-busy={loading}>
      <header>
        <h4 id={titleId}>Prévia da escala</h4>
        <p>Confira as sugestões, aplique ao rascunho e ajuste os postos antes de publicar.</p>
      </header>
      <button className={ui.workspaceQuiet} type="button" disabled={loading} onClick={() => void simulate()}>
        {loading ? "Gerando sugestões…" : preview ? "Atualizar prévia" : "Simular escala"}
      </button>
      {error && <p role="alert">{error}</p>}
      {applied !== null && <p role="status">{applied === 1 ? "1 posto preenchido" : applied + " postos preenchidos"} no rascunho.</p>}
      {preview && (
        <div role="status">
          {!preview.positions.length ? <p>Todas as posições cadastradas estão preenchidas.</p> : (
            <ul className={styles.positions}>
              {preview.positions.map(position => (
                <li key={position.slotId}>
                  <strong>{position.roleLabel}</strong>
                  {position.personName ? <span>{position.personName}{position.partnerName && ` · ${position.partnerName}`}</span> : (
                    <>
                      <span>Posição sem sugestão</span>
                      <small>{position.reasons.map(reason => reasons[reason]).filter(Boolean).join(" ") || "Revise a equipe e as regras do culto."}</small>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {preview?.fingerprint && onApplied && <button className={ui.workspacePrimary} type="button" disabled={loading} onClick={() => void apply()}>
        Preencher rascunho
      </button>}
    </section>
  );
}
