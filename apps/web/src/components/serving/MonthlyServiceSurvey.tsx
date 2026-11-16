"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { dasError, formatChurchDate } from "../../lib/das-operations";
import { UIIcon } from "../ui/UIIcon";
import styles from "./serving.module.css";

type Survey = { month: string; open: boolean; answered: boolean; availableRosterIds: string[];
  rosters: { id: string; title: string; serviceAt: string; module: { name: string } | null }[] };
const PATH = "/rosters/me/monthly-survey";

export function MonthlyServiceSurvey({ token }: { token: string }) {
  const [survey, setSurvey] = useState<Survey>();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!survey && !notice) return;
    const reveal = () => {
      if (window.location.hash === "#pesquisa-de-servico" && panel.current) {
        panel.current.open = true;
        panel.current.scrollIntoView({ block: "start" });
      }
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [survey, notice]);
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
  if (!survey && !notice) return null;

  return <details ref={panel} className={styles.survey} id="pesquisa-de-servico">
    <summary>
      <span className={styles.surveyIcon}><UIIcon name="month" size={19} /></span>
      <span><strong>Disponibilidade para servir</strong>
        <small>{!survey ? "Consulta indisponível" : survey.open
          ? survey.answered ? "Resposta enviada" : "Pesquisa aberta até dia 28"
          : "Pesquisa do dia 25 ao dia 28"}</small></span>
      <UIIcon name="chevron" size={17} />
    </summary>
    <div className={styles.surveyBody}>
      {survey && !survey.open && <p>A pesquisa para o próximo mês abre no dia 25 e encerra no dia 28.</p>}
      {survey?.open && !survey.rosters.length && <p>Ainda não há cultos cadastrados para sua equipe no próximo mês.</p>}
      {survey?.open && survey.rosters.length > 0 && <form onSubmit={save}>
        <p>Marque os cultos em que pode servir. Envie sem marcar se não puder servir neste mês.</p>
        {survey.rosters.map(roster => <label key={roster.id} className={styles.surveyOption}>
          <input type="checkbox" checked={selected.includes(roster.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, roster.id] : previous.filter(id => id !== roster.id))} />
          <span><strong>{roster.title}</strong><small>{formatChurchDate(roster.serviceAt)}{roster.module ? ` · ${roster.module.name}` : ""}</small></span>
        </label>)}
        <button type="submit" className={styles.primary} disabled={busy}>{survey.answered ? "Atualizar disponibilidade" : "Salvar disponibilidade"}</button>
      </form>}
      {notice && <p role="status">{notice}</p>}
    </div>
  </details>;
}
