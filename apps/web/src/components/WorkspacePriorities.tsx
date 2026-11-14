"use client";

import { useEffect, useState } from "react";
import { apiGet, loadStoredToken } from "../lib/api";
import { formatChurchWhen } from "../lib/ministry-view";
import { readPanel } from "../lib/panel-read";
import { withBasePath } from "../lib/paths";
import s from "./workspace-priorities.module.css";

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
    setFailure(false);
    void readPanel(token, endpoint, () => apiGet<Priorities>(endpoint, token), { fresh: revision > 0 })
      .then(value => { if (mounted) setData(value); })
      .catch(() => { if (mounted) setFailure(true); });
    return () => { mounted = false; };
  }, [revision]);

  const next = data?.nextService;
  return <section className={s.panel} aria-label="O que precisa da sua atenção">
    {failure && <p role="alert">Não foi possível consultar as prioridades. Use Atualizar para tentar novamente.</p>}
    {!data && !failure && <p role="status">Carregando prioridades…</p>}
    {showService && data && <div>
      <h2>Próximo culto</h2>
      {next ? <>
        <p><time dateTime={next.serviceAt}>{formatChurchWhen(next.serviceAt)}</time></p>
        <ul>{next.teams.map(team => <li key={team.id}><div><strong>{team.title}</strong>
          <span>{team.vacancies === 0 ? "Sem vagas abertas" : team.vacancies + (team.vacancies === 1 ? " vaga aberta" : " vagas abertas")}</span></div>
          <a href={withBasePath(team.href)} aria-label={(team.vacancies ? "Preencher vaga · " : "Ver escala · ") + team.title}>{team.vacancies ? "Preencher vaga" : "Ver escala"}</a>
        </li>)}</ul>
      </> : <p>Nenhum culto com escala publicada para suas equipes.</p>}
    </div>}
    {showDecisions && data && <div>
      <h2>Decisões pendentes</h2>
      {data.pending.length ? <ul>{data.pending.slice(0, 5).map(item => <li key={item.id}>
        <div><strong>{item.category}</strong><span>{item.detail}</span></div>
        <a href={withBasePath(item.href)} aria-label={item.title + " · " + item.detail}>Revisar</a>
      </li>)}</ul> : <p>Nenhuma decisão pendente para o seu perfil.</p>}
    </div>}
  </section>;
}
