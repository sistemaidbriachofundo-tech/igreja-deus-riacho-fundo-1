"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import { dasError, formatChurchDate, readDasRows, type DasRecord } from "../lib/das-operations";
import { PersonPicker } from "./PersonPicker";
import s from "./operations-expansion.module.css";

type Props={assets:DasRecord[];token:string;roles:readonly string[];refresh:()=>void};
type AssetStatus="ACTIVE"|"MAINTENANCE"|"LOST"|"DISPOSED";
const states:{id:AssetStatus;label:string}[]=[
  {id:"ACTIVE",label:"Em uso"},{id:"MAINTENANCE",label:"Em manutenção"},
  {id:"LOST",label:"Não localizado"},{id:"DISPOSED",label:"Baixado"},
];
const str=(x:unknown)=>typeof x==="string"?x:"";
const safe=(x:unknown,fallback="Não informado")=>str(x).trim()||fallback;
const label=(state:unknown)=>states.find(x=>x.id===state)?.label??"Situação não definida";
const synthetic=(name:string)=>/^TESTE(?:\s|[-_]|$)/i.test(name.trim())&&name.trim().length>=7;
export function canChangeAssetStatus(before:unknown,after:AssetStatus,reason:string){
  if(before===after)return false;
  return reason.trim().length>=8;
}

