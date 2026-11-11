"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppNavLink, AppShell, UIIcon } from "./AppShell";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";
import { loadStoredToken } from "../lib/api";
import { publicApiBase } from "../lib/portal-live-data";
import { mayPublishRecord, publishLabel } from "./editorial-access";
import ui from "./ui/ui.module.css";
import s from "./editorial-studio.module.css";

type PortalEvent = {
  id: string;
  name: string;
  slug: string;
  status: string;
  startsAt: string;
  description: string | null;
  locationText: string | null;
  ministryId: string | null;
  featuredOnHome: boolean;
};

const blankEvent = { name: "", slug: "", startsAt: "", description: "", locationText: "", ministryId: "", featuredOnHome: false };

function slugify(value:string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function localDateTime(value:string) {
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return "";
  const p=(x:number)=>String(x).padStart(2,"0");
  return [date.getFullYear(),p(date.getMonth()+1),p(date.getDate())].join("-")+"T"+p(date.getHours())+":"+p(date.getMinutes());
}
async function request<T>(token:string,path:string,method:"GET"|"POST"|"PATCH"="GET",payload?:unknown):Promise<T> {
  const base=publicApiBase(process.env.NEXT_PUBLIC_API_URL);
  if(!base)throw new Error("O estúdio ainda não está conectado a este ambiente.");
  if(!/^\/(?:cms\/contents|events|ministries)(?:\/[a-zA-Z0-9_-]+)*$/.test(path))throw new Error("Rota não permitida.");
  const response=await fetch(base+path,{
    method,mode:"cors",credentials:"omit",cache:"no-store",
    headers:{Authorization:"Bearer "+token,Accept:"application/json",...(payload===undefined?{}:{"Content-Type":"application/json"})},
    body:payload===undefined?undefined:JSON.stringify(payload),
  });
  if(!response.ok)throw new Error(response.status===401?"Sessão expirada. Entre novamente.":response.status===403?"Seu perfil não tem permissão.":"Não foi possível concluir ("+response.status+").");
  return await response.json() as T;
}
export function EditorialStudio() {
  const configured = Boolean(publicApiBase(process.env.NEXT_PUBLIC_API_URL));
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [events, setEvents] = useState<PortalEvent[]>([]);
  const [ministries, setMinistries] = useState<Array<{ id: string; name: string }>>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventData, setEventData] = useState(blankEvent);
  const [canPublish, setCanPublish] = useState(false);

  useEffect(() => { setToken(loadStoredToken()); }, []);

  const reload = useCallback(async (session: string) => {
    const [agenda, permission, ministryOptions] = await Promise.allSettled([
      request<{ events: PortalEvent[] }>(session, "/events"),
      request<{ permissions?: { canPublish?: boolean } }>(session, "/cms/contents"),
      request<{ ministries: Array<{ id: string; name: string }> }>(session, "/ministries"),
    ]);
    setCanPublish(permission.status === "fulfilled" && permission.value.permissions?.canPublish === true);
    if (ministryOptions.status === "fulfilled") setMinistries(ministryOptions.value.ministries ?? []);
    if (agenda.status === "rejected") throw agenda.reason;
    setEvents(agenda.value.events ?? []);
  }, []);

  useEffect(() => {
    if (!token || !configured) return;
    let active = true;
    void reload(token).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar a agenda.");
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [configured, token, reload]);

  async function perform(action: () => Promise<unknown>, success: string) {
    if (!token || busy) return;
    setBusy(true);
    setInfo("");
    setError("");
    try {
      await action();
      setInfo(success);
      await reload(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  function chooseEvent(item: PortalEvent) {
    setEventId(item.id);
    setEventData({
      name: item.name, slug: item.slug, startsAt: localDateTime(item.startsAt),
      description: item.description ?? "", locationText: item.locationText ?? "",
      ministryId: item.ministryId ?? "", featuredOnHome: item.featuredOnHome,
    });
    setInfo("");
    setError("");
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
  const currentEvent = events.find(item => item.id === eventId);
  return (
    <AppShell active="editorial" editorial meta="Mídia e conteúdo">
      <div className={s.page}>
        <PageHeader appearance="workspace" heading="h1" title="Mídia e conteúdo"
          actions={<AppNavLink className={ui.workspaceSecondary} href="/app/site/#capa">
            Editar capa <UIIcon name="arrow" size={16} />
          </AppNavLink>} />
        {error && <Alert appearance="workspace" tone="danger" title={error} />}
        {info && <Alert appearance="workspace" tone="success" title={info} />}
        {!configured ? <p role="status">A agenda está indisponível neste ambiente.</p> :
          checking || !token ? <p role="status">Consultando a agenda…</p> : (
          <section aria-label="Agenda do portal">
        <div className={s.editor}>
          <div className={s.list}><div className={s.listTitle}><strong>Eventos</strong><button type="button" onClick={()=>{setEventId(null);setEventData(blankEvent);}}>+ Novo</button></div>
            {events.length===0&&<p>Nenhum evento cadastrado.</p>}
            {events.map(item=><button type="button" key={item.id} className={item.id===eventId?s.selected:s.item} onClick={()=>chooseEvent(item)}>
              <small>{publishLabel(item.status)}</small><strong>{item.name}</strong><span>{new Date(item.startsAt).toLocaleDateString("pt-BR")}</span></button>)}
          </div>
          <div className={s.editorBody}><div className={s.editorHead}><h2>{currentEvent?"Editar evento":"Novo evento"}</h2></div>
            <form className={s.form} onSubmit={saveEvent}>
              <label>Nome do encontro<input required value={eventData.name} onChange={e=>setEventData({...eventData,name:e.target.value})}/></label>
              <div className={s.pair}><label>Identificador<input disabled={Boolean(currentEvent)} placeholder="Gerado pelo nome" value={eventData.slug} onChange={e=>setEventData({...eventData,slug:e.target.value})}/></label>
                <label>Data e hora <small>Fuso do dispositivo</small><input required type="datetime-local" value={eventData.startsAt} onChange={e=>setEventData({...eventData,startsAt:e.target.value})}/></label></div>
              <label>Descrição<textarea rows={3} value={eventData.description} onChange={e=>setEventData({...eventData,description:e.target.value})}/></label>
              <div className={s.pair}><label>Local confirmado<input value={eventData.locationText} onChange={e=>setEventData({...eventData,locationText:e.target.value})}/></label>
                <label>Ministério<select value={eventData.ministryId} onChange={e=>setEventData({...eventData,ministryId:e.target.value})}><option value="">Toda a igreja</option>{ministries.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label></div>
              <label className={s.checkbox}><input type="checkbox" checked={eventData.featuredOnHome} onChange={e=>setEventData({...eventData,featuredOnHome:e.target.checked})}/>Destacar na página inicial após publicar</label>
              <button type="submit" className={s.primary} disabled={busy}>{currentEvent?"Salvar evento":"Criar rascunho de evento"}</button>
            </form>
            {currentEvent&&<div className={s.approval}><strong>Situação: {publishLabel(currentEvent.status)}</strong><p>A agenda pública mostra somente o que estiver publicado.</p>
              {!canPublish&&<p>Seu perfil não publica. O rascunho permanece interno até um publicador autorizar.</p>}
              <div>
              {mayPublishRecord(canPublish, currentEvent.status)&&<button disabled={busy} type="button" onClick={()=>void perform(()=>request(token,"/events/"+currentEvent.id+"/publish","POST"),"Evento publicado.")}>Publicar</button>}
              {canPublish&&currentEvent.status==="PUBLISHED"&&<button disabled={busy} type="button" onClick={()=>void perform(()=>request(token,"/events/"+currentEvent.id+"/cancel","POST"),"Evento cancelado.")}>Cancelar evento</button>}
            </div></div>}
          </div>
        </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
