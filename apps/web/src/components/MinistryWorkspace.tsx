"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api";
import { dasError, readDasRows, type DasRecord } from "../lib/das-operations";
import styles from "./ministry-workspace.module.css";

type Props = { ministries: DasRecord[]; token: string };
type Loading = "idle" | "loading" | "ready" | "error";
const word = (value: unknown) => typeof value === "string" ? value.trim() : "";
const inTeam = (interest: DasRecord) =>
  ["EQUIPE", "DISPONIBILIDADE", "ESCALA"].includes(word(interest.stage))
  && word(interest.status) !== "REJECTED";

export function MinistryWorkspace({ ministries, token }: Props) {
  const [chosenId, setChosenId] = useState("");
  const [records, setRecords] = useState<DasRecord[]>([]);
  const [state, setState] = useState<Loading>("idle");
  const [message, setMessage] = useState("");

  // Só opções autorizadas são retornadas pelo backend (/ministries por concessão).
  const options = useMemo(() => ministries.filter(row => word(row.id)), [ministries]);
  const ministry = options.find(row => row.id === chosenId) ?? options[0];
  const ministryId = word(ministry?.id);

  useEffect(() => {
    if (!ministryId) { setState("idle");setRecords([]);return; }
    let cancelled = false;
    setState("loading");
    setRecords([]);
    setMessage("");
    void apiGet<unknown>("/volunteer-interests?ministryId="+encodeURIComponent(ministryId), token)
      .then(body => {
        const next = readDasRows(body, "interests");
        if (!cancelled) {setRecords(next);setState("ready");}
      })
      .catch(error => {
        if (!cancelled) {setRecords([]);setState("error");setMessage(dasError(error));}
      });
    return () => { cancelled = true; };
  }, [ministryId, token]);

  const team = records.filter(inTeam);
  const pending = records.filter(row => !inTeam(row) && word(row.status) === "OPEN");

  return <section className={styles.workspace} aria-labelledby="my-ministry-title">
    <header className={styles.intro}>
      <span>ESPAÇO DA LIDERANÇA · ÁREA LOGADA</span>
      <h2 id="my-ministry-title">Meu ministério</h2>
      <p>Visualize somente os ministérios autorizados para sua conta. Os dados desta tela vêm da API de homologação, sem preenchimentos artificiais.</p>
    </header>

    {!options.length ? <p className={styles.empty} role="status">Nenhum ministério está associado a esta conta. Solicite à secretaria que revise suas permissões.</p> :
      <>
        <label className={styles.selector}>Ministério
          <select value={ministryId} onChange={e=>setChosenId(e.target.value)}>
            {options.map(row=><option key={word(row.id)} value={word(row.id)}>{word(row.name)||"Ministério sem nome"}</option>)}
          </select>
        </label>
        <div className={styles.cards}>
          <article><span>Área autorizada</span><strong>{word(ministry?.name)||"Meu ministério"}</strong><small>Consulta vinculada à sua sessão</small></article>
          <article><span>Equipe no fluxo de voluntariado</span><strong>{state==="ready"?team.length:"—"}</strong><small>Somente etapas com vínculo registrado</small></article>
          <article><span>Interesses para acompanhar</span><strong>{state==="ready"?pending.length:"—"}</strong><small>Manifestações abertas neste ministério</small></article>
        </div>
        <div className={styles.columns}>
          <section className={styles.listPanel} aria-label="Pessoas na jornada do ministério">
            <div className={styles.panelHeading}><h3>Equipe e pessoas em acompanhamento</h3>
              <p>Os registros abaixo são do voluntariado deste ministério. O cadastro integral de participantes exige um vínculo ministerial específico no backend.</p></div>
            {state==="loading"&&<p role="status" className={styles.empty}>Consultando registros autorizados…</p>}
            {state==="error"&&<p role="alert" className={styles.empty}>{message}</p>}
            {state==="ready"&&<>
              {!records.length&&<p className={styles.empty}>Ainda não há registros de voluntariado para este ministério.</p>}
              <div className={styles.people}>
                {[...team,...pending].map((person,i)=><div className={styles.person} key={word(person.id)||i}>
                  <span className={styles.personAvatar} aria-hidden="true">{(word(person.displayName)||"P").slice(0,1).toLocaleUpperCase("pt-BR")}</span>
                  <div><strong>{word(person.displayName)||"Pessoa sem identificação pública"}</strong><small>{inTeam(person)?"Integração à equipe":"Interesse em acompanhamento"}</small></div>
                  <span className={styles.state}>{inTeam(person)?"Equipe":"Em análise"}</span>
                </div>)}
              </div>
            </>}
          </section>
          <aside className={styles.financePanel} aria-label="Caixa do ministério">
            <span>FINANÇAS DO MINISTÉRIO</span>
            <h3>Caixa e ofertas</h3>
            <p>O saldo precisa vir de lançamentos conciliados e filtrados pelo centro de custo do seu ministério.</p>
            <div className={styles.unavailable}><strong>Saldo ainda não disponível</strong><small>A API financeira atual só autoriza a Tesouraria. Não mostramos saldo fictício nem damos acesso a outros ministérios.</small></div>
            <p className={styles.financeNote}>Próxima integração técnica: extrato e saldo por ministério, com permissão de leitura exclusiva do líder autorizado e auditoria da Tesouraria.</p>
          </aside>
        </div>
      </>
    }
  </section>;
}