export function AssetsBoard({assets,token,roles,refresh}:Props){
  const [filter,setFilter]=useState("ALL");
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState("");
  const [detail,setDetail]=useState<DasRecord|null>(null);
  const [history,setHistory]=useState<DasRecord[]>([]);
  const [detailState,setDetailState]=useState<"idle"|"loading"|"ready"|"error">("idle");
  const [detailError,setDetailError]=useState("");
  const [revision,setRevision]=useState(0);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [name,setName]=useState("");
  const [code,setCode]=useState("");
  const [location,setLocation]=useState("");
  const [description,setDescription]=useState("");
  const [owner,setOwner]=useState("");
  const [nextStatus,setNextStatus]=useState<AssetStatus>("ACTIVE");
  const [newLocation,setNewLocation]=useState("");
  const [newOwner,setNewOwner]=useState("");
  const [reason,setReason]=useState("");
  const [note,setNote]=useState("");

  const stats=useMemo(()=>({
    total:assets.length,active:assets.filter(x=>x.status==="ACTIVE").length,
    maintenance:assets.filter(x=>x.status==="MAINTENANCE").length,
    alert:assets.filter(x=>x.status==="LOST").length,
  }),[assets]);
  const visible=useMemo(()=>assets.filter(x=>{
    if(filter!=="ALL"&&x.status!==filter)return false;
    const term=query.trim().toLocaleLowerCase("pt-BR");
    if(!term)return true;
    return [x.name,x.code,x.location,x.status].some(v=>str(v).toLocaleLowerCase("pt-BR").includes(term));
  }),[assets,filter,query]);

  useEffect(()=>{
    if(!selected){setDetail(null);setHistory([]);setDetailState("idle");return;}
    let cancelled=false;
    setDetail(null);setHistory([]);setDetailState("loading");setDetailError("");
    void Promise.all([
      apiGet<unknown>("/assets/"+encodeURIComponent(selected),token),
      apiGet<unknown>("/assets/"+encodeURIComponent(selected)+"/history",token)
    ]).then(([body,trail])=>{
      if(!body||typeof body!=="object"||Array.isArray(body)||typeof (body as DasRecord).id!=="string")
        throw new Error("Formato inesperado na resposta da API.");
      const record=body as DasRecord;const rows=readDasRows(trail,"history");
      if(cancelled)return;
      setDetail(record);setHistory(rows);setDetailState("ready");
      setNextStatus(states.some(item=>item.id===record.status)?record.status as AssetStatus:"ACTIVE");
      setNewLocation(str(record.location));setNewOwner(str(record.responsiblePersonId));setReason("");
    }).catch(error=>{if(!cancelled){setDetailError(dasError(error));setDetailState("error");}});
    return()=>{cancelled=true;};
  },[selected,token,revision]);

  async function action(endpoint:string,body:unknown,method:"POST"|"PATCH",onSuccess:()=>void){
    if(busy)return;
    setBusy(true);setNotice("");
    try{
      if(method==="PATCH")await apiPatch(endpoint,token,body);
      else await apiPost(endpoint,token,body);
      onSuccess();
      setNotice("Atualização confirmada pela API HML e registrada para auditoria.");
      refresh();setRevision(v=>v+1);
    }catch(error){setNotice(dasError(error));}
    finally{setBusy(false);}
  }

  function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!synthetic(name)){setNotice("Na homologação, o nome do bem deve começar por TESTE.");return;}
    void action("/assets",{
      name:name.trim(),status:"ACTIVE",...(code.trim()?{code:code.trim()}:{}),
      ...(location.trim()?{location:location.trim()}:{}),
      ...(description.trim()?{description:description.trim()}:{}),
      ...(owner?{responsiblePersonId:owner}:{}),
    },"POST",()=>{
      setName("");setCode("");setLocation("");setDescription("");setOwner("");
    });
  }
  function change(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!detail||!selected)return;
    const statusChanged=detail.status!==nextStatus;
    if(statusChanged&&!canChangeAssetStatus(detail.status,nextStatus,reason)){
      setNotice("Para alterar a situação, registre uma justificativa com pelo menos oito caracteres.");return;
    }
    const body:Record<string,unknown>={};
    if(statusChanged)body.status=nextStatus;
    if(newLocation.trim()!==str(detail.location))body.location=newLocation.trim();
    if(newOwner!==str(detail.responsiblePersonId))body.responsiblePersonId=newOwner||null;
    if(reason.trim())body.note=reason.trim();
    if(Object.keys(body).length===0){setNotice("Nenhuma alteração foi informada.");return;}
    if((nextStatus==="DISPOSED"||nextStatus==="LOST")&&statusChanged
      &&!window.confirm("Confirma esta mudança patrimonial sensível na base fictícia?"))return;
    void action("/assets/"+encodeURIComponent(selected),body,"PATCH",()=>setReason(""));
  }
  function addHistory(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!selected||note.trim().length<8){setNotice("Escreva uma observação com pelo menos oito caracteres.");return;}
    void action("/assets/"+encodeURIComponent(selected)+"/history",{note:note.trim()},"POST",()=>setNote(""));
  }
  return <section className={s.board} aria-labelledby="asset-heading">
    <header className={s.heading}><div><span>RF-030 · GOVERNANÇA E PATRIMÔNIO</span>
      <h2 id="asset-heading">Inventário sob responsabilidade</h2>
      <p>Bens, localizações, responsáveis, manutenção e trilha de alterações por congregação.</p>
    </div><span className={s.pill}>Auditoria obrigatória · HML</span></header>
    <div className={s.statGrid}>
      <div><strong>{stats.total}</strong><span>Itens inventariados</span></div>
      <div><strong>{stats.active}</strong><span>Em uso</span></div>
      <div><strong>{stats.maintenance}</strong><span>Manutenção</span></div>
      <div><strong>{stats.alert}</strong><span>Não localizados</span></div>
    </div>
    {notice&&<p role="status" className={s.notice}>{notice}</p>}
    <div className={s.split}>
      <div className={s.panel}>
        <div className={s.panelTop}><h3>01 / Inventário</h3><small>{visible.length} registros</small></div>
        <div className={s.filterRow}>
          <label>Busca
            <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
              placeholder="Nome, código ou localização"/>
          </label>
          <label>Situação
            <select value={filter} onChange={e=>setFilter(e.target.value)}>
              <option value="ALL">Todas as situações</option>
              {states.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
            </select>
          </label>
        </div>
        <div className={s.list}>
          {visible.length===0&&<p className={s.empty}>Nenhum bem encontrado. A lista reflete apenas a API HML.</p>}
          {visible.map(asset=><button className={selected===asset.id?s.selectedItem:s.itemButton}
            key={str(asset.id)} type="button"
            onClick={()=>{setSelected(str(asset.id));setNotice("");}}
            aria-pressed={selected===asset.id}>
            <span><strong>{safe(asset.name)}</strong><small>{safe(asset.code,"Sem código")} · {safe(asset.location,"Localização não cadastrada")}</small></span>
            <span className={s.status}>{label(asset.status)}</span>
          </button>)}
        </div>
        <form className={s.form} onSubmit={create}>
          <h4>Adicionar bem fictício</h4>
          <label>Nome<input required maxLength={140} value={name}
            onChange={e=>setName(e.target.value)} placeholder="TESTE — Cadeira do auditório"/></label>
          <div className={s.filterRow}>
            <label>Código<input maxLength={70} value={code} onChange={e=>setCode(e.target.value)} placeholder="TESTE-PAT-001"/></label>
            <label>Localização<input maxLength={140} value={location} onChange={e=>setLocation(e.target.value)} placeholder="Sala de teste"/></label>
          </div>
          <label>Descrição<textarea rows={2} maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} /></label>
          <PersonPicker token={token} roles={roles} label="Responsável fictício (opcional)" value={owner} onChange={setOwner}/>
          <button type="submit" disabled={busy}>Cadastrar no inventário HML</button>
        </form>
      </div>
      <div className={s.panel}>
        <h3>02 / Histórico e movimentações</h3>
        {!selected?<p className={s.empty}>Selecione um bem do inventário para consultar seu histórico auditável.</p>:
        detailState==="loading"?<p role="status" className={s.empty}>Carregando cadastro e histórico…</p>:
        detailState==="error"?<div role="alert" className={s.error}>{detailError}
          <button type="button" onClick={()=>setRevision(v=>v+1)}>Tentar novamente</button></div>:
        detailState==="ready"&&detail&&<>
          <div className={s.context}><strong>{safe(detail.name)}</strong>
            <span>{safe(detail.code,"Sem identificação")} · {label(detail.status)}</span>
            <small>{safe(detail.description,"Sem descrição cadastrada")}</small>
          </div>
          <form className={s.form} onSubmit={change}>
            <h4>Atualizar responsabilidade</h4>
            <label>Situação<select value={nextStatus} onChange={e=>setNextStatus(e.target.value as AssetStatus)}>
              {states.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
            <label>Localização<input maxLength={140} value={newLocation}
              onChange={e=>setNewLocation(e.target.value)} placeholder="Nova localização fictícia"/></label>
            <PersonPicker token={token} roles={roles} label="Responsável cadastrado"
              value={newOwner} onChange={setNewOwner}/>
            <label>Justificativa para auditoria<textarea rows={2} maxLength={500}
              required={detail.status!==nextStatus} value={reason}
              onChange={e=>setReason(e.target.value)} placeholder="Explique a mudança de estado ou local"/></label>
            <button type="submit" disabled={busy}>Salvar alterações</button>
          </form>
          <div className={s.subsection}>
            <h4>Histórico de alterações</h4>
            <div className={s.list}>
              {history.length===0&&<p className={s.empty}>Ainda não há eventos de histórico.</p>}
              {history.map((row,i)=><article className={s.item} key={str(row.id)||i}>
                <div><strong>{safe(row.kind,"Registro")}</strong>
                  <small>{formatChurchDate(str(row.recordedAt))}</small>
                  {row.note&&<p>{safe(row.note)}</p>}
                  {row.toStatus&&<small>Nova situação: {label(row.toStatus)}</small>}
                </div>
              </article>)}
            </div>
            <form className={s.form} onSubmit={addHistory}>
              <h4>Anotação de auditoria</h4>
              <label>Observação<textarea required minLength={8} maxLength={500} rows={3}
                value={note} onChange={e=>setNote(e.target.value)}
                placeholder="TESTE — Bem conferido na vistoria"/></label>
              <button type="submit" disabled={busy}>Registrar observação</button>
            </form>
          </div>
        </>}
      </div>
    </div>
    <p className={s.foot}>Este inventário exige autenticação e escopo por congregação. A interface não executa baixas reais sem confirmação e trilha de auditoria.</p>
  </section>;
}
