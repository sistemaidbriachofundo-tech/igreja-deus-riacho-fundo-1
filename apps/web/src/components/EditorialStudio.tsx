"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AppShell } from "./AppShell";
import { apiLogin, clearToken, loadStoredToken, storeToken } from "../lib/api";
import { publicApiBase } from "../lib/portal-live-data";
import s from "./editorial-studio.module.css";

type Kind = "NEWS"|"BANNER"|"HOME_BLOCK"|"PAGE"|"MINISTRY_CONTENT";
type Status = "RASCUNHO"|"REVISAO"|"APROVADO"|"PUBLICADO"|"ARQUIVADO";
type Content = { id:string;kind:Kind;status:Status;title:string;slug:string;summary:string|null;body:string|null;ministryId:string|null };
type PortalEvent = {id:string;name:string;slug:string;status:string;startsAt:string;description:string|null;locationText:string|null;ministryId:string|null;featuredOnHome:boolean};
type Ministry = {id:string;name:string;slug:string;publishStatus:string;visibility:string;description:string|null;scheduleText:string|null;participationInfo:string|null;leadershipPublic:{displayName:string;roleTitle:string}[]};
type Tab = "conteudos"|"eventos"|"ministerios";
const transitions:Record<Status,Status[]> = {
  RASCUNHO:["REVISAO","ARQUIVADO"],REVISAO:["RASCUNHO","APROVADO","ARQUIVADO"],
  APROVADO:["REVISAO","PUBLICADO","ARQUIVADO"],PUBLICADO:["REVISAO","ARQUIVADO"],ARQUIVADO:["RASCUNHO"],
};
const labels:Record<Status,string> = {RASCUNHO:"Rascunho",REVISAO:"Em revisão",APROVADO:"Aprovado",PUBLICADO:"Publicado",ARQUIVADO:"Arquivado"};
const blankContent={kind:"NEWS" as Kind,title:"",slug:"",summary:"",body:"",ministryId:""};
const blankEvent={name:"",slug:"",startsAt:"",description:"",locationText:"",ministryId:"",featuredOnHome:false};
const blankMinistry={description:"",scheduleText:"",participationInfo:"",leadershipText:""};

