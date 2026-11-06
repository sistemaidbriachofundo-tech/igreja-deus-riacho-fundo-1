"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getApiBaseUrl } from "../lib/api";
import s from "./vivi-editorial-assistant.module.css";

type ViviStatus = {
  assistant: string;
  provider: "mock"|"manus"|"gemini";
  model: string;
  lgpdNotice: string;
};
type ViviAnswer = {
  reply: string;
  provider: "mock"|"manus"|"gemini";
  model: string;
  refused: boolean;
  lgpdNotice: string;
};

export type ViviField = "hero.title"|"hero.accent"|"hero.description"|"gallery.title"|"gallery.accent"|"gallery.description";
const fields: {value:ViviField;label:string;limit:number}[] = [
  {value:"hero.title",label:"Título da capa",limit:110},
  {value:"hero.accent",label:"Destaque da capa",limit:110},
  {value:"hero.description",label:"Texto de apresentação",limit:500},
  {value:"gallery.title",label:"Título da galeria",limit:110},
  {value:"gallery.accent",label:"Destaque da galeria",limit:110},
  {value:"gallery.description",label:"Texto da galeria",limit:500},
];
const samples=[
  "Sugira um título curto e acolhedor para visitantes do nosso site.",
  "Escreva uma apresentação para a Home, com até 250 caracteres, sobre acolhimento e comunidade cristã.",
  "Sugira uma frase para a galeria sobre louvor, juventude, oração e Palavra.",
];

export function ViviEditorialAssistant({ token, onApply }:{token:string;onApply:(field:ViviField,content:string)=>void}) {
  const [status,setStatus]=useState<ViviStatus|null>(null);
  const [loadingStatus,setLoadingStatus]=useState(true);
  const [question,setQuestion]=useState("");
  const [consent,setConsent]=useState(false);
  const [target,setTarget]=useState<ViviField>("hero.description");
  const [answer,setAnswer]=useState<ViviAnswer|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    setLoadingStatus(true);
    try {
      const base=getApiBaseUrl();
      void fetch(base+"/vivi/status",{
        signal:controller.signal,mode:"cors",credentials:"omit",cache:"no-store",
        headers:{Accept:"application/json"},
      }).then(async r=>{
        if(!r.ok)throw new Error("Não foi possível consultar a Vivi.");
        return r.json() as Promise<ViviStatus>;
      }).then(value=>{if(!controller.signal.aborted)setStatus(value);})
      .catch(()=>{if(!controller.signal.aborted)setError("A Vivi não está disponível neste ambiente.");})
      .finally(()=>{if(!controller.signal.aborted)setLoadingStatus(false);});
    } catch {
      setError("A API da Vivi não está configurada.");
      setLoadingStatus(false);
    }
    return ()=>controller.abort();
  },[]);

  async function ask(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!consent||!question.trim()||!token||busy)return;
    setBusy(true);setError("");setAnswer(null);
    try {
      const response=await fetch(getApiBaseUrl()+"/vivi/chat",{
        method:"POST",mode:"cors",credentials:"omit",cache:"no-store",
        headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({messages:[{role:"user",content:question.trim().slice(0,2000)}],consentAiProcessing:true}),
      });
      if(!response.ok){
        if(response.status===401)throw new Error("A sessão expirou. Entre novamente.");
        if(response.status===403)throw new Error("Seu perfil não permite usar a Vivi.");
        if(response.status===429)throw new Error("Limite temporário da Vivi atingido. Tente mais tarde.");
        throw new Error("Não foi possível obter resposta da Vivi ("+response.status+").");
      }
      const value=await response.json() as ViviAnswer;
      if(!value||typeof value.reply!=="string")throw new Error("Resposta da Vivi inválida.");
      setAnswer(value);
    }catch(err){setError(err instanceof Error?err.message:"Falha de conexão com a Vivi.");}
    finally{setBusy(false);}
  }

  const realProvider=(status?.provider==="gemini"||status?.provider==="manus");
  const chosen=fields.find(field=>field.value===target)!;
  const suggestion=answer?.reply.trim()??"";
  const canApply=realProvider && answer?.provider!=="mock" && !answer?.refused
    && suggestion.length>0 && suggestion.length<=chosen.limit && !/[\r\n]/.test(suggestion);

  return <section className={s.assistant} aria-label="Assistente Vivi para conteúdos">
    <div className={s.intro}>
      <span className={s.eyebrow}>ASSISTENTE EXISTENTE DO BACKEND</span>
      <h2>Vivi <em>ao lado da equipe.</em></h2>
      <p>A Vivi ajuda a revisar títulos e textos públicos. A equipe decide o que utilizar: a IA nunca salva, publica ou muda configurações sozinha.</p>
      {loadingStatus?<p role="status">Verificando conexão…</p>:
        <span className={realProvider?s.online:s.demo}>
          {realProvider?"IA conectada":"Modo demonstração — sem modelo externo"} · {status?.provider??"indisponível"}
        </span>}
    </div>
    <form onSubmit={ask} className={s.form}>
      <label>Pergunte à Vivi
        <textarea rows={4} maxLength={2000} value={question} onChange={e=>setQuestion(e.target.value)}
          placeholder="Ex.: crie uma frase acolhedora para a capa. Não informe nomes de membros nem dados pessoais."/>
      </label>
      <div className={s.samples}>{samples.map(sample=><button type="button" key={sample} onClick={()=>setQuestion(sample)}>{sample}</button>)}</div>
      <label className={s.consent}>
        <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
        <span>Concordo em enviar apenas conteúdo público para processamento pela IA, sem informações pessoais ou pastorais.</span>
      </label>
      <button className={s.send} type="submit" disabled={!consent||!question.trim()||busy||!status}>
        {busy?"Consultando a Vivi…":"Pedir sugestão"}
      </button>
    </form>
    {(status?.lgpdNotice||answer?.lgpdNotice)&&<p className={s.privacy}>{answer?.lgpdNotice??status?.lgpdNotice}</p>}
    {error&&<p role="alert" className={s.error}>{error}</p>}
    {answer&&<div className={s.result}>
      <h3>{answer.refused?"Solicitação não permitida":"Resposta da Vivi"}</h3>
      <p className={s.reply}>{answer.reply}</p>
      {answer.provider==="mock"&&<p className={s.warning}>Esta resposta é simulada para testes. Não deve ser usada como conteúdo oficial.</p>}
      {!answer.refused&&<div className={s.apply}>
        <label>Aplicar a sugestão em<select value={target} onChange={e=>setTarget(e.target.value as ViviField)}>
          {fields.map(field=><option value={field.value} key={field.value}>{field.label}</option>)}
        </select></label>
        <button type="button" disabled={!canApply} onClick={()=>onApply(target,suggestion)}>Aplicar ao rascunho</button>
      </div>}
      {!canApply&&!answer.refused&&realProvider&&<small>Para aplicar, solicite uma única frase sem quebras de linha, dentro do limite de {chosen.limit} caracteres. Você também pode copiar e ajustar o texto manualmente.</small>}
    </div>}
  </section>;
}
