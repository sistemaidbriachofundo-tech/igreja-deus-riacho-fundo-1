"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { sortByName } from "@idbrf/shared";
import { apiGet, apiPost } from "../../lib/api";
import { dasError, formatChurchDate } from "../../lib/das-operations";
import { rosterRouteUnavailable } from "../../lib/roster-invitations";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import ui from "../ui/ui.module.css";
import s from "./roster-editor.module.css";

type Candidate = { personId: string; personName: string; partnerPersonId?: string; partnerName?: string };

export function RosterCoverVacancy({ slotId, requiresCouple, previousId, token, serviceAt, onRefresh, manualForm }: {
  slotId: string; requiresCouple: boolean; previousId?: string; token: string; serviceAt: string;
  onRefresh: () => void; manualForm: ReactNode;
}) {
  const group = useId();
  const [state, setState] = useState<{ candidates: Candidate[]; canInvite: boolean } | { error: string; unavailable?: boolean }>();
  const [selected, setSelected] = useState<Candidate>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [invited, setInvited] = useState(false);
  const [error, setError] = useState("");
  const { confirm, confirmation } = useActionConfirmation();
  const path = "/rosters/slots/" + encodeURIComponent(slotId);
  useEffect(() => {
    let current = true;
    void apiGet<{ candidates: Candidate[]; invitationKeepsVacancyOpen?: boolean }>(path + "/candidates", token).then(result => {
      if (!Array.isArray(result.candidates)) throw new Error("Resposta de candidatos inválida.");
      const eligible = result.candidates.filter(item => item.personId && item.personName &&
        (!requiresCouple || item.partnerPersonId && item.partnerName));
      if (current) setState({ candidates: sortByName(eligible, item => item.personName), canInvite: result.invitationKeepsVacancyOpen === true });
    }).catch(failure => {
      if (current) setState({ error: dasError(failure), unavailable: rosterRouteUnavailable(failure) });
    });
    return () => { current = false; };
  }, [path, requiresCouple, token]);

  async function cover(invite: boolean) {
    if (!selected || busy || (invite && (invited || !state || "error" in state || !state.canInvite))) return;
    if (!(await confirm({
      title: invite ? "Convidar para este culto?" : "Designar para este culto?",
      subject: [selected.personName, selected.partnerName].filter(Boolean).join(" e "),
      description: invite ? "A vaga ficará em aberto até o aceite." : "A designação ficará aguardando confirmação.",
      action: invite ? "Enviar convite" : "Designar agora",
    }))) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const endpoint = invite ? path + "/invite" : previousId
        ? "/rosters/assignments/" + encodeURIComponent(previousId) + "/substitute" : path + "/assign";
      await apiPost(endpoint, token, { personId: selected.personId,
        ...(selected.partnerPersonId ? { partnerPersonId: selected.partnerPersonId } : {}) });
      if (invite) setInvited(true);
      setNotice(invite ? "Convite enviado. A vaga aguarda o aceite." : "Designação registrada.");
      onRefresh();
    } catch (failure) {
      setError(rosterRouteUnavailable(failure) ? "Essa ação ainda não está disponível na API deste ambiente." : dasError(failure));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <p role="status">Buscando pessoas elegíveis…</p>;
  if ("error" in state) return <div>
    <p role={state.unavailable ? "status" : "alert"}>{state.unavailable
      ? "Os convites por vaga aguardam a atualização da API. Use a designação manual." : state.error}</p>
    {state.unavailable && manualForm}
  </div>;
  return <div className={s.coverPanel}>
    {confirmation}
    <div><strong>Pessoas disponíveis</strong><p>{formatChurchDate(serviceAt)} · Equipe deste culto</p></div>
    {state.candidates.length === 0 && <p role="status">Nenhuma pessoa elegível para esta vaga.</p>}
    {state.candidates.length > 0 && <fieldset disabled={busy}>
      <legend>Escolha {requiresCouple ? "um casal" : "uma pessoa"}</legend>
      {state.candidates.map(item => {
        const id = JSON.stringify([item.personId, item.partnerPersonId ?? null]);
        return <label key={id}><input type="radio" name={group} value={id}
          checked={selected === item} onChange={() => { setSelected(item); setInvited(false); setNotice(""); }} />
          {[item.personName, item.partnerName].filter(Boolean).join(" e ")}</label>;
      })}
    </fieldset>}
    {state.candidates.length > 0 && <footer>
      <button type="button" className={ui.workspaceSecondary} disabled={busy || !selected} onClick={() => void cover(false)}>Designar agora</button>
      {state.canInvite && <button type="button" className={s.coverPrimary} disabled={busy || !selected || invited} onClick={() => void cover(true)}>Convidar para este culto</button>}
    </footer>}
    {!state.canInvite && state.candidates.length > 0 && <p role="status">Convites para esta vaga aguardam a atualização da API.</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p className={s.error} role="alert">{error}</p>}
  </div>;
}
