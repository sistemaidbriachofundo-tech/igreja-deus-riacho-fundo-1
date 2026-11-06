"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl } from "../lib/api";
import type { SiteLayout } from "../lib/site-layout";
import s from "./vivi-editorial-assistant.module.css";

type Status = {assistant:string;provider:"manus"|"gemini"|"mock";model:string;lgpdNotice:string};
type Answer = {reply:string;provider:string;model:string;refused:boolean;lgpdNotice:string};
type Intent = "revisar"|"chamada"|"galeria";

export function ViviEditorialAssistant({token,layout}:{token:string;layout:SiteLayout}) {
  const [status,setStatus]=useState<Status|null>(null);
  const [intent,setIntent]=useState<Intent>("revisar"),[consent,setConsent]=useState(false);
  const [answer,setAnswer]=useState<Answer|null>(null),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[copied,setCopied]=useState(false);
  useEffect(()=>{
    const ctrl=new AbortController();
    void fetch(getApiBaseUrl()+"/vivi/status",{signal:ctrl.signal,credentials:"omit",mode:"cors",cache:"no-store"})
      .then(async res=>{if(!res.ok)throw new Error("Vivi indisponível");return res.json() as Promise<Status>;})
      .then(result=>{if(!ctrl.signal.aborted)setStatus(result);})
      .catch(()=>{if(!ctrl.signal.aborted)setError("Não foi possível consultar a Vivi.");});
    return()=>ctrl.abort();
  },[]);
  const online=Boolean(status&&status.provider!=="mock");
  async function ask(){
    if(!online||!consent||busy)return;
    const shared=[
      "Você auxilia um editor autorizado do portal da Igreja de Deus Riacho Fundo I.",
      "Sugira exclusivamente redação para conteúdo público institucional, com linguagem acolhedora e objetiva.",
      "Não invente horários, endereços, eventos, resultados, testemunhos ou fatos não confirmados.",
      "Não execute nenhuma alteração; responda em português e deixe a pessoa revisar e copiar manualmente.",
    ];
    const intentPrompt:Record<Intent,string>={
      revisar:"Revise a clareza e fluidez da capa. Apresente uma proposta de título, destaque e descrição sem acrescentar fatos.",
      chamada:"Sugira três alternativas curtas e criativas de chamada para a capa, preservando a identidade da igreja.",
      galeria:"Sugira título, destaque e descrição da galeria de fotografias em linguagem acolhedora.",
    };
    const values=intent==="galeria"?[
      "Título atual: "+layout.gallery.title,
      "Destaque atual: "+layout.gallery.accent,
      "Descrição atual: "+layout.gallery.description,
    ]:[
      "Título atual: "+layout.hero.title,
      "Destaque atual: "+layout.hero.accent,
      "Descrição atual: "+layout.hero.description,
    ];
    const content=[...shared,intentPrompt[intent],...values].join("\n").slice(0,1950);
    setBusy(true);setError("");setAnswer(null);setCopied(false);
    try{
      const res=await fetch(getApiBaseUrl()+"/vivi/chat",{
        method:"POST",mode:"cors",credentials:"omit",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+token,Accept:"application/json"},
        body:JSON.stringify({messages:[{role:"user",content}],consentAiProcessing:true}),
      });
      if(!res.ok)throw new Error(res.status===429?"Muitas solicitações. Aguarde e tente novamente.":res.status===403?"Sem permissão para usar a Vivi.":"Não foi possível consultar a Vivi ("+res.status+").");
      setAnswer(await res.json() as Answer);
    }catch(err){setError(err instanceof Error?err.message:"Assistente indisponível.");}
    finally{setBusy(false);}
  }
  async function copy(){
    if(!answer?.reply)return;
    try{await navigator.clipboard.writeText(answer.reply);setCopied(true);}
    catch{setError("Não foi possível copiar automaticamente. Selecione o texto da resposta.");}
  }
  return <div className={s.panel}>
    <div className={s.intro}>
      <span className={s.icon} aria-hidden="true">✳</span>
      <div><h2>Vivi — Assistente editorial</h2><p>Uma ajuda opcional para melhorar textos públicos. A decisão final e a publicação continuam com pessoas autorizadas.</p></div>
    </div>
    <div className={s.status} aria-live="polite">
      <span className={online?s.live:s.mock}>{online?"IA disponível":"Modo de simulação"}</span>
      <span>{status?status.provider==="manus"?"Manus":status.provider==="gemini"?"Gemini":"Provedor real não configurado":"Consultando o backend..."}</span>
    </div>
    {!online&&<p className={s.warning}>A Vivi está conectada à API, mas ainda utiliza um provedor simulado neste ambiente. Para gerar sugestões reais, um administrador deve configurar Manus ou Gemini no servidor. Não é necessário colocar chaves no navegador.</p>}
    <label className={s.field}>O que deseja aprimorar?
      <select value={intent} onChange={e=>setIntent(e.target.value as Intent)}>
        <option value="revisar">Revisar os textos da capa</option>
        <option value="chamada">Criar alternativas de título</option>
        <option value="galeria">Aprimorar apresentação da galeria</option>
      </select>
    </label>
    <label className={s.consent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />
      <span>Confirmo que os textos são públicos, não contêm dados pessoais ou pastorais e aceito enviá-los ao provedor de IA.</span>
    </label>
    <button className={s.generate} type="button" onClick={()=>void ask()} disabled={!online||!consent||busy}>{busy?"Consultando a Vivi…":"Gerar sugestão editorial"}</button>
    {error&&<p className={s.error} role="alert">{error}</p>}
    {answer&&<div className={s.answer}>
      <div className={s.answerTitle}><strong>{answer.refused?"Solicitação não permitida":"Sugestão da Vivi"}</strong><small>{answer.provider} · {answer.model}</small></div>
      <p>{answer.reply}</p>
      {!answer.refused&&<button type="button" onClick={()=>void copy()}>{copied?"Copiado ✓":"Copiar sugestão"}</button>}
      <span>Revise o texto antes de colá-lo nos campos. Nenhuma alteração foi aplicada automaticamente.</span>
    </div>}
    <p className={s.privacy}>{status?.lgpdNotice??"A Vivi processa apenas textos públicos que você autorizar. Não envie dados de membros ou documentos."}</p>
  </div>;
}
