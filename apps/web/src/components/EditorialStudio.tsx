"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AppShell } from "./AppShell";
import { SiteMediaLibrary } from "./SiteMediaLibrary";
import { apiLogin, clearToken, loadStoredToken, storeToken } from "../lib/api";
import { publicApiBase } from "../lib/portal-live-data";
import { validSiteImage } from "../lib/site-layout";
import { advanceOptions as transitions, contentKindLabels, mayPublishRecord, publishLabel, type EditorialStatus } from "./editorial-access";
import s from "./editorial-studio.module.css";

type Kind = "NEWS"|"BANNER"|"HOME_BLOCK"|"PAGE"|"MINISTRY_CONTENT";
type Status = EditorialStatus;
type Content = { id:string;kind:Kind;status:Status;title:string;slug:string;summary:string|null;body:string|null;ministryId:string|null;imageUrl:string|null };
type Revision = { id:string;fromStatus:Status;toStatus:Status;note:string|null;createdAt:string };
type ReaderView = { title:string;summary:string|null;body:string|null } | { missing:true };
type PortalEvent = {id:string;name:string;slug:string;status:string;startsAt:string;description:string|null;locationText:string|null;ministryId:string|null;featuredOnHome:boolean};
type Ministry = {id:string;name:string;slug:string;publishStatus:string;visibility:string;description:string|null;scheduleText:string|null;participationInfo:string|null;leadershipPublic:{displayName:string;roleTitle:string}[];coverImageUrl:string|null;galleryUrls:string[]};
type Tab = "conteudos"|"eventos"|"ministerios"|"voluntarios";
type InterestStage = "INTERESSE"|"AVALIACAO"|"APROVACAO"|"EQUIPE"|"DISPONIBILIDADE"|"ESCALA";
type VolunteerInterest = {id:string;displayName:string;email:string;message:string|null;ministryId:string;stage:InterestStage;status:"OPEN"|"CLOSED"|"REJECTED";createdAt:string};
const nextInterestStage:Partial<Record<InterestStage, InterestStage>>={INTERESSE:"AVALIACAO",AVALIACAO:"APROVACAO"};
const labels:Record<Status,string> = {RASCUNHO:"Rascunho",REVISAO:"Em revisão",APROVADO:"Aprovado",PUBLICADO:"Publicado",ARQUIVADO:"Arquivado"};
const blankContent={kind:"NEWS" as Kind,title:"",slug:"",summary:"",body:"",ministryId:"",imageUrl:""};
const blankEvent={name:"",slug:"",startsAt:"",description:"",locationText:"",ministryId:"",featuredOnHome:false};
const blankMinistry={description:"",scheduleText:"",participationInfo:"",leadershipText:"",coverImageUrl:"",galleryText:""};

