"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { dasError, formatChurchDate } from "../../lib/das-operations";
import styles from "./serving.module.css";

type Survey = { month: string; open: boolean; answered: boolean; availableRosterIds: string[];
  rosters: { id: string; title: string; serviceAt: string; module: { name: string } | null }[] };
const PATH = "/rosters/me/monthly-survey";

export function MonthlyServiceSurvey({ token }: { token: string }) {
  const [survey, setSurvey] = useState<Survey>();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void apiGet<Survey>(PATH, token).then(value => {
      if (active) { setSurvey(value); setSelected(value.availableRosterIds); }
    }).catch(error => { if (active) setNotice(dasError(error)); });
    return () => { active = false; };
  }, [token]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!survey || busy) return;
    setBusy(true); setNotice("");
    try {
      await apiPost(PATH, token, { month: survey.month, rosterIds: selected });
      setSurvey({ ...survey, answered: true });
      setNotice("Sua disponibilidade foi salva.");
    } catch (error) { setNotice(dasError(error)); }
    finally { setBusy(false); }
  }
  return <section className={styles.card} aria-label="Pesquisa de serviço" id="pesquisa-de-servico">
    <h2>Pesquisa de serviço</h2>
    {survey && !survey.open && <p>A pesquisa do próximo mês abre no dia 25 e encerra no dia 28.</p>}
    {survey?.open && !survey.rosters.length && <p>Ainda não há cultos cadastrados para sua equipe no próximo mês.</p>}
    {survey?.open && survey.rosters.length > 0 && <form onSubmit={save}>
      <p>Marque os cultos em que pode servir. Deixe todos desmarcados para informar que não poderá servir no mês.</p>
      {survey.rosters.map(roster => <p key={roster.id}><label>
        <input type="checkbox" checked={selected.includes(roster.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, roster.id] : previous.filter(id => id !== roster.id))} />
        {roster.title} · {formatChurchDate(roster.serviceAt)}{roster.module ? ` · ${roster.module.name}` : ""}
      </label></p>)}
      <button type="submit" className={styles.primary} disabled={busy}>{survey.answered ? "Atualizar disponibilidade" : "Salvar disponibilidade"}</button>
    </form>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
