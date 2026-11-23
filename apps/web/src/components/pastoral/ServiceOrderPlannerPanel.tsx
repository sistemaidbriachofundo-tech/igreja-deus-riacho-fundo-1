"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost, ApiRequestError } from "../../lib/api";
import { AppNavLink } from "../AppShell";
import s from "./service-order-planner.module.css";

type CultWindow = { weekday: number; time: string; title: string };
type ServiceException = { serviceAt: string; kind: "SKIP" | "SPECIAL"; note: string; title?: string };
type Rules = {
  services: CultWindow[]; minIntervalDays: number; maxMonthlyAssignments: number;
  avoidDoubleDirectorPreacher: boolean; respectAvailability: boolean;
  requireConfirmedRoster: boolean; blessing: "LEADERSHIP" | "PREACHER" | "DESIGNATED";
  exceptions?: ServiceException[];
};
type Moment = { title: string; minutes: number; responsible: string | null; responsiblePersonId: string | null; notes?: string | null };
type Planned = { serviceAt: string; title: string; alreadyExists: boolean; skipped?: boolean; warnings: string[]; sourceRosterIds: string[]; items: Moment[] };
type Preview = { year: number; month: number; rows: Planned[]; summary: { total: number; proposed: number; existing: number; withWarnings: number }; policy: { updatedAt: string | null; rules: Rules } };
type PolicyResponse = { rules: Rules; updatedAt: string | null };
type EligiblePerson = { id: string; displayName: string; roles: string[]; sources: string[]; isMinor: boolean };
type PeopleResponse = { people: EligiblePerson[]; qualified: number; notice: string };
type Order = { id:string; title:string; serviceAt:string; status:"DRAFT"|"APPROVED"|"PUBLISHED";items:Array<{title:string;minutes?:number|null;responsible?:string|null}> };
type View = "calendar" | "rules" | "live";
const weekdays = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const local = new Intl.DateTimeFormat("pt-BR",{ timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short" });
const monthName = new Intl.DateTimeFormat("pt-BR",{ timeZone:"America/Sao_Paulo",month:"long",year:"numeric" });
function message(error: unknown) {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "Sua sessão expirou; entre novamente no sistema.";
    if (error.status === 403) return "Sua função não permite consultar ou alterar estas regras.";
    if (error.status === 409) return "As regras ou ordens mudaram desde a última consulta. Atualize e tente novamente.";
    if (error.status === 404) return "O serviço de planejamento ainda não está disponível nesta implantação.";
    if (error.kind === "network" || error.kind === "timeout") return "Não foi possível conectar à API de Ordem de Culto. Tente novamente.";
  }
  return "Não foi possível concluir a operação. Atualize e tente novamente.";
}
function currentMonth() {
  const p = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).formatToParts(new Date());
  const v=Object.fromEntries(p.map(x=>[x.type,x.value])); return v.year+"-"+v.month;
}
function totalMinutes(rows: Moment[]) { return rows.reduce((n,x)=>n+(x.minutes||0),0); }
function timelineStart(serviceAt: string, items: Moment[]) {
  const minus=items[0]?.title.toLowerCase().includes("prel")?Math.max(0,items[0].minutes):0;
  return Date.parse(serviceAt)-minus*60_000;
}
function displayTime(epoch:number){return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}).format(new Date(epoch));}

