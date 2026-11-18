"use client";

import { useEffect, useState } from "react";
import { apiGet, loadStoredToken } from "../lib/api";
import { formatChurchWhen } from "../lib/ministry-view";
import { readPanel } from "../lib/panel-read";
import { withBasePath } from "../lib/paths";
import s from "./workspace-priorities.module.css";
import { UIIcon } from "./ui/UIIcon";

type Priorities = {
  nextService: { serviceAt: string; teams: { id: string; title: string; vacancies: number; href: string }[] } | null;
  pending: { id: string; category: string; title: string; detail: string; href: string }[];
};
const endpoint = "/notifications/priorities";

export function WorkspacePriorities({ showService, showDecisions, revision }: { showService: boolean; showDecisions: boolean; revision: number }) {
  const [data, setData] = useState<Priorities>();
  const [failure, setFailure] = useState(false);
  useEffect(() => {
    const token = loadStoredToken();
    if (!token) return;
    let mounted = true;
    const reload = () => {
      setFailure(false);
      void readPanel(token, endpoint, () => apiGet<Priorities>(endpoint, token), { fresh: true })
        .then(value => { if (mounted) setData(value); })
        .catch(() => { if (mounted) setFailure(true); });
    };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) reload(); };
    reload();
    window.addEventListener("pageshow", onPageShow);
    return () => { mounted = false; window.removeEventListener("pageshow", onPageShow); };
  }, [revision]);

  const next = data?.nextService;
  return <section className={s.panel} aria-label="O que precisa da sua atenção">
    {failure && <p role="alert">Não foi possível consultar as prioridades. Use Atualizar para tentar novamente.</p>}
    {!data && !failure && <p role="status">Carregando prioridades…</p>}
    {showService && data && <section className={s.service} aria-labelledby="priority-service">
      <div className={s.heading}>
        <span className={s.icon}><UIIcon name="calendar" size={21} /></span>
        <h2 id="priority-service">Próximo culto</h2>
      </div>
      {next ? <>
        <p className={s.when}><time dateTime={next.serviceAt}>{formatChurchWhen(next.serviceAt)}</time></p>
        <ul>{next.teams.map(team => <li key={team.id}><div><strong>{team.title}</strong>
          <span>{team.vacancies === 0 ? "Sem vagas abertas" : team.vacancies + (team.vacancies === 1 ? " vaga aberta" : " vagas abertas")}</span></div>
          <a href={withBasePath(team.href)} aria-label={(team.vacancies ? "Preencher vaga · " : "Ver escala · ") + team.title}>
            {team.vacancies ? "Preencher vaga" : "Ver escala"} <UIIcon name="arrow" size={15} />
          </a>
        </li>)}</ul>
      </> : <p>Nenhum culto com escala publicada para suas equipes.</p>}
    </section>}
    {showDecisions && data && <section className={s.decisions} aria-labelledby="priority-decisions">
      <div className={s.heading}>
        <span className={s.icon}><UIIcon name="activity" size={21} /></span>
        <h2 id="priority-decisions">Decisões pendentes</h2>
      </div>
      {data.pending.length ? <ul>{data.pending.slice(0, 5).map(item => <li key={item.id}>
        <div><strong>{item.detail || item.title}</strong><span>{item.category}</span></div>
        <a href={withBasePath(item.href)} aria-label={"Revisar " + item.title + " · " + item.detail}>
          Revisar <UIIcon name="chevron" size={14} />
        </a>
      </li>)}</ul> : <p>Nenhuma decisão pendente para o seu perfil.</p>}
    </section>}
  </section>;
}
