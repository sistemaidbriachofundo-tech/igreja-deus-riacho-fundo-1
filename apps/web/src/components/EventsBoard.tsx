"use client";

import { useState, type FormEvent } from "react";
import { apiPatch } from "../lib/api";
import { churchLocalToISO, dasError, formatChurchDate, type DasRecord } from "../lib/das-operations";
import styles from "./care-boards.module.css";

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
  const [selected,setSelected]=useState<string|null>(null);
  const [draft,setDraft]=useState<EventDraft>(EMPTY);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const selectedRow=rows.find(row=>getId(row.id)===selected);
  function begin(row:DasRecord){
    setSelected(getId(row.id));setDraft(fromRecord(row));setNotice("");
  }
  function update<K extends keyof EventDraft>(key:K,value:EventDraft[K]){
    setDraft(state=>({...state,[key]:value}));
  }
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!selected||!selectedRow||busy)return;
    const status=asText(selectedRow.status);
    if(status!=="DRAFT"){setNotice("Somente eventos em rascunho podem ser alterados nesta tela.");return;}
    if(draft.name.trim().length<3||!/^[a-z0-9-]{3,80}$/.test(draft.slug)){
      setNotice("Nome e identificador (slug) inválidos.");return;
    }
    if(draft.startsAt&&!churchLocalToISO(draft.startsAt)){setNotice("Data inicial inválida.");return;}
    if(draft.endsAt&&!churchLocalToISO(draft.endsAt)){setNotice("Data final inválida.");return;}
    const start=draft.startsAt?Date.parse(churchLocalToISO(draft.startsAt)!):Date.parse(asText(selectedRow.startsAt));
    const end=draft.endsAt?Date.parse(churchLocalToISO(draft.endsAt)!):Date.parse(asText(selectedRow.endsAt));
    if(Number.isFinite(end)&&Number.isFinite(start)&&end<start){setNotice("O encerramento precisa acontecer após o início.");return;}
    const body=patch(draft,selectedRow);
    if(Object.keys(body).length===0){setNotice("Nenhuma alteração identificada.");return;}
    setBusy(true);setNotice("");
    try{await apiPatch("/events/"+encodeURIComponent(selected),token,body);
      refresh();setSelected(null);setDraft(EMPTY);setNotice("Rascunho atualizado na base de homologação.");
    }catch(e){setNotice(dasError(e));}
    finally{setBusy(false);}
  }
  return <section className={styles.board} aria-labelledby="eventos-heading">
    <div className={styles.intro}><span>RF-020 A RF-022 · EVENTOS</span>
      <h2 id="eventos-heading">Agenda e preparação de eventos</h2>
      <p>Rascunhos podem ser revisados na HML. Inscrições, pagamentos, hospedagem, transporte e check-in ainda dependem de contratos próprios; não serão simulados como funcionais.</p></div>
    {notice&&<p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.stack}>
      {rows.length===0&&<p className={styles.empty}>Nenhum evento cadastrado na API.</p>}
      {rows.map((row,i)=>{
        const status=asText(row.status),editable=status==="DRAFT",isSelected=selected===getId(row.id);
        return <article className={styles.item} key={getId(row.id)||i}>
          <div className={styles.itemHead}>
            <div><strong>{asText(row.name)||"Evento"}</strong>
              <small>{formatChurchDate(row.startsAt)} · {status||"estado indisponível"}</small></div>
            {editable?<button type="button" disabled={!getId(row.id)||busy}
              onClick={()=>isSelected?setSelected(null):begin(row)} aria-expanded={isSelected}>
              {isSelected?"Fechar":"Revisar rascunho"}</button>:
              <small>Sem edição de eventos publicados ou arquivados por esta interface</small>}
          </div>
          {isSelected&&editable&&<form className={styles.form} onSubmit={e=>void save(e)}>
            <h3>Revisar evento (não publica)</h3>
            <label>Nome<input required value={draft.name} onChange={e=>update("name",e.target.value)} maxLength={140}/></label>
            <label>Identificador (slug)<input required value={draft.slug} onChange={e=>update("slug",e.target.value)} maxLength={80} pattern="[a-z0-9-]+"/></label>
            <label>Local público (opcional)<input value={draft.locationText} onChange={e=>update("locationText",e.target.value)} maxLength={180}/></label>
            <label>Nova data de início (opcional)<input type="datetime-local" value={draft.startsAt} onChange={e=>update("startsAt",e.target.value)}/></label>
            <label>Nova data de término (opcional)<input type="datetime-local" value={draft.endsAt} onChange={e=>update("endsAt",e.target.value)}/></label>
            <label>Descrição sem dados pessoais<textarea rows={3} value={draft.description} onChange={e=>update("description",e.target.value)} maxLength={1200}/></label>
            <button type="submit" disabled={busy||!draft.name.trim()||!draft.slug.trim()}>Salvar apenas rascunho</button>
          </form>}
        </article>;
      })}
    </div>
  </section>;
}
