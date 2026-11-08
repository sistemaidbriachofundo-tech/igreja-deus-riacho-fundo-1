"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api";
import { dasError, formatChurchDate, readDasRows, type DasRecord } from "../lib/das-operations";
import s from "./operations-expansion.module.css";

type Props={templates:DasRecord[];token:string};
type Providers={whatsapp?:unknown;email?:unknown;push?:unknown;liveWaba?:unknown;liveSmtp?:unknown;livePush?:unknown};
type Load={state:"idle"|"loading"|"ready"|"error";outbox:DasRecord[];providers:Providers;error:string};
const initial:Load={state:"idle",outbox:[],providers:{},error:""};
const str=(x:unknown)=>typeof x==="string"?x:"";
const safe=(x:unknown,fallback="Sem informação")=>str(x)||fallback;
const label=(x:unknown)=>x==="WHATSAPP"?"WhatsApp":x==="EMAIL"?"E-mail":x==="PUSH"?"Push":"Canal indefinido";
export function providerIsSafeMock(value:unknown){return value==="mock"||value==="noop";}
export function CommunicationsBoard({templates,token}:Props){
  const [load,setLoad]=useState<Load>(initial);
  const [reload,setReload]=useState(0);
  const [channel,setChannel]=useState("ALL");
  const [status,setStatus]=useState("ALL");
  const [detailId,setDetailId]=useState("");
  const [detail,setDetail]=useState<DasRecord|null>(null);
  const [detailError,setDetailError]=useState("");
  const [detailState,setDetailState]=useState<"idle"|"loading"|"ready"|"error">("idle");

  useEffect(()=>{
    let cancelled=false;
    setLoad({state:"loading",outbox:[],providers:{},error:""});
    void Promise.all([
      apiGet<unknown>("/channels/providers",token),
      apiGet<unknown>("/channels/outbox?limit=50",token),
    ]).then(([p,o])=>{
      if(!p||typeof p!=="object"||Array.isArray(p))throw new Error("Resposta inválida dos provedores.");
      const outbox=readDasRows(o,"outbox");
      if(!cancelled)setLoad({state:"ready",outbox,providers:p as Providers,error:""});
    }).catch(e=>{if(!cancelled)setLoad({state:"error",outbox:[],providers:{},error:dasError(e)});});
    return()=>{cancelled=true;};
  },[token,reload]);

  useEffect(()=>{
    if(!detailId){setDetail(null);setDetailState("idle");return;}
    let cancelled=false;setDetailState("loading");setDetail(null);setDetailError("");
    void apiGet<unknown>("/channels/outbox/"+encodeURIComponent(detailId),token)
      .then(body=>{
        if(!body||typeof body!=="object"||Array.isArray(body)||typeof (body as DasRecord).id!=="string")
          throw new Error("Formato inválido no histórico de envio.");
        if(!cancelled){setDetail(body as DasRecord);setDetailState("ready");}
      }).catch(e=>{if(!cancelled){setDetailError(dasError(e));setDetailState("error");}});
    return()=>{cancelled=true;};
  },[detailId,token,reload]);

  const outgoing=useMemo(()=>load.outbox.filter(row=>
    (channel==="ALL"||row.channel===channel)&&(status==="ALL"||row.status===status)),[load.outbox,channel,status]);
  const statuses=useMemo(()=>[...new Set(load.outbox.map(x=>str(x.status)).filter(Boolean))].sort(),[load.outbox]);
  const unsafeProvider=load.state==="ready"&&(
    !providerIsSafeMock(load.providers.whatsapp)||
    !providerIsSafeMock(load.providers.email)||
    !providerIsSafeMock(load.providers.push)||
    load.providers.liveWaba===true||load.providers.liveSmtp===true||load.providers.livePush===true
  );
  return <section className={s.board} aria-labelledby="communications-heading">
    <header className={s.heading}><div><span>RF-024–025 · COMUNICAÇÃO RESPONSÁVEL</span>
      <h2 id="communications-heading">Central de comunicação</h2>
      <p>Visibilidade sobre modelos e mensagens registradas, sem disparar notificações ou contornar consentimentos.</p>
    </div><span className={s.pill}>Somente consulta · sem disparos</span></header>
    <div className={s.statGrid}>
      <div><strong>{templates.length}</strong><span>Modelos na API</span></div>
      <div><strong>{load.state==="ready"?load.outbox.length:"—"}</strong><span>Registros no outbox</span></div>
      <div><strong>{load.state==="ready"?load.outbox.filter(x=>x.status==="SENT").length:"—"}</strong><span>Marcados como enviados</span></div>
      <div><strong>{load.state==="ready"?load.outbox.filter(x=>["FAILED","BLOCKED"].includes(str(x.status))).length:"—"}</strong><span>Com falha ou bloqueio</span></div>
    </div>
    {load.state==="loading"&&<p role="status" className={s.empty}>Consultando provedores e mensagens autorizadas…</p>}
    {load.state==="error"&&<div role="alert" className={s.error}><strong>Comunicação não disponível nesta HML.</strong>
      <p>{load.error} Nenhum envio foi feito.</p><button type="button" onClick={()=>setReload(x=>x+1)}>Tentar novamente</button>
    </div>}
    {load.state==="ready"&&<>
      {unsafeProvider?<p role="alert" className={s.error}>O backend não confirmou modo MOCK/NOOP para todos os canais. As ações de envio estão bloqueadas nesta interface.</p>:
        <p className={s.notice} role="status">Provedores de testes confirmados pela API: nenhuma mensagem será enviada por esta tela.</p>}
      <div className={s.split}>
        <div className={s.panel}>
          <div className={s.panelTop}><h3>01 / Modelos de comunicação</h3><small>{templates.length} modelos</small></div>
          <div className={s.list}>
            {templates.length===0&&<p className={s.empty}>Nenhum modelo disponível na API de homologação.</p>}
            {templates.map((template,index)=><article className={s.item} key={str(template.id)||index}>
              <div><strong>{safe(template.name,"Modelo sem título")}</strong>
                <small>{label(template.channel)} · {safe(template.code,"Sem código")} · {template.active===false?"Desativado":"Ativo"}</small>
              </div>
            </article>)}
          </div>
          <p className={s.help}>A edição de templates e o envio em lote exigirão autorização separada e revisão do consentimento de cada destinatário.</p>
          <div className={s.panelTop}><h3>02 / Provedores configurados</h3></div>
          <div className={s.list}>
            {(["whatsapp","email","push"] as const).map(key=><div key={key} className={s.item}>
              <strong>{key==="whatsapp"?"WhatsApp":key==="email"?"E-mail":"Push"}</strong>
              <span className={s.status}>{safe(load.providers[key],"Indefinido").toUpperCase()}</span>
            </div>)}
          </div>
        </div>
        <div className={s.panel}>
          <div className={s.panelTop}><h3>03 / Histórico de mensagens</h3>
            <button type="button" className={s.outline} onClick={()=>setReload(x=>x+1)}>Atualizar</button>
          </div>
          <div className={s.filterRow}>
            <label>Canal<select value={channel} onChange={e=>setChannel(e.target.value)}>
              <option value="ALL">Todos os canais</option>
              <option value="WHATSAPP">WhatsApp</option><option value="EMAIL">E-mail</option><option value="PUSH">Push</option>
            </select></label>
            <label>Situação<select value={status} onChange={e=>setStatus(e.target.value)}>
              <option value="ALL">Todos os status</option>
              {statuses.map(x=><option key={x} value={x}>{x}</option>)}
            </select></label>
          </div>
          <div className={s.list}>
            {outgoing.length===0&&<p className={s.empty}>Nenhuma mensagem corresponde aos filtros.</p>}
            {outgoing.map((row,index)=><button key={str(row.id)||index} type="button"
              className={detailId===row.id?s.selectedItem:s.itemButton}
              aria-pressed={detailId===row.id} onClick={()=>setDetailId(str(row.id))}>
              <span><strong>{label(row.channel)} · {safe(row.status,"Pendente")}</strong>
                <small>{formatChurchDate(str(row.createdAt))} · Referência {str(row.id).slice(0,8)}…</small></span>
              <span className={s.status}>Detalhes</span>
            </button>)}
          </div>
          {detailId&&<div className={s.subsection}>
            <h4>Eventos de entrega registrados</h4>
            {detailState==="loading"&&<p className={s.empty} role="status">Consultando rastreio…</p>}
            {detailState==="error"&&<p className={s.error} role="alert">{detailError}</p>}
            {detailState==="ready"&&detail&&<>
              <p className={s.context}>Mensagem: {safe(detail.status)} · {label(detail.channel)}. Telefones, destinatários e conteúdo foram omitidos desta visão.</p>
              <div className={s.list}>
                {(Array.isArray(detail.deliveryEvents)?detail.deliveryEvents:[]).length===0&&
                  <p className={s.empty}>Sem eventos adicionais de entrega.</p>}
                {(Array.isArray(detail.deliveryEvents)?detail.deliveryEvents:[]).map((event,index)=>{
                  const row=event&&typeof event==="object"&&!Array.isArray(event)?event as DasRecord:{};
                  return <article className={s.item} key={str(row.id)||index}>
                    <div><strong>{safe(row.status,"Evento de entrega")}</strong>
                      <small>{formatChurchDate(str(row.createdAt))}</small></div>
                  </article>;
                })}
              </div>
            </>}
          </div>}
        </div>
      </div>
    </>}
    <p className={s.foot}>Outbox e modelos são consultados sem mostrar conteúdo pessoal. Sem clique de disparo ou reenvio automático até homologação dos provedores e regras de consentimento.</p>
  </section>;
}
