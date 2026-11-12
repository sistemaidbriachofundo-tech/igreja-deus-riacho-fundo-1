"use client";

import { useId, useState } from "react";
import type { RosterPreviewDto } from "@idbrf/shared";
import { apiGet } from "../../lib/api";
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

export function RosterPreviewPanel({ token, rosterId }: { token: string; rosterId: string }) {
  const titleId = useId();
  const [preview, setPreview] = useState<RosterPreviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function simulate() {
    setLoading(true);
    setPreview(null);
    setError("");
    try {
      const result = await apiGet<RosterPreviewDto>(`/rosters/${encodeURIComponent(rosterId)}/preview`, token);
      setPreview(result);
    } catch (problem) {
      setError(dasError(problem));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby={titleId} aria-busy={loading}>
      <header>
        <h4 id={titleId}>Prévia da escala</h4>
        <p>Sugestões para as posições livres a partir da equipe e das escalas do dia.</p>
      </header>
      <button className={ui.workspaceQuiet} type="button" disabled={loading} onClick={() => void simulate()}>
        {loading ? "Gerando sugestões…" : preview ? "Atualizar prévia" : "Simular escala"}
      </button>
      {error && <p role="alert">{error}</p>}
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
    </section>
  );
}
