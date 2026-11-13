"use client";

import { useState, type FormEvent } from "react";
import { apiPatch } from "../lib/api";
import { churchLocalToISO, dasError, formatChurchDate, type DasRecord } from "../lib/das-operations";
import { eventStatusLabel } from "./events-management/calendar";
import { EventAgenda } from "./events-management/EventAgenda";
import { useFeedback } from "./ui/FeedbackProvider";
import styles from "./events-board.module.css";

type Props={rows:DasRecord[];token:string;refresh:()=>void};
const asText=(v:unknown)=>typeof v==="string"?v.trim():"";
const getId=(v:unknown)=>asText(v);

type EventDraft={name:string;slug:string;description:string;locationText:string;startsAt:string;endsAt:string};
const EMPTY:EventDraft={name:"",slug:"",description:"",locationText:"",startsAt:"",endsAt:""};
function fromRecord(r:DasRecord):EventDraft{
  return {
    name:asText(r.name),slug:asText(r.slug),description:asText(r.description),
    locationText:asText(r.locationText),startsAt:"",endsAt:"",
  };
}
function patch(d:EventDraft,source:DasRecord):Record<string,unknown>{
  const body:Record<string,unknown>={};
  for(const key of ["name","slug","description","locationText"] as const){
    if(d[key]!==asText(source[key])) body[key]=d[key];
  }
  if(d.startsAt){const iso=churchLocalToISO(d.startsAt);if(iso)body.startsAt=iso;}
  if(d.endsAt){const iso=churchLocalToISO(d.endsAt);if(iso)body.endsAt=iso;}
  return body;
}
export function EventsBoard({rows,token,refresh}:Props){
  const { showFeedback } = useFeedback();
  const [selected,setSelected]=useState<string|null>(null);
  const [draft,setDraft]=useState<EventDraft>(EMPTY);
  const [busy,setBusy]=useState(false);
  const selectedRow=rows.find(row=>getId(row.id)===selected);
  const agenda=rows.flatMap(row=>{
    const id=getId(row.id);
    return id?[{id,name:asText(row.name)||"Evento",status:asText(row.status)||"DRAFT",startsAt:asText(row.startsAt)}]:[];
  });
  function begin(row:DasRecord){
    setSelected(getId(row.id));setDraft(fromRecord(row));
  }
  function update<K extends keyof EventDraft>(key:K,value:EventDraft[K]){
    setDraft(state=>({...state,[key]:value}));
  }
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!selected||!selectedRow||busy)return;
    const status=asText(selectedRow.status);
    if(status!=="DRAFT"){showFeedback({ tone: "warning", title: "Edição indisponível", message: "Somente eventos em rascunho podem ser alterados nesta tela." });return;}
    if(draft.name.trim().length<3||!/^[a-z0-9-]{3,80}$/.test(draft.slug)){
      showFeedback({ tone: "error", title: "Confira o evento", message: "Informe um nome e um identificador válido com letras minúsculas, números e hífens." });return;
    }
    if(draft.startsAt&&!churchLocalToISO(draft.startsAt)){showFeedback({ tone: "error", title: "Confira a data", message: "Informe uma data inicial válida." });return;}
    if(draft.endsAt&&!churchLocalToISO(draft.endsAt)){showFeedback({ tone: "error", title: "Confira a data", message: "Informe uma data final válida." });return;}
    const start=draft.startsAt?Date.parse(churchLocalToISO(draft.startsAt)!):Date.parse(asText(selectedRow.startsAt));
    const end=draft.endsAt?Date.parse(churchLocalToISO(draft.endsAt)!):Date.parse(asText(selectedRow.endsAt));
    if(Number.isFinite(end)&&Number.isFinite(start)&&end<start){showFeedback({ tone: "error", title: "Confira as datas", message: "O encerramento precisa acontecer após o início do evento." });return;}
    const body=patch(draft,selectedRow);
    if(Object.keys(body).length===0){showFeedback({ tone: "info", title: "Nenhuma alteração", message: "Não há mudanças para salvar neste rascunho." });return;}
    setBusy(true);
    try{await apiPatch("/events/"+encodeURIComponent(selected),token,body);
      refresh();setSelected(null);setDraft(EMPTY);showFeedback({ tone: "success", title: "Rascunho atualizado", message: "As alterações do evento foram salvas. Ele não foi publicado." });
    }catch(e){showFeedback({ tone: "error", title: "Não foi possível salvar", message: dasError(e) });}
    finally{setBusy(false);}
  }
  return <section className={styles.board} aria-labelledby="eventos-heading">
    <div className={styles.intro}><span>HOMOLOGAÇÃO</span>
      <h2 id="eventos-heading">Agenda e preparação de eventos</h2>
      <p>Rascunhos podem ser revisados aqui. O que já foi publicado permanece visível e não é reescrito por esta tela.</p></div>
    <EventAgenda events={agenda} selectedId={selected??""} onChoose={(id)=>{
      const row=rows.find(item=>getId(item.id)===id);
      if(row&&asText(row.status)==="DRAFT") begin(row);
    }}/>
    <div className={styles.stack}>
      {rows.length===0&&<p className={styles.empty}>Nenhum evento nesta agenda.</p>}
      {rows.map((row,i)=>{
        const status=asText(row.status),editable=status==="DRAFT",isSelected=selected===getId(row.id);
        return <article className={styles.item} key={getId(row.id)||i}>
          <div className={styles.itemHead}>
            <div><strong>{asText(row.name)||"Evento"}</strong>
              <small>{formatChurchDate(row.startsAt)} · {eventStatusLabel(status)}</small></div>
            {editable?<button type="button" className={styles.quiet} disabled={!getId(row.id)||busy}
              onClick={()=>isSelected?setSelected(null):begin(row)} aria-expanded={isSelected}>
              {isSelected?"Fechar":"Revisar rascunho"}</button>:
              <small className={styles.locked}>Publicado ou encerrado: esta tela não altera o encontro.</small>}
          </div>
          {isSelected&&editable&&<form className={styles.form} onSubmit={e=>void save(e)}>
            <h3>Revisar evento</h3>
            <p>Salvar mantém o rascunho. A publicação acontece na gestão de eventos, com autorização.</p>
            <label>Nome<input required value={draft.name} onChange={e=>update("name",e.target.value)} maxLength={140}/></label>
            <label>Identificador<input required value={draft.slug} onChange={e=>update("slug",e.target.value)} maxLength={80} pattern="[a-z0-9-]+"/></label>
            <label>Local público<input value={draft.locationText} onChange={e=>update("locationText",e.target.value)} maxLength={180}/></label>
            <label>Nova data de início<input type="datetime-local" value={draft.startsAt} onChange={e=>update("startsAt",e.target.value)}/></label>
            <label>Nova data de término<input type="datetime-local" value={draft.endsAt} onChange={e=>update("endsAt",e.target.value)}/></label>
            <label>Descrição sem dados pessoais<textarea rows={3} value={draft.description} onChange={e=>update("description",e.target.value)} maxLength={1200}/></label>
            <button type="submit" disabled={busy||!draft.name.trim()||!draft.slug.trim()}>Salvar rascunho</button>
          </form>}
        </article>;
      })}
    </div>
  </section>;
}
