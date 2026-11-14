"use client";

import { useState, type FormEvent } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { formatChurchWhen } from "../../lib/ministry-view";
import ui from "../ui/ui.module.css";
import s from "./roster-editor.module.css";

type Position = { slotId: string; roleLabel: string; personId?: string; partnerPersonId?: string; personName?: string; partnerName?: string; reasons: string[] };
type Preview = { month: string; responses: number; members: number; rosters: { id: string; title: string; serviceAt: string; moduleName?: string; positions: Position[] }[] };
const explanations: Record<string, string> = {
  MONTHLY_UNANSWERED: "Sem disponibilidade informada para este culto", NO_AVAILABILITY: "Fora do horário disponível",
  ROLE_NOT_APPROVED: "Falta integrante habilitado", DAY_CONFLICT: "Pessoa já escalada neste dia",
  COUPLE_REQUIRED: "Falta casal cadastrado e disponível", COUPLE_NOT_ELIGIBLE: "O par não está disponível ou habilitado",
  MIN_INTERVAL: "Intervalo mínimo entre escalas", MONTHLY_LIMIT: "Limite mensal", IMPEDIMENT: "Impedimento no horário",
};

export function MonthlyRosterPreview({ token, ministryId, onRefresh }: { token: string; ministryId: string; onRefresh: () => void }) {
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const month = new FormData(event.currentTarget).get("month");
    setBusy(true); setNotice("");
    try { setPreview(await apiGet<Preview>(`/rosters/by-ministry/${encodeURIComponent(ministryId)}/monthly-preview/${encodeURIComponent(String(month))}`, token)); }
    catch (error) { setNotice(dasError(error)); }
    finally { setBusy(false); }
  }
  async function apply(position: Position) {
    setBusy(true); setNotice("");
    try {
      await apiPost(`/rosters/slots/${encodeURIComponent(position.slotId)}/assign`, token, {
        personId: position.personId, fromMonthlyPreview: true, ...(position.partnerPersonId ? { partnerPersonId: position.partnerPersonId } : {}),
      });
      setPreview(current => current && { ...current, rosters: current.rosters.map(roster => ({ ...roster, positions: roster.positions.filter(row => row.slotId !== position.slotId) })) });
      setNotice("Sugestão salva no rascunho. O voluntário vê após a publicação.");
    } catch (error) { setNotice(dasError(error)); }
    finally { setBusy(false); }
  }
  return <details className={s.position}>
    <summary>Sorteio mensal</summary>
    <form className={s.form} onSubmit={generate}>
      <label>Mês das escalas<input name="month" type="month" required /></label>
      <button type="submit" className={ui.workspacePrimary} disabled={busy}>Gerar prévia mensal</button>
    </form>
    {notice && <p role="status">{notice}</p>}
    {preview && <div>
      <p>{preview.responses} de {preview.members} integrantes responderam.</p>
      {preview.rosters.filter(roster => roster.positions.length).map(roster => <section key={roster.id}>
        <h4>{roster.title} · {formatChurchWhen(roster.serviceAt)}{roster.moduleName ? ` · ${roster.moduleName}` : ""}</h4>
        {roster.positions.map(position => <p key={position.slotId}>{position.roleLabel} · {position.personName
          ? <>{[position.personName, position.partnerName].filter(Boolean).join(" e ")} <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => void apply(position)}>Aceitar sugestão</button></>
          : position.reasons.map(reason => explanations[reason]).filter(Boolean).join(" · ") || "Vaga em aberto"}</p>)}
      </section>)}
      {preview.rosters.every(roster => roster.positions.length === 0) && <p>Nenhuma vaga em rascunho neste mês.</p>}
      <button type="button" className={ui.workspaceSecondary} onClick={onRefresh}>Voltar para as escalas</button>
    </div>}
  </details>;
}