function secureImageUrl(value:string): boolean {
  if (!value.trim()) return true;
  try { return new URL(value.trim()).protocol === "https:"; }
  catch { return false; }
}
function slugify(value:string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function localDateTime(value:string) {
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return "";
  const p=(x:number)=>String(x).padStart(2,"0");
  return [date.getFullYear(),p(date.getMonth()+1),p(date.getDate())].join("-")+"T"+p(date.getHours())+":"+p(date.getMinutes());
}
async function request<T>(token:string,path:string,method:"GET"|"POST"|"PATCH"="GET",payload?:unknown):Promise<T> {
  const base=publicApiBase(process.env.NEXT_PUBLIC_API_URL);
  if(!base)throw new Error("O estúdio ainda não está conectado a este ambiente.");
  if(!/^\/(?:cms\/contents|events|ministries|volunteer-interests)(?:\/[a-zA-Z0-9-]+)*$/.test(path))throw new Error("Rota não permitida.");
  const response=await fetch(base+path,{
    method,mode:"cors",credentials:"omit",cache:"no-store",
    headers:{Authorization:"Bearer "+token,Accept:"application/json",...(payload===undefined?{}:{"Content-Type":"application/json"})},
    body:payload===undefined?undefined:JSON.stringify(payload),
  });
  if(!response.ok)throw new Error(response.status===401?"Sessão expirada. Entre novamente.":response.status===403?"Seu perfil não tem permissão.":"Não foi possível concluir ("+response.status+").");
  return await response.json() as T;
}
export function EditorialStudio() {
  const configured=Boolean(publicApiBase(process.env.NEXT_PUBLIC_API_URL));
  const [token,setToken]=useState<string|null>(null),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false);
  const [email,setEmail]=useState(""),[password,setPassword]=useState("");
  const [tab,setTab]=useState<Tab>("conteudos"),[info,setInfo]=useState(""),[error,setError]=useState("");
  const [contents,setContents]=useState<Content[]>([]),[events,setEvents]=useState<PortalEvent[]>([]),[ministries,setMinistries]=useState<Ministry[]>([]);
  const [interests,setInterests]=useState<VolunteerInterest[]>([]),[selectedInterest,setSelectedInterest]=useState<string|null>(null);
  const [contentId,setContentId]=useState<string|null>(null),[eventId,setEventId]=useState<string|null>(null),[ministryId,setMinistryId]=useState<string|null>(null);
  const [canPublish,setCanPublish]=useState(false),[revisions,setRevisions]=useState<Revision[]>([]),[reader,setReader]=useState<ReaderView|null>(null);
  const [content,setContent]=useState(blankContent),[eventData,setEventData]=useState(blankEvent),[ministryData,setMinistryData]=useState(blankMinistry);
  const [sectionNote,setSectionNote]=useState("");

  useEffect(()=>{setToken(loadStoredToken());setChecking(false);},[]);
  const reload=useCallback(async(t:string)=>{
    const [contentsResult,eventsResult,ministriesResult,interestsResult]=await Promise.allSettled([
      request<{contents:Content[];permissions?:{canPublish?:boolean}}>(t,"/cms/contents"),
      request<{events:PortalEvent[]}>(t,"/events"),
      request<{ministries:Ministry[]}>(t,"/ministries"),
      request<{interests:VolunteerInterest[]}>(t,"/volunteer-interests"),
    ]);
    if(contentsResult.status==="rejected") throw contentsResult.reason;
    const notes:string[]=[];
    setContents(contentsResult.value.contents??[]);
    setCanPublish(contentsResult.value.permissions?.canPublish===true);
    if(eventsResult.status==="fulfilled") setEvents(eventsResult.value.events??[]);
    else { setEvents([]); notes.push("A agenda não está disponível para este perfil."); }
    if(ministriesResult.status==="fulfilled") setMinistries(ministriesResult.value.ministries??[]);
    else { setMinistries([]); notes.push("Os ministérios não estão disponíveis para este perfil."); }
    if(interestsResult.status==="fulfilled") setInterests(interestsResult.value.interests??[]);
    else { setInterests([]); notes.push("O voluntariado não está disponível para este perfil."); }
    setSectionNote(notes.join(" "));
  },[]);
  useEffect(()=>{
    if(!token||!configured)return;
    let cancelled=false;
    void reload(token).catch((err:unknown)=>{if(!cancelled)setError(err instanceof Error?err.message:"O estúdio não respondeu.");});
    return()=>{cancelled=true;};
  },[token,configured,reload]);

  async function login(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!configured)return;
    setBusy(true);setError("");
    try {const result=await apiLogin(email.trim(),password);storeToken(result.accessToken);setToken(result.accessToken);setPassword("");}
    catch{setError("Não foi possível entrar. Confira e-mail e senha.");}
    finally{setBusy(false);}
  }
  async function perform(work:()=>Promise<unknown>,success:string){
    if(!token)return;
    setBusy(true);setError("");setInfo("");
    try {await work();await reload(token);setInfo(success);}
    catch(err){setError(err instanceof Error?err.message:"Não foi possível executar a ação.");}
    finally{setBusy(false);}
  }
  function applyContent(item:Content){setContentId(item.id);setContent({kind:item.kind,title:item.title,slug:item.slug,summary:item.summary??"",body:item.body??"",ministryId:item.ministryId??"",imageUrl:item.imageUrl??""});}
  function chooseContent(item:Content){
    applyContent(item);setReader(null);setRevisions([]);
    if(!token)return;
    void request<{revisions?:Revision[]}>(token,"/cms/contents/"+item.id).then(detail=>{
      setRevisions((detail.revisions??[]).map(row=>({id:row.id,fromStatus:row.fromStatus,toStatus:row.toStatus,note:row.note,createdAt:row.createdAt})));
    }).catch(()=>{});
  }
  function chooseEvent(item:PortalEvent){setEventId(item.id);setEventData({name:item.name,slug:item.slug,startsAt:localDateTime(item.startsAt),description:item.description??"",locationText:item.locationText??"",ministryId:item.ministryId??"",featuredOnHome:item.featuredOnHome});}
  function chooseMinistry(item:Ministry){setMinistryId(item.id);setMinistryData({description:item.description??"",scheduleText:item.scheduleText??"",participationInfo:item.participationInfo??"",leadershipText:item.leadershipPublic.map(p=>p.displayName+" | "+p.roleTitle).join("\n"),coverImageUrl:item.coverImageUrl??"",galleryText:(item.galleryUrls??[]).join("\n")});}
  function saveContent(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!token)return;
    if(content.kind==="MINISTRY_CONTENT"&&!content.ministryId){setError("Selecione o ministério responsável.");return;}
    if(content.imageUrl && !validSiteImage(content.imageUrl)){setError("A imagem precisa vir da biblioteca ou do armazenamento da igreja.");return;}
    const payload={...content,title:content.title.trim(),slug:slugify(content.slug||content.title),summary:content.summary||null,body:content.body||null,ministryId:content.ministryId||null,imageUrl:content.imageUrl.trim()||null};
    void perform(async()=>{
      const saved=contentId
        ? await request<Content>(token,"/cms/contents/"+contentId,"PATCH",{title:payload.title,summary:payload.summary,body:payload.body,imageUrl:payload.imageUrl})
        : await request<Content>(token,"/cms/contents","POST",payload);
      applyContent(saved);
    },"Conteúdo salvo. Reabra o item para conferir a persistência. A publicação continua com o publicador.");
  }
  async function viewAsReader(){
    if(!token||!currentContent)return;
    setReader(null);setError("");
    const base=publicApiBase(process.env.NEXT_PUBLIC_API_URL);
    if(!base)return;
    const response=await fetch(base+"/public/content/"+encodeURIComponent(currentContent.slug),{mode:"cors",credentials:"omit",cache:"no-store",headers:{Accept:"application/json"}});
    if(response.status===404){setReader({missing:true});return;}
    if(!response.ok){setError("Não foi possível abrir a vista do leitor.");return;}
    const data=await response.json() as {title?:unknown;summary?:unknown;body?:unknown};
    if(typeof data.title!=="string"){setReader({missing:true});return;}
    setReader({title:data.title,summary:typeof data.summary==="string"?data.summary:null,body:typeof data.body==="string"?data.body:null});
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
    const galleryUrls=ministryData.galleryText.split("\n").map(x=>x.trim()).filter(Boolean);
    if(!secureImageUrl(ministryData.coverImageUrl)||galleryUrls.some(url=>!secureImageUrl(url))){
      setError("Todas as fotografias devem usar links HTTPS aprovados para divulgação.");return;
    }
    void perform(()=>request(token,"/ministries/"+ministryId,"PATCH",{
      description:ministryData.description||null,scheduleText:ministryData.scheduleText||null,
      participationInfo:ministryData.participationInfo||null,leadershipPublic,
      coverImageUrl:ministryData.coverImageUrl.trim()||null,galleryUrls,
    }),"Perfil ministerial salvo.");
  }
  const currentContent=contents.find(c=>c.id===contentId),currentEvent=events.find(x=>x.id===eventId),currentMinistry=ministries.find(x=>x.id===ministryId);
  const currentInterest=interests.find(x=>x.id===selectedInterest);
  return <AppShell active="editorial" editorial meta="Estúdio do portal">
    <div className={s.page}>
      <header className={s.hero}>
        <div><span className={s.kicker}>CONTEÚDO DO SITE</span><h1>Uma igreja viva.<br/><em>Conteúdo com propósito.</em></h1>
          <p>Prepare notícias, agenda e páginas. O rascunho fica interno até um publicador autorizar.</p></div>
        <Link href="/novidades/" className={s.heroLink}>Ver novidades <span aria-hidden="true">↗</span></Link>
      </header>
      {!configured&&<section className={s.warning} role="status"><strong>Estúdio ainda não conectado</strong><p>Nada é publicado por esta tela enquanto o ambiente de homologação não estiver ligado. Nenhum conteúdo é inventado aqui.</p></section>}
      {configured&&checking&&<p role="status">Verificando sessão…</p>}
      {configured&&!checking&&!token&&<section className={s.loginWrap}>
        <div><span className={s.kicker}>ACESSO RESTRITO</span><h2>Entre no estúdio</h2><p>Use sua conta com permissão para editar o conteúdo da igreja. Nada fica publicado sem aprovação.</p></div>
        <form className={s.form} onSubmit={login}><label>E-mail<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
          <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
          <button type="submit" className={s.primary} disabled={busy}>Entrar com segurança ↗</button></form>
      </section>}
      {configured&&token&&<div className={s.workspace}>
        <div className={s.bar}><span>Homologação • o leitor só vê o que foi publicado</span>
          <div><button type="button" disabled={busy} onClick={()=>void perform(()=>reload(token),"Informações atualizadas.")}>Atualizar ↻</button>
          <button type="button" onClick={()=>{clearToken();setToken(null);setContents([]);setEvents([]);setMinistries([]);setInterests([]);}}>Sair</button></div></div>
        <div className={s.metrics}>
          <div><strong>{contents.filter(c=>c.status==="RASCUNHO"||c.status==="REVISAO").length}</strong><span>Em preparação</span></div>
          <div><strong>{contents.filter(c=>c.status==="PUBLICADO").length}</strong><span>Conteúdos públicos</span></div>
          <div><strong>{events.filter(x=>x.status==="PUBLISHED").length}</strong><span>Eventos publicados</span></div>
          <div><strong>{interests.filter(x=>x.status==="OPEN").length}</strong><span>Interesses recebidos</span></div>
        </div>
        <div className={s.tabs} role="group" aria-label="Editorias">
          {([{key:"conteudos",label:"Notícias e páginas"},{key:"eventos",label:"Agenda"},{key:"ministerios",label:"Ministérios"},{key:"voluntarios",label:"Voluntariado"}] as const).map(item=>
            <button type="button" key={item.key} aria-pressed={tab===item.key} className={tab===item.key?s.tabActive:s.tab} onClick={()=>{setTab(item.key);setError("");setInfo("");}}>{item.label}</button>)}
        </div>
        {sectionNote&&<p className={s.warning} role="status">{sectionNote}</p>}
        {tab==="conteudos"&&<div className={s.editor}>
          <div className={s.list}><div className={s.listTitle}><strong>Publicações</strong><button type="button" onClick={()=>{setContentId(null);setContent(blankContent);}}>+ Novo</button></div>
            {contents.length===0&&<p>Nenhum conteúdo encontrado.</p>}
            {contents.map(item=><button type="button" key={item.id} className={item.id===contentId?s.selected:s.item} onClick={()=>chooseContent(item)}>
              <small>{contentKindLabels[item.kind]} • {labels[item.status]}</small><strong>{item.title}</strong><span>/{item.slug}</span></button>)}
          </div>
          <div className={s.editorBody}><div className={s.editorHead}><span className={s.kicker}>REDAÇÃO E GOVERNANÇA</span><h2>{currentContent?"Editar conteúdo":"Novo conteúdo"}</h2></div>
            <form className={s.form} onSubmit={saveContent}>
              <div className={s.pair}><label>Tipo<select disabled={Boolean(currentContent)} value={content.kind} onChange={e=>setContent({...content,kind:e.target.value as Kind})}>
                {(["NEWS","BANNER","HOME_BLOCK","PAGE","MINISTRY_CONTENT"] as Kind[]).map(k=><option key={k} value={k}>{contentKindLabels[k]}</option>)}</select></label>
                <label>Identificador<input disabled={Boolean(currentContent)} value={content.slug} placeholder="Gerado pelo título" onChange={e=>setContent({...content,slug:e.target.value})}/></label></div>
              <label>Título<input required value={content.title} onChange={e=>setContent({...content,title:e.target.value})}/></label>
              <label>Resumo<textarea rows={3} value={content.summary} onChange={e=>setContent({...content,summary:e.target.value})}/></label>
              <label>Texto da publicação <small>Texto puro, sem execução de HTML</small><textarea rows={7} value={content.body} onChange={e=>setContent({...content,body:e.target.value})}/></label>
              <div className={s.mediaPick}><span>Imagem da biblioteca</span>
                {content.imageUrl?<p>Selecionada no armazenamento: {content.imageUrl}</p>:<p>Nenhuma foto selecionada. O envio só acontece quando o armazenamento deste ambiente está ligado. Sem isso, nenhuma foto é inventada.</p>}
                {content.imageUrl&&<button type="button" onClick={()=>setContent({...content,imageUrl:""})}>Remover imagem</button>}
                <SiteMediaLibrary token={token} onChoose={url=>setContent({...content,imageUrl:url})}/>
              </div>
              {content.kind==="MINISTRY_CONTENT"&&<label>Ministério<select required disabled={Boolean(currentContent)} value={content.ministryId} onChange={e=>setContent({...content,ministryId:e.target.value})}><option value="">Selecione</option>{ministries.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
              <button type="submit" className={s.primary} disabled={busy}>{currentContent?"Salvar alterações":"Criar rascunho"}</button>
            </form>
            {currentContent&&<div className={s.approval}><strong>Fluxo editorial: {labels[currentContent.status]}</strong><p>O editor prepara. O publicador revisa e publica. O leitor não vê o rascunho.</p>
              {!canPublish&&<p>Seu perfil não publica. Aprovar e colocar no ar fica com o publicador.</p>}
              <div>{transitions(currentContent.status, canPublish).map(status=><button type="button" key={status} disabled={busy}
                onClick={()=>void perform(()=>request(token,"/cms/contents/"+currentContent.id+"/advance","POST",{toStatus:status}),"Situação atualizada: "+labels[status])}>{labels[status]}</button>)}</div>
              <button type="button" disabled={busy} onClick={()=>void viewAsReader()}>Ver como leitor</button>
              {reader&&("missing" in reader
                ? <p className={s.reader} data-reader="missing">O leitor não encontra esta publicação. O rascunho permanece interno.</p>
                : <article className={s.reader} data-reader="published"><h3>{reader.title}</h3>{reader.summary&&<p>{reader.summary}</p>}{reader.body&&<p>{reader.body}</p>}</article>)}
              {revisions.length>0&&<ol className={s.history}>{revisions.map(row=><li key={row.id}>{labels[row.fromStatus]} → {labels[row.toStatus]} · {new Date(row.createdAt).toLocaleString("pt-BR")}{row.note?" · "+row.note:""}</li>)}</ol>}
            </div>}
          </div>
        </div>}
        {tab==="eventos"&&<div className={s.editor}>
          <div className={s.list}><div className={s.listTitle}><strong>Eventos</strong><button type="button" onClick={()=>{setEventId(null);setEventData(blankEvent);}}>+ Novo</button></div>
            {events.length===0&&<p>Nenhum evento cadastrado.</p>}
            {events.map(item=><button type="button" key={item.id} className={item.id===eventId?s.selected:s.item} onClick={()=>chooseEvent(item)}>
              <small>{publishLabel(item.status)}</small><strong>{item.name}</strong><span>{new Date(item.startsAt).toLocaleDateString("pt-BR")}</span></button>)}
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
            {currentEvent&&<div className={s.approval}><strong>Situação: {publishLabel(currentEvent.status)}</strong><p>A agenda pública mostra somente o que estiver publicado.</p>
              {!canPublish&&<p>Seu perfil não publica. O rascunho permanece interno até um publicador autorizar.</p>}
              <div>
              {mayPublishRecord(canPublish, currentEvent.status)&&<button disabled={busy} type="button" onClick={()=>void perform(()=>request(token,"/events/"+currentEvent.id+"/publish","POST"),"Evento publicado.")}>Publicar</button>}
              {canPublish&&currentEvent.status==="PUBLISHED"&&<button disabled={busy} type="button" onClick={()=>void perform(()=>request(token,"/events/"+currentEvent.id+"/cancel","POST"),"Evento cancelado.")}>Cancelar evento</button>}
            </div></div>}
          </div>
        </div>}
        {tab==="ministerios"&&<div className={s.editor}>
          <div className={s.list}><div className={s.listTitle}><strong>Ministérios</strong></div>
            {ministries.length===0&&<p>Nenhum ministério disponível.</p>}
            {ministries.map(item=><button type="button" key={item.id} className={item.id===ministryId?s.selected:s.item} onClick={()=>chooseMinistry(item)}>
              <small>{publishLabel(item.publishStatus)}</small><strong>{item.name}</strong><span>/{item.slug}</span></button>)}
          </div>
          <div className={s.editorBody}>{!currentMinistry?<p>Selecione um ministério para editar informações públicas.</p>:<>
            <div className={s.editorHead}><span className={s.kicker}>PERFIL MINISTERIAL</span><h2>{currentMinistry.name}</h2></div>
            <form className={s.form} onSubmit={saveMinistry}>
              <label>Apresentação<textarea rows={4} value={ministryData.description} onChange={e=>setMinistryData({...ministryData,description:e.target.value})}/></label>
              <label>Programação confirmada<textarea rows={3} value={ministryData.scheduleText} onChange={e=>setMinistryData({...ministryData,scheduleText:e.target.value})}/></label>
              <label>Como participar<textarea rows={3} value={ministryData.participationInfo} onChange={e=>setMinistryData({...ministryData,participationInfo:e.target.value})}/></label>
              <label>Lideranças autorizadas para divulgação <small>Uma linha por pessoa: Nome | Função</small><textarea rows={4} value={ministryData.leadershipText} onChange={e=>setMinistryData({...ministryData,leadershipText:e.target.value})}/></label>
              <label>Fotografia de capa (URL HTTPS)<input type="url" value={ministryData.coverImageUrl} placeholder="https://..." onChange={e=>setMinistryData({...ministryData,coverImageUrl:e.target.value})}/></label>
              <label>Galeria autorizada <small>Uma URL HTTPS por linha, com autorização de uso e imagem dos participantes</small><textarea rows={4} value={ministryData.galleryText} onChange={e=>setMinistryData({...ministryData,galleryText:e.target.value})}/></label>
              <button type="submit" className={s.primary} disabled={busy}>Salvar perfil</button>
            </form>
            <div className={s.approval}><strong>Publicação: {publishLabel(currentMinistry.publishStatus)}</strong><p>O leitor vê o ministério somente depois da publicação.</p>
              {!canPublish&&<p>Seu perfil não publica. O rascunho permanece interno até um publicador autorizar.</p>}
              {mayPublishRecord(canPublish, currentMinistry.publishStatus)&&<div><button type="button" disabled={busy} onClick={()=>void perform(()=>request(token,"/ministries/"+currentMinistry.id+"/publish","POST"),"Ministério publicado.")}>Publicar ministério</button></div>}
            </div>
          </>}</div>
        </div>}
        {tab==="voluntarios"&&<div className={s.editor}>
          <div className={s.list}>
            <div className={s.listTitle}><strong>Interesses no voluntariado</strong></div>
            {interests.length===0&&<p>Nenhuma manifestação disponível para sua conta.</p>}
            {interests.map(item=><button type="button" key={item.id}
              className={item.id===selectedInterest?s.selected:s.item}
              onClick={()=>{setSelectedInterest(item.id);setInfo("");setError("");}}>
              <small>{item.stage} • {item.status}</small>
              <strong>{item.displayName}</strong>
              <span>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</span>
            </button>)}
          </div>
          <div className={s.editorBody}>
            {!currentInterest?<p>Selecione uma manifestação para acompanhar a triagem com a equipe responsável.</p>:<>
              <div className={s.editorHead}><span className={s.kicker}>ACOMPANHAMENTO PRIVADO</span><h2>{currentInterest.displayName}</h2></div>
              <div className={s.privateInfo}>
                <span>CONTATO RESTRITO • VISÍVEL SOMENTE A PERFIS AUTORIZADOS</span>
                <p>E-mail: <a href={"mailto:"+currentInterest.email}>{currentInterest.email}</a></p>
                {currentInterest.message&&<div><strong>Mensagem enviada</strong><p>{currentInterest.message}</p></div>}
              </div>
              <div className={s.approval}>
                <strong>Etapa: {currentInterest.stage} • Situação: {currentInterest.status}</strong>
                <p>O acompanhamento fica restrito a quem tem autorização. Equipe e escala só avançam quando houver vínculo formal.</p>
                {currentInterest.status==="OPEN"&&<div>
                  {nextInterestStage[currentInterest.stage]&&<button type="button" disabled={busy} onClick={()=>void perform(
                    ()=>request(token!,"/volunteer-interests/"+currentInterest.id,"PATCH",{stage:nextInterestStage[currentInterest.stage]}),
                    "Etapa atualizada."
                  )}>Avançar para {nextInterestStage[currentInterest.stage]} ↗</button>}
                  <button type="button" disabled={busy} onClick={()=>void perform(
                    ()=>request(token!,"/volunteer-interests/"+currentInterest.id,"PATCH",{status:"CLOSED"}),
                    "Manifestação encerrada."
                  )}>Concluir atendimento</button>
                  <button type="button" disabled={busy} onClick={()=>void perform(
                    ()=>request(token!,"/volunteer-interests/"+currentInterest.id,"PATCH",{status:"REJECTED"}),
                    "Manifestação encerrada sem aprovação."
                  )}>Não aprovar</button>
                </div>}
              </div>
            </>}
          </div>
        </div>}
      </div>}
      {(info||error)&&<div role="status" className={error?s.error:s.success}>{error||info}</div>}
    </div>
  </AppShell>;
}