function slugify(value:string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function localDateTime(value:string) {
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return "";
  const p=(x:number)=>String(x).padStart(2,"0");
  return [date.getFullYear(),p(date.getMonth()+1),p(date.getDate())].join("-")+"T"+p(date.getHours())+":"+p(date.getMinutes());
}
async function request<T>(token:string,path:string,method:"GET"|"POST"|"PATCH"="GET",payload?:unknown):Promise<T> {
  const base=publicApiBase(process.env.NEXT_PUBLIC_API_URL);
  if(!base)throw new Error("API autenticada não configurada.");
  if(!/^\/(?:cms\/contents|events|ministries)(?:\/[a-zA-Z0-9-]+)*$/.test(path))throw new Error("Rota não permitida.");
  const response=await fetch(base+path,{
    method,mode:"cors",credentials:"omit",cache:"no-store",
    headers:{Authorization:"Bearer "+token,Accept:"application/json",...(payload===undefined?{}:{"Content-Type":"application/json"})},
    body:payload===undefined?undefined:JSON.stringify(payload),
  });
  if(!response.ok)throw new Error(response.status===401?"Sessão expirada. Entre novamente.":response.status===403?"Seu perfil não tem permissão.":"Falha da API ("+response.status+").");
  return await response.json() as T;
}
export function EditorialStudio() {
  const configured=Boolean(publicApiBase(process.env.NEXT_PUBLIC_API_URL));
  const [token,setToken]=useState<string|null>(null),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false);
  const [email,setEmail]=useState(""),[password,setPassword]=useState("");
  const [tab,setTab]=useState<Tab>("conteudos"),[info,setInfo]=useState(""),[error,setError]=useState("");
  const [contents,setContents]=useState<Content[]>([]),[events,setEvents]=useState<PortalEvent[]>([]),[ministries,setMinistries]=useState<Ministry[]>([]);
  const [contentId,setContentId]=useState<string|null>(null),[eventId,setEventId]=useState<string|null>(null),[ministryId,setMinistryId]=useState<string|null>(null);
  const [content,setContent]=useState(blankContent),[eventData,setEventData]=useState(blankEvent),[ministryData,setMinistryData]=useState(blankMinistry);

  useEffect(()=>{setToken(loadStoredToken());setChecking(false);},[]);
  const reload=useCallback(async(t:string)=>{
    const [a,b,c]=await Promise.all([
      request<{contents:Content[]}>(t,"/cms/contents"),
      request<{events:PortalEvent[]}>(t,"/events"),
      request<{ministries:Ministry[]}>(t,"/ministries"),
    ]);
    setContents(a.contents??[]);setEvents(b.events??[]);setMinistries(c.ministries??[]);
  },[]);
  useEffect(()=>{
    if(!token||!configured)return;
    let cancelled=false;
    void reload(token).catch((err:unknown)=>{if(!cancelled)setError(err instanceof Error?err.message:"API indisponível.");});
    return()=>{cancelled=true;};
  },[token,configured,reload]);

  async function login(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!configured)return;
    setBusy(true);setError("");
    try {const result=await apiLogin(email.trim(),password);storeToken(result.accessToken);setToken(result.accessToken);setPassword("");}
    catch{setError("Falha ao autenticar. Verifique suas credenciais e a API.");}
    finally{setBusy(false);}
  }
  async function perform(work:()=>Promise<unknown>,success:string){
    if(!token)return;
    setBusy(true);setError("");setInfo("");
    try {await work();await reload(token);setInfo(success);}
    catch(err){setError(err instanceof Error?err.message:"Não foi possível executar a ação.");}
    finally{setBusy(false);}
  }
  function chooseContent(item:Content){setContentId(item.id);setContent({kind:item.kind,title:item.title,slug:item.slug,summary:item.summary??"",body:item.body??"",ministryId:item.ministryId??""});}
  function chooseEvent(item:PortalEvent){setEventId(item.id);setEventData({name:item.name,slug:item.slug,startsAt:localDateTime(item.startsAt),description:item.description??"",locationText:item.locationText??"",ministryId:item.ministryId??"",featuredOnHome:item.featuredOnHome});}
  function chooseMinistry(item:Ministry){setMinistryId(item.id);setMinistryData({description:item.description??"",scheduleText:item.scheduleText??"",participationInfo:item.participationInfo??"",leadershipText:item.leadershipPublic.map(p=>p.displayName+" | "+p.roleTitle).join("\n")});}
  function saveContent(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!token)return;
    if(content.kind==="MINISTRY_CONTENT"&&!content.ministryId){setError("Selecione o ministério responsável.");return;}
    const payload={...content,title:content.title.trim(),slug:slugify(content.slug||content.title),summary:content.summary||null,body:content.body||null,ministryId:content.ministryId||null};
    void perform(async()=>{
      if(contentId)await request(token,"/cms/contents/"+contentId,"PATCH",{title:payload.title,summary:payload.summary,body:payload.body});
      else{const saved=await request<Content>(token,"/cms/contents","POST",payload);setContentId(saved.id);}
    },"Conteúdo salvo. Siga o fluxo de revisão antes de publicar.");
  }
  function saveEvent(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!token)return;
    const dt=new Date(eventData.startsAt);
    if(!eventData.startsAt||!Number.isFinite(dt.getTime())){setError("Informe uma data válida.");return;}
    const payload={...eventData,name:eventData.name.trim(),slug:slugify(eventData.slug||eventData.name),
      startsAt:dt.toISOString(),description:eventData.description||null,locationText:eventData.locationText||null,ministryId:eventData.ministryId||null};
    void perform(async()=>{
      if(eventId)await request(token,"/events/"+eventId,"PATCH",payload);
      else{const saved=await request<PortalEvent>(token,"/events","POST",payload);setEventId(saved.id);}
    },"Evento salvo. Publique apenas depois de confirmar todos os dados.");
  }
  function saveMinistry(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!token||!ministryId)return;
    const leadershipPublic=ministryData.leadershipText.split("\n").filter(line=>line.trim()).map(line=>{
      const parts=line.split("|");return {displayName:parts[0].trim(),roleTitle:parts.slice(1).join("|").trim()};
    });
    if(leadershipPublic.some(person=>!person.displayName||!person.roleTitle)){setError("Liderança: uma linha por pessoa, no formato Nome | Função.");return;}
    void perform(()=>request(token,"/ministries/"+ministryId,"PATCH",{
      description:ministryData.description||null,scheduleText:ministryData.scheduleText||null,
      participationInfo:ministryData.participationInfo||null,leadershipPublic,
    }),"Perfil ministerial salvo.");
  }
  const currentContent=contents.find(c=>c.id===contentId),currentEvent=events.find(x=>x.id===eventId),currentMinistry=ministries.find(x=>x.id===ministryId);
  return <AppShell active="editorial" editorial meta="Estúdio do portal">
    <div className={s.page}>
      <header className={s.hero}>
        <div><span className={s.kicker}>CHURCH OS / CONTEÚDO OFICIAL</span><h1>Uma igreja viva.<br/><em>Conteúdo com propósito.</em></h1>
          <p>Gerencie as informações públicas com autenticação, aprovação editorial e permissões do Church OS.</p></div>
        <Link href="/novidades/" className={s.heroLink}>Ver novidades <span aria-hidden="true">↗</span></Link>
      </header>
      {!configured&&<section className={s.warning} role="status"><strong>Backend editorial ainda não conectado</strong><p>Esta interface depende de uma API NestJS homologada por HTTPS, definida em NEXT_PUBLIC_API_URL. Ela não simula publicações nem cria conteúdo local.</p></section>}
      {configured&&checking&&<p role="status">Verificando sessão…</p>}
      {configured&&!checking&&!token&&<section className={s.loginWrap}>
        <div><span className={s.kicker}>ACESSO RESTRITO</span><h2>Entre no estúdio</h2><p>Use sua conta com permissão para editar o conteúdo da igreja. Nada fica publicado sem aprovação.</p></div>
        <form className={s.form} onSubmit={login}><label>E-mail<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
          <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
          <button type="submit" className={s.primary} disabled={busy}>Entrar com segurança ↗</button></form>
      </section>}
      {configured&&token&&<div className={s.workspace}>
        <div className={s.bar}><span>Dados reais da API autenticada • nenhuma alteração fictícia</span>
          <div><button type="button" disabled={busy} onClick={()=>void perform(()=>reload(token),"Informações atualizadas.")}>Atualizar ↻</button>
          <button type="button" onClick={()=>{clearToken();setToken(null);setContents([]);setEvents([]);setMinistries([]);}}>Sair</button></div></div>
        <div className={s.metrics}>
          <div><strong>{contents.filter(c=>c.status==="RASCUNHO"||c.status==="REVISAO").length}</strong><span>Em preparação</span></div>
          <div><strong>{contents.filter(c=>c.status==="PUBLICADO").length}</strong><span>Conteúdos públicos</span></div>
          <div><strong>{events.filter(x=>x.status==="PUBLISHED").length}</strong><span>Eventos publicados</span></div>
          <div><strong>{ministries.filter(x=>x.publishStatus==="PUBLISHED").length}</strong><span>Ministérios ativos</span></div>
        </div>
        <div className={s.tabs} role="group" aria-label="Editorias">
          {([{key:"conteudos",label:"Notícias e páginas"},{key:"eventos",label:"Agenda"},{key:"ministerios",label:"Ministérios"}] as const).map(item=>
            <button type="button" key={item.key} aria-pressed={tab===item.key} className={tab===item.key?s.tabActive:s.tab} onClick={()=>{setTab(item.key);setError("");setInfo("");}}>{item.label}</button>)}
        </div>
        {tab==="conteudos"&&<div className={s.editor}>
          <div className={s.list}><div className={s.listTitle}><strong>Publicações</strong><button type="button" onClick={()=>{setContentId(null);setContent(blankContent);}}>+ Novo</button></div>
            {contents.length===0&&<p>Nenhum conteúdo encontrado.</p>}
            {contents.map(item=><button type="button" key={item.id} className={item.id===contentId?s.selected:s.item} onClick={()=>chooseContent(item)}>
              <small>{item.kind} • {item.status}</small><strong>{item.title}</strong><span>/{item.slug}</span></button>)}
          </div>
          <div className={s.editorBody}><div className={s.editorHead}><span className={s.kicker}>REDAÇÃO E GOVERNANÇA</span><h2>{currentContent?"Editar conteúdo":"Novo conteúdo"}</h2></div>
            <form className={s.form} onSubmit={saveContent}>
              <div className={s.pair}><label>Tipo<select disabled={Boolean(currentContent)} value={content.kind} onChange={e=>setContent({...content,kind:e.target.value as Kind})}>
                {(["NEWS","BANNER","HOME_BLOCK","PAGE","MINISTRY_CONTENT"] as Kind[]).map(k=><option key={k} value={k}>{k}</option>)}</select></label>
                <label>Identificador<input disabled={Boolean(currentContent)} value={content.slug} placeholder="Gerado pelo título" onChange={e=>setContent({...content,slug:e.target.value})}/></label></div>
              <label>Título<input required value={content.title} onChange={e=>setContent({...content,title:e.target.value})}/></label>
              <label>Resumo<textarea rows={3} value={content.summary} onChange={e=>setContent({...content,summary:e.target.value})}/></label>
              <label>Texto da publicação <small>Texto puro, sem execução de HTML</small><textarea rows={7} value={content.body} onChange={e=>setContent({...content,body:e.target.value})}/></label>
              {content.kind==="MINISTRY_CONTENT"&&<label>Ministério<select required disabled={Boolean(currentContent)} value={content.ministryId} onChange={e=>setContent({...content,ministryId:e.target.value})}><option value="">Selecione</option>{ministries.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
              <button type="submit" className={s.primary} disabled={busy}>{currentContent?"Salvar alterações":"Criar rascunho"}</button>
            </form>
            {currentContent&&<div className={s.approval}><strong>Fluxo editorial: {currentContent.status}</strong><p>O backend valida cada transição e registra o histórico. Publique apenas informações verificadas.</p>
              <div>{transitions[currentContent.status].map(status=><button type="button" key={status} disabled={busy}
                onClick={()=>void perform(()=>request(token,"/cms/contents/"+currentContent.id+"/advance","POST",{toStatus:status}),"Status atualizado: "+status)}>{labels[status]} ↗</button>)}</div>
            </div>}
          </div>
        </div>}
        {tab==="eventos"&&<div className={s.editor}>
          <div className={s.list}><div className={s.listTitle}><strong>Eventos</strong><button type="button" onClick={()=>{setEventId(null);setEventData(blankEvent);}}>+ Novo</button></div>
            {events.length===0&&<p>Nenhum evento cadastrado.</p>}
            {events.map(item=><button type="button" key={item.id} className={item.id===eventId?s.selected:s.item} onClick={()=>chooseEvent(item)}>
              <small>{item.status}</small><strong>{item.name}</strong><span>{new Date(item.startsAt).toLocaleDateString("pt-BR")}</span></button>)}
          </div>
          <div className={s.editorBody}><div className={s.editorHead}><span className={s.kicker}>AGENDA CONFIRMADA</span><h2>{currentEvent?"Editar evento":"Novo evento"}</h2></div>
            <form className={s.form} onSubmit={saveEvent}>
              <label>Nome do encontro<input required value={eventData.name} onChange={e=>setEventData({...eventData,name:e.target.value})}/></label>
              <div className={s.pair}><label>Identificador<input disabled={Boolean(currentEvent)} placeholder="Gerado pelo nome" value={eventData.slug} onChange={e=>setEventData({...eventData,slug:e.target.value})}/></label>
                <label>Data e hora <small>Fuso do dispositivo</small><input required type="datetime-local" value={eventData.startsAt} onChange={e=>setEventData({...eventData,startsAt:e.target.value})}/></label></div>
              <label>Descrição<textarea rows={3} value={eventData.description} onChange={e=>setEventData({...eventData,description:e.target.value})}/></label>
              <div className={s.pair}><label>Local confirmado<input value={eventData.locationText} onChange={e=>setEventData({...eventData,locationText:e.target.value})}/></label>
                <label>Ministério<select value={eventData.ministryId} onChange={e=>setEventData({...eventData,ministryId:e.target.value})}><option value="">Toda a igreja</option>{ministries.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label></div>
              <label className={s.checkbox}><input type="checkbox" checked={eventData.featuredOnHome} onChange={e=>setEventData({...eventData,featuredOnHome:e.target.checked})}/>Destacar na Home quando publicado</label>
              <button type="submit" className={s.primary} disabled={busy}>{currentEvent?"Salvar evento":"Criar rascunho de evento"}</button>
            </form>
            {currentEvent&&<div className={s.approval}><strong>Situação: {currentEvent.status}</strong><p>Datas e locais precisam estar confirmados antes de publicar.</p><div>
              {currentEvent.status!=="PUBLISHED"&&<button disabled={busy} type="button" onClick={()=>void perform(()=>request(token,"/events/"+currentEvent.id+"/publish","POST"),"Evento publicado.")}>Publicar ↗</button>}
              {currentEvent.status==="PUBLISHED"&&<button disabled={busy} type="button" onClick={()=>void perform(()=>request(token,"/events/"+currentEvent.id+"/cancel","POST"),"Evento cancelado.")}>Cancelar evento</button>}
            </div></div>}
          </div>
        </div>}
        {tab==="ministerios"&&<div className={s.editor}>
          <div className={s.list}><div className={s.listTitle}><strong>Ministérios</strong></div>
            {ministries.length===0&&<p>Nenhum ministério disponível.</p>}
            {ministries.map(item=><button type="button" key={item.id} className={item.id===ministryId?s.selected:s.item} onClick={()=>chooseMinistry(item)}>
              <small>{item.publishStatus} • {item.visibility}</small><strong>{item.name}</strong><span>/{item.slug}</span></button>)}
          </div>
          <div className={s.editorBody}>{!currentMinistry?<p>Selecione um ministério para editar informações públicas.</p>:<>
            <div className={s.editorHead}><span className={s.kicker}>PERFIL MINISTERIAL</span><h2>{currentMinistry.name}</h2></div>
            <form className={s.form} onSubmit={saveMinistry}>
              <label>Apresentação<textarea rows={4} value={ministryData.description} onChange={e=>setMinistryData({...ministryData,description:e.target.value})}/></label>
              <label>Programação confirmada<textarea rows={3} value={ministryData.scheduleText} onChange={e=>setMinistryData({...ministryData,scheduleText:e.target.value})}/></label>
              <label>Como participar<textarea rows={3} value={ministryData.participationInfo} onChange={e=>setMinistryData({...ministryData,participationInfo:e.target.value})}/></label>
              <label>Lideranças autorizadas para divulgação <small>Uma linha por pessoa: Nome | Função</small><textarea rows={4} value={ministryData.leadershipText} onChange={e=>setMinistryData({...ministryData,leadershipText:e.target.value})}/></label>
              <button type="submit" className={s.primary} disabled={busy}>Salvar perfil</button>
            </form>
            <div className={s.approval}><strong>Publicação: {currentMinistry.publishStatus}</strong><p>As informações são públicas somente quando autorizadas e publicadas.</p>
              {currentMinistry.publishStatus!=="PUBLISHED"&&<div><button type="button" disabled={busy} onClick={()=>void perform(()=>request(token,"/ministries/"+currentMinistry.id+"/publish","POST"),"Ministério publicado.")}>Publicar ministério ↗</button></div>}
            </div>
          </>}</div>
        </div>}
      </div>}
      {(info||error)&&<div role="status" className={error?s.error:s.success}>{error||info}</div>}
    </div>
  </AppShell>;
}
