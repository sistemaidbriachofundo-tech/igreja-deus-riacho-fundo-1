"use client";

import { useActionConfirmation } from "./ui/ActionConfirmation";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { getApiBaseUrl } from "../lib/api";
import { withBasePath } from "../lib/paths";
import { siteMediaLibrary } from "../lib/site-layout";
import s from "./site-media-library.module.css";

type MediaAsset = { url:string; pathname:string; name:string; size:number; uploadedAt:string };
type MediaList = { configured:boolean; assets:MediaAsset[]; hasMore?:boolean; message?:string|null };

export function SiteMediaLibrary({token,onChoose}:{token:string;onChoose:(url:string)=>void}){
  const { confirm, confirmation } = useActionConfirmation();
  const [media,setMedia]=useState<MediaAsset[]>([]);
  const [ready,setReady]=useState(false),[configured,setConfigured]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    const response=await fetch(getApiBaseUrl()+"/cms/site-media",{
      mode:"cors",credentials:"omit",cache:"no-store",
      headers:{Authorization:"Bearer "+token,Accept:"application/json"},
    });
    if(!response.ok)throw new Error(response.status===403?"Sem permissão para acessar a biblioteca.":"Falha ao consultar as imagens ("+response.status+").");
    const data=await response.json() as MediaList;
    setMedia(data.assets??[]);setConfigured(data.configured);setMessage(data.message??"");setReady(true);
  },[token]);
  useEffect(()=>{
    let cancelled=false;
    void refresh().catch(err=>{if(!cancelled){setError(err instanceof Error?err.message:"Biblioteca indisponível");setReady(true);}});
    return()=>{cancelled=true;};
  },[refresh]);
  async function upload(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    setError("");setNotice("");
    const allowed=["image/jpeg","image/png","image/webp","image/avif"];
    if(file.size===0||file.size>3*1024*1024||!allowed.includes(file.type)){
      setError("Escolha JPG, PNG, WebP ou AVIF de até 3 MB.");return;
    }
    if (!(await confirm({
      title: "Enviar foto à biblioteca pública?",
      subject: file.name,
      description: "Envie apenas imagens que você tem autorização para divulgar e que não contenham dados pessoais sensíveis.",
      action: "Enviar foto",
      cancel: "Voltar à biblioteca",
    }))) return;
    setBusy(true);
    try{
      const form=new FormData();
      form.append("file",file,file.name);
      const response=await fetch(getApiBaseUrl()+"/cms/site-media",{
        method:"POST",mode:"cors",credentials:"omit",
        headers:{Authorization:"Bearer "+token,Accept:"application/json"},
        body:form,
      });
      if(!response.ok)throw new Error(response.status===413?"Arquivo acima do limite de 3 MB.":"Falha no envio ("+response.status+").");
      const data=await response.json() as {asset:MediaAsset};
      onChoose(data.asset.url);
      setNotice("Foto enviada e selecionada. Salve o rascunho para guardar a mudança.");
      await refresh();
    }catch(err){setError(err instanceof Error?err.message:"Não foi possível enviar a foto.");}
    finally{setBusy(false);}
  }
  return <div className={s.section}>
    {confirmation}
    <div className={s.toolbar}>
      <div><strong>Fotos da igreja</strong><p>Envie uma nova foto ou reutilize uma já autorizada. Arquivos são públicos somente para divulgação do portal.</p></div>
      <label className={s.uploadButton} aria-disabled={!configured||busy}>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={!configured||busy} onChange={upload} aria-label="Enviar foto da igreja"/>
        {busy?"Enviando…":"+ Enviar foto"}
      </label>
    </div>
    {!ready&&<p role="status">Carregando a biblioteca…</p>}
    {ready&&!configured&&<p className={s.warning}>O armazenamento ainda não está habilitado para este ambiente. Você pode usar as fotos já incluídas no site.</p>}
    {message&&<p className={s.warning}>{message}</p>}
    {error&&<p className={s.error} role="alert">{error}</p>}
    {notice&&<p className={s.notice} role="status">{notice}</p>}
    {media.length>0&&<>
      <h3>Fotos enviadas pela equipe <span>({media.length})</span></h3>
      <div className={s.assets}>
        {media.map(asset=><button type="button" key={asset.pathname} onClick={()=>onChoose(asset.url)} title={"Usar "+asset.name}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.url} alt={asset.name} loading="lazy"/>
          <span>{asset.name}</span>
          <small>{(asset.size/1024).toFixed(0)} KB</small>
        </button>)}
      </div>
    </>}
    <h3>Acervo aprovado do site <span>({siteMediaLibrary.length})</span></h3>
    <div className={s.assets}>
      {siteMediaLibrary.map(asset=><button type="button" key={asset.src} onClick={()=>onChoose(asset.src)} title={"Usar "+asset.title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBasePath(asset.src)} alt={asset.title} loading="lazy"/>
        <span>{asset.title}</span>
      </button>)}
    </div>
    <p className={s.footer}>A biblioteca utiliza armazenamento persistente. Fotografias enviadas não podem conter informações pessoais sensíveis; evite imagens de crianças sem autorização adequada. O envio não publica a foto na Home: é necessário salvar e publicar a configuração.</p>
  </div>;
}
