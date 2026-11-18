"use client";

import { useEffect, useState } from "react";
import { apiGet, loadStoredToken } from "../../lib/api";
import { withBasePath } from "../../lib/paths";
import { readPanel } from "../../lib/panel-read";
import { UIIcon } from "../ui/UIIcon";
import styles from "./connection-journey.module.css";

type Stage = { id: string; title: string; description: string | null; completed: boolean; waived?: boolean };
type Journey = { name: string; status: string; mentorName: string | null; stages: Stage[]; currentStageId: string | null };
type JourneyResponse = { journey: Journey | null; previewStages?: Pick<Stage, "id" | "title" | "description">[] };
const path = "/discipleship/me/connection";

export function ConnectionJourney({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<JourneyResponse>();
  const [failure, setFailure] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const token = loadStoredToken();
    if (!token) return;
    let current = true;
    setFailure(false);
    void readPanel(token, path, () => apiGet<JourneyResponse>(path, token), { fresh: attempt > 0 })
      .then(result => { if (current) setData(result); })
      .catch(() => { if (current) setFailure(true); });
    return () => { current = false; };
  }, [attempt]);

  useEffect(() => {
    if (!compact && data !== undefined && window.location.hash === "#trilha-da-conexao") {
      document.getElementById("trilha-da-conexao")?.scrollIntoView({ block: "start" });
    }
  }, [compact, data]);

  const journey = data?.journey;
  const stage = journey?.stages.find(item => item.id === journey.currentStageId);
  return <section className={styles.journey} id="trilha-da-conexao" aria-label="Trilha da Conexão">
    <header><h2><UIIcon name="layers" size={20} /> Trilha da Conexão</h2>
      {compact && <a href={withBasePath("/app/servir/meu-espaco/#trilha-da-conexao")}>Abrir minha trilha</a>}
    </header>
    {failure ? <p role="alert">A trilha está indisponível. <button type="button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></p> :
      data === undefined ? <p role="status">Carregando trilha…</p> :
      !journey ? <>
        <p>Procure a equipe da Conexão para começar sua trilha.</p>
        {data.previewStages && <details className={styles.steps}>
          <summary>Conhecer as etapas da trilha</summary>
          <ol>{data.previewStages.map(item => <li key={item.id}><strong>{item.title}</strong><span>{item.description}</span></li>)}</ol>
        </details>}
      </> : <>
        {journey.status === "PAUSED" && <p>Trilha pausada. Procure quem acompanha você para combinar a retomada.</p>}
        {journey.status === "COMPLETED" && <p>Trilha concluída.</p>}
        {stage && <div className={styles.current}>
          <span>Etapa atual</span><strong>{stage.title}</strong>
          {stage.description && <p>{stage.description}</p>}
        </div>}
        {journey.status === "ACTIVE" && !stage && <p>A equipe da Conexão vai orientar o próximo passo.</p>}
        <p className={styles.mentor}><UIIcon name="people" size={17} /><span><strong>Acompanhamento</strong><br />{journey.mentorName ?? "Responsável a definir"}</span></p>
        {!compact && journey.stages.length > 0 && <details className={styles.steps}><summary>Ver etapas da trilha</summary><ol>{journey.stages.map(item => <li key={item.id} aria-current={stage?.id === item.id ? "step" : undefined}>
          <strong>{item.title}</strong><span>{item.completed ? "Concluída" : item.waived ? "Não se aplica ao seu percurso" : stage?.id === item.id ? "Etapa atual" : "A iniciar"}</span>
        </li>)}</ol></details>}
      </>}
  </section>;
}