export function ServiceOrderPlannerPanel({ token, canEdit, view, orders, onGenerated }:{
  token:string;canEdit:boolean;view:View;orders:Order[];onGenerated:()=>void;
}) {
  const [period,setPeriod]=useState(currentMonth);
  const [rules,setRules]=useState<Rules|null>(null);
  const [storedAt,setStoredAt]=useState<string|null>(null);
  const [plan,setPlan]=useState<Preview|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [generationConfirmed,setGenerationConfirmed]=useState(false);
  const [liveId,setLiveId]=useState("");
  const [clock,setClock]=useState(()=>Date.now());
  const [revision,setRevision]=useState(0);
  const [catalog,setCatalog]=useState<PeopleResponse|null>(null);
  useEffect(()=>{
    if(view!=="calendar")return;
    let active=true;
    void apiGet<PeopleResponse>("/service-orders/planning/people",token,{fresh:true})
      .then(p=>{if(active)setCatalog(p);})
      .catch(()=>{if(active)setCatalog(null);});
    return()=>{active=false;};
  },[token,view,revision]);

  const load = useCallback(async () => {
    setError("");setNotice("");
    try {
      const config=await apiGet<PolicyResponse>("/service-orders/planning/rules",token,{fresh:true});
      setRules(config.rules);setStoredAt(config.updatedAt);
    } catch(e){setError(message(e));}
  },[token]);
  useEffect(()=>{void load();},[load,revision]);
  useEffect(()=>{
    if(view!=="calendar"||!rules)return;
    let live=true;
    setPlan(null);
    const [year,month]=period.split("-").map(Number);
    void apiGet<Preview>(`/service-orders/planning/preview?year=${year}&month=${month}`,token,{fresh:true})
      .then(result=>{if(live){setPlan(result);setError("");setGenerationConfirmed(false);}})
      .catch(e=>{if(live){setError(message(e));setPlan(null);}});
    return()=>{live=false};
  },[token,period,rules,view,revision]);
  useEffect(()=>{
    if(view!=="live")return;
    const id=setInterval(()=>setClock(Date.now()),1000);
    return()=>clearInterval(id);
  },[view]);
  const published=useMemo(()=>orders.filter(o=>o.status==="PUBLISHED").sort((a,b)=>a.serviceAt.localeCompare(b.serviceAt)),[orders]);
  const viewing=published.find(x=>x.id===liveId)??published[0]??null;
  const [year,month]=period.split("-").map(Number);

  async function persistRules(){
    if(!rules||busy||!canEdit)return;
    setBusy(true);setError("");setNotice("");
    try{
      const saved=await apiPatch<PolicyResponse>("/service-orders/planning/rules",token,{rules,expectedUpdatedAt:storedAt});
      setRules(saved.rules);setStoredAt(saved.updatedAt);setNotice("Regras salvas para esta congregação. As OCs publicadas não foram alteradas.");setRevision(n=>n+1);
    }catch(e){setError(message(e));}finally{setBusy(false);}
  }
  async function generate(){
    if(!plan||!canEdit||busy||!generationConfirmed)return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await apiPost<{created:number;skipped:number;previewWarnings:number}>("/service-orders/planning/generate",token,{
        year,month,expectedPolicyUpdatedAt:storedAt,
      });
      setNotice(`${result.created} ordem(ns) criada(s) em RASCUNHO; ${result.skipped} existente(s) preservada(s). Revise os avisos antes de aprovar.`);
      setGenerationConfirmed(false);setRevision(n=>n+1);onGenerated();
    }catch(e){setError(message(e));}finally{setBusy(false);}
  }

  return <div className={s.panel}>
    {error&&<div className={s.error} role="alert">{error} <button type="button" onClick={()=>setRevision(v=>v+1)}>Tentar novamente</button></div>}
    {notice&&<div className={s.notice} role="status">{notice}</div>}
    {view==="calendar"&&<section className={s.layout} aria-label="Calendário mensal de Ordens de Culto">
      <header className={s.heading}>
        <div><span className={s.overline}>PLANEJAMENTO DE CELEBRAÇÕES</span>
          <h2>Calendário e geração mensal</h2>
          <p>Prévia baseada em escalas publicadas, confirmações, restrições e histórico da congregação.</p></div>
        <label className={s.monthPick}>Mês do planejamento<input type="month" min="2025-01" max="2035-12" value={period} onChange={e=>setPeriod(e.target.value)}/></label>
      </header>
      {plan ? <>
        <div className={s.kpis}>
          {[
            {v:plan.summary.total,l:"Cultos previstos"},
            {v:plan.summary.proposed,l:"Novos rascunhos"},
            {v:plan.summary.existing,l:"OCs existentes"},
            {v:plan.summary.withWarnings,l:"Cultos para revisar"},
          ].map((x,i)=><div key={x.l} className={s.kpi} data-accent={i===3?"warning":i===1?"good":"neutral"}><strong>{x.v}</strong><span>{x.l}</span></div>)}
        </div>
        <section className={s.personnel} aria-labelledby="oc-team-heading">
          <header><div><h3 id="oc-team-heading">Responsáveis cadastrados na congregação</h3>
            <p>Pessoas com função eclesiástica ou liderança nos ministérios. O cadastro não substitui uma escala confirmada.</p></div>
            <span>{catalog ? catalog.qualified+" habilitados para o rodízio" : "Consultando cadastro…"}</span>
          </header>
          {catalog && <div className={s.personnelGrid}>
            {([
              ["pastor","Pastor"],["director","Direção"],["preacher","Pregação"],
              ["praise","Louvor"],["welcome","Acolhimento"],["media","Mídia"],
              ["generosity","Generosidade"],["prayer","Oração e bênção"],["instrumental","Instrumental"],
            ] as const).map(([role,label])=>{
              const registered=catalog.people.filter(p=>p.roles.includes(role));
              return <div className={s.personnelGroup} key={role}>
                <strong>{label}<span>{registered.length}</span></strong>
                {registered.length>0 ? <ul>{registered.slice(0,5).map(p=>
                  <li key={p.id}>{p.displayName}<small>{p.sources[0]??"Cadastro ativo"}</small></li>)}</ul>
                  : <p>Não há pessoa habilitada nesta função. Vincule a função no cadastro ou defina no roteiro.</p>}
                {registered.length>5 && <p>+ {registered.length-5} integrantes cadastrados</p>}
              </div>;
            })}
          </div>}
          <p className={s.personnelFootnote}>
            Se o gerador indicar “A definir”, vá à aba <strong>Roteiro</strong>, edite a ordem e selecione a pessoa cadastrada.
            A aba <strong>Integrantes</strong> permite definir as funções autorizadas, inclusive Pastor e Mídia.
            Pessoas fora da escala confirmada precisam de validação pastoral antes da publicação.
          </p>
        </section>
        <div className={s.schedule}>
          <div className={s.scheduleHead}><h3>{monthName.format(new Date(plan.rows[0]?.serviceAt??new Date()))}</h3>
            <span>{plan.summary.total} encontros</span></div>
          {plan.rows.map((row,i)=><article className={s.scheduleRow} key={row.serviceAt}>
            <div className={s.dateBlock}><strong>{new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit"}).format(new Date(row.serviceAt))}</strong><span>{new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",weekday:"short"}).format(new Date(row.serviceAt))}</span></div>
            <div className={s.scheduleText}><strong>{row.title}</strong><span>{local.format(new Date(row.serviceAt))} · {row.skipped?"Exceção registrada":row.alreadyExists?"OC já cadastrada":"Nova OC proposta"}</span>
              <details><summary>Ver roteiro e responsáveis</summary>
                <ol>{row.items.map((item,k)=><li key={k}>{item.title} <span>· {item.responsible??"A definir"} · {item.minutes} min</span></li>)}</ol>
                {row.warnings.length>0&&<ul className={s.warnings}>{row.warnings.map((w,k)=><li key={k}>{w}</li>)}</ul>}
              </details>
            </div>
            <div className={s.rowRight}><time>{displayTime(Date.parse(row.serviceAt))}</time>
              <span data-state={row.alreadyExists?"existing":row.warnings.length?"warn":"ready"}>{row.alreadyExists?"Existente":row.warnings.length?"Revisar":"Pronto"}</span>
            </div>
          </article>)}
        </div>
        {canEdit&&<div className={s.generate}>
          <div><strong>Gerar rascunhos para {period}</strong>
            <p>Datas existentes serão preservadas. Os responsáveis não confirmados ficam em branco para a liderança definir.</p>
            <label><input type="checkbox" checked={generationConfirmed} onChange={e=>setGenerationConfirmed(e.target.checked)}/> Confirmo que revisei a prévia e quero criar apenas os rascunhos.</label></div>
          <button type="button" disabled={busy||!generationConfirmed||!plan.summary.proposed} onClick={()=>void generate()}>{busy?"Gerando…":"Gerar mês"}</button>
        </div>}
      </>:<div className={s.loading} role="status">Consultando cultos, escalas e regras do mês…</div>}
    </section>}
    {view==="rules"&&<section className={s.layout} aria-label="Configuração do rodízio por congregação">
      <header className={s.heading}><div><span className={s.overline}>REGRAS DA CONGREGAÇÃO</span>
        <h2>Critérios do rodízio</h2><p>Aplicados somente às próximas prévias e gerações. Alterações exigem acesso pastoral.</p></div></header>
      {rules?<div className={s.rulesGrid}>
        <div className={s.ruleCard}><h3>Disponibilidade e prioridades</h3>
          <label className={s.switch}><input type="checkbox" checked={rules.respectAvailability} disabled={!canEdit||busy} onChange={e=>setRules({...rules,respectAvailability:e.target.checked})}/> Respeitar disponibilidade, impedimentos e preferências individuais</label>
          <label className={s.switch}><input type="checkbox" checked={rules.requireConfirmedRoster} disabled={!canEdit||busy} onChange={e=>setRules({...rules,requireConfirmedRoster:e.target.checked})}/> Utilizar somente pessoas confirmadas nas escalas</label>
          <label className={s.switch}><input type="checkbox" checked={rules.avoidDoubleDirectorPreacher} disabled={!canEdit||busy} onChange={e=>setRules({...rules,avoidDoubleDirectorPreacher:e.target.checked})}/> Impedir a mesma pessoa de dirigir e pregar no mesmo culto</label>
          <label>Intervalo mínimo entre cultos <strong>{rules.minIntervalDays} dias</strong>
            <input type="range" min={0} max={90} step={7} disabled={!canEdit||busy} value={rules.minIntervalDays} onChange={e=>setRules({...rules,minIntervalDays:Number(e.target.value)})}/></label>
          <label>Teto mensal de participações por pessoa
            <input type="number" min={1} max={15} value={rules.maxMonthlyAssignments} disabled={!canEdit||busy} onChange={e=>setRules({...rules,maxMonthlyAssignments:Number(e.target.value)})}/></label>
          <label>Quem realizará a bênção apostólica?
            <select value={rules.blessing} disabled={!canEdit||busy} onChange={e=>setRules({...rules,blessing:e.target.value as Rules["blessing"]})}>
              <option value="LEADERSHIP">Escolha da liderança em cada culto</option>
              <option value="PREACHER">Pregador do culto</option>
              <option value="DESIGNATED">Responsável designado manualmente</option>
            </select></label>
        </div>
        <div className={s.ruleCard}><h3>Cultos regulares</h3><p className={s.help}>Horários no fuso de Brasília. Eventos especiais continuam no editor manual.</p>
          {rules.services.map((row,i)=><div key={i} className={s.cultRow}>
            <label>Dia<select value={row.weekday} disabled={!canEdit||busy} onChange={e=>setRules({...rules,services:rules.services.map((x,k)=>k===i?{...x,weekday:Number(e.target.value)}:x)})}>
              {weekdays.map((name,index)=><option key={name} value={index}>{name}</option>)}</select></label>
            <label>Horário<input type="time" disabled={!canEdit||busy} value={row.time} onChange={e=>setRules({...rules,services:rules.services.map((x,k)=>k===i?{...x,time:e.target.value}:x)})}/></label>
            <label>Nome<input type="text" maxLength={90} disabled={!canEdit||busy} value={row.title} onChange={e=>setRules({...rules,services:rules.services.map((x,k)=>k===i?{...x,title:e.target.value}:x)})}/></label>
            {canEdit&&<button type="button" aria-label={`Remover horário ${i+1}`} disabled={busy||rules.services.length===1} onClick={()=>setRules({...rules,services:rules.services.filter((_,k)=>k!==i)})}>×</button>}
          </div>)}
          {canEdit&&<button type="button" className={s.add} disabled={busy||rules.services.length>=15} onClick={()=>setRules({...rules,services:[...rules.services,{weekday:0,time:"17:00",title:"Novo culto"}]})}>+ Adicionar horário</button>}
        </div>
        <form className={s.ruleCard} onSubmit={(event) => {
          event.preventDefault();
          if (!canEdit || busy) return;
          const form = new FormData(event.currentTarget);
          const serviceAt = String(form.get("exceptionDate") ?? "");
          const note = String(form.get("exceptionNote") ?? "").trim();
          const kind = String(form.get("exceptionKind") ?? "SPECIAL") === "SKIP" ? "SKIP" : "SPECIAL";
          const title = String(form.get("exceptionTitle") ?? "").trim();
          if (!serviceAt || !note) return;
          setRules({ ...rules, exceptions: [...(rules.exceptions ?? []), { serviceAt, kind, note, ...(title ? { title } : {}) }] });
          event.currentTarget.reset();
        }}>
          <h3>Exceções de um culto</h3>
          <p className={s.help}>Ficam na regra da congregação depois de salvar. Não gerar pula o culto; especial troca o nome.</p>
          <div className={s.cultRow}>
            <label>Data<input name="exceptionDate" type="date" required disabled={!canEdit || busy} /></label>
            <label>Tipo<select name="exceptionKind" defaultValue="SPECIAL" disabled={!canEdit || busy}><option value="SPECIAL">Programação especial</option><option value="SKIP">Não gerar</option></select></label>
            <label>Nome<input name="exceptionTitle" maxLength={80} disabled={!canEdit || busy} /></label>
            <label>Observação<input name="exceptionNote" required maxLength={280} disabled={!canEdit || busy} /></label>
          </div>
          {canEdit && <button type="submit" className={s.add} disabled={busy}>Registrar exceção</button>}
          <ul>{(rules.exceptions ?? []).map((item, index) => <li key={`${item.serviceAt}-${index}`}>{item.serviceAt} · {item.kind === "SKIP" ? "Não gerar" : "Especial"} · {item.note}
            {canEdit && <button type="button" aria-label={`Remover exceção ${index + 1}`} onClick={() => setRules({ ...rules, exceptions: (rules.exceptions ?? []).filter((_, itemIndex) => itemIndex !== index) })}>×</button>}</li>)}</ul>
        </form>
        {canEdit&&<button type="button" className={s.save} disabled={busy} onClick={()=>void persistRules()}>{busy?"Salvando…":"Salvar regras da congregação"}</button>}
      </div>:<div className={s.loading}>Consultando configurações…</div>}
    </section>}
    {view==="live"&&<section className={s.layout} aria-label="Modo Culto leitura">
      <header className={s.heading}><div><span className={s.overline}>ACOMPANHAMENTO DO CULTO</span>
        <h2>Modo Culto</h2><p>Roteiro publicado e relógio local. Sem edição nem sincronização entre dispositivos nesta versão.</p></div>
        <time className={s.clock}>{displayTime(clock)}</time>
      </header>
      {published.length===0?<div className={s.loading}>Nenhuma Ordem de Culto publicada disponível. A liderança deve aprovar e publicar um roteiro primeiro.</div>:<>
        <label className={s.selector}>Escolha a Ordem de Culto publicada
          <select value={viewing?.id??""} onChange={e=>setLiveId(e.target.value)}>
            {published.map(o=><option key={o.id} value={o.id}>{o.title} · {local.format(new Date(o.serviceAt))}</option>)}
          </select></label>
        {viewing&&<div className={s.liveSequence}>
          {viewing.items.map((item,i)=>{
            const start=timelineStart(viewing.serviceAt,viewing.items as Moment[]) + viewing.items.slice(0,i).reduce((sum,x)=>sum+(x.minutes??0)*60_000,0);
            const end=start+(item.minutes??0)*60_000;
            const phase=clock<start?"next":clock<end?"current":"done";
            return <div key={i} className={s.liveRow} data-phase={phase}><time>{displayTime(start)}</time>
              <div><strong>{item.title}</strong><span>{item.responsible??"Responsável a definir"} · {item.minutes??"?"} min</span></div>
              <span>{phase==="current"?"Agora":phase==="done"?"Concluído":"A seguir"}</span></div>;
          })}
        </div>}
      </>}
    </section>}
    <p className={s.footnote}>A Ordem de Culto e as escalas são informações internas; o acesso respeita o perfil e a congregação.</p>
  </div>;
}
