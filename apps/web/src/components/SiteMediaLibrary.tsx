"use client";

import { useActionConfirmation } from "./ui/ActionConfirmation";
import { useFeedback } from "./ui/FeedbackProvider";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { getApiBaseUrl } from "../lib/api";
import { withBasePath } from "../lib/paths";
import { resolveSitePhoto, siteMediaLibrary } from "../lib/site-layout";
import s from "./site-media-library.module.css";
import ui from "./ui/ui.module.css";

type MediaAsset = { url:string; pathname:string; name:string; size:number; uploadedAt:string };
type MediaList = { configured:boolean; assets:MediaAsset[]; hasMore?:boolean; message?:string|null };

export function SiteMediaLibrary({token,onChoose}:{token:string;onChoose:(url:string)=>void}){
  const { showFeedback } = useFeedback();
  const { confirm, confirmation } = useActionConfirmation();
  const [media,setMedia]=useState<MediaAsset[]>([]);
  const [ready,setReady]=useState(false),[configured,setConfigured]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [message,setMessage]=useState("");
  const fileInput=useRef<HTMLInputElement>(null);
  const uploadLock=useRef(false);
  const [retrying,setRetrying]=useState(false);
  const refresh=useCallback(async()=>{
    const response=await fetch(getApiBaseUrl()+"/cms/site-media",{
      mode:"cors",credentials:"omit",cache:"no-store",
      headers:{Authorization:"Bearer "+token,Accept:"application/json"},
    });
    if(!response.ok)throw new Error(response.status===403?"Sem permissão para acessar a biblioteca.":"Falha ao consultar as imagens ("+response.status+").");
    const data=await response.json() as MediaList;
    setMedia(data.assets??[]);setConfigured(data.configured===true);setMessage(data.message??"");setError("");setReady(true);
  },[token]);
  useEffect(()=>{
    let cancelled=false;
    void refresh().catch(err=>{if(!cancelled){setError(err instanceof Error?err.message:"Biblioteca indisponível");setReady(true);}});
    return()=>{cancelled=true;};
  },[refresh]);
  async function retry(){
    setRetrying(true);setError("");
    try{await refresh();}catch(err){setConfigured(false);setError(err instanceof Error?err.message:"Biblioteca indisponível");}
    finally{setRetrying(false);setReady(true);}
  }
  function chooseFile(){
    if(busy||uploadLock.current)return;
    if(!configured){showFeedback({tone:"warning",title:"Envio indisponível",message:"Verifique a conexão com a biblioteca e tente novamente. As fotos do acervo continuam disponíveis."});return;}
    fileInput.current?.click();
  }
  async function upload(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value="";
    if(!file||!configured||uploadLock.current)return;
    setError("");
    const allowed=["image/jpeg","image/png","image/webp","image/avif"];
    if(file.size===0||file.size>3*1024*1024||!allowed.includes(file.type)){
      showFeedback({ tone: "error", title: "Arquivo incompatível", message: "Escolha uma foto JPG, PNG, WebP ou AVIF de até 3 MB." });return;
    }
    uploadLock.current=true;
    if (!(await confirm({
      title: "Enviar foto à biblioteca pública?",
      subject: file.name,
      description: "Envie apenas imagens que você tem autorização para divulgar e que não contenham dados pessoais sensíveis.",
      action: "Enviar foto",
      cancel: "Voltar à biblioteca",
    }))) {uploadLock.current=false;return;}
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
      showFeedback({ tone: "success", title: "Foto enviada", message: "A imagem foi selecionada. Salve o rascunho para guardar a mudança." });
      try{await refresh();}catch{setError("Foto enviada, mas não foi possível atualizar a lista. Use Atualizar biblioteca.");}
    }catch(err){showFeedback({ tone: "error", title: "Envio não concluído", message: err instanceof Error?err.message:"Não foi possível enviar a foto." });}
    finally{setBusy(false);uploadLock.current=false;}
  }
  return <div className={s.section}>
    {confirmation}
    <div className={s.toolbar}>
      <div><strong>Fotos da igreja</strong><p>Envie uma nova foto ou reutilize uma já autorizada. Arquivos são públicos somente para divulgação do portal.</p></div>
      <div className={s.uploadActions}>
        <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp,image/avif" disabled={!configured||busy} onChange={upload} aria-label="Arquivo da foto da igreja"/>
        <button type="button" className={ui.workspacePrimary} disabled={!ready||busy||retrying} onClick={chooseFile}>
          {busy?"Enviando…":"+ Enviar foto"}
        </button>
      </div>
    </div>
    {!ready&&<p role="status">Carregando a biblioteca…</p>}
    {ready&&!configured&&<p className={s.warning} role="status">O envio de fotos está indisponível neste momento. Você pode usar o acervo aprovado ou tentar reconectar a biblioteca.</p>}
    {ready&&(!configured||error)&&<button type="button" className={ui.workspaceSecondary} onClick={retry} disabled={retrying||busy}>{retrying?"Consultando…":"Atualizar biblioteca"}</button>}
    {message&&<p className={s.warning}>{message}</p>}
    {error&&<p className={s.error} role="alert">{error}</p>}
    {media.length>0&&<>
      <h3>Fotos enviadas pela equipe <span>({media.length})</span></h3>
      <div className={s.assets}>
        {media.map(asset=><button type="button" key={asset.pathname} onClick={()=>onChoose(asset.url)} title={"Usar "+asset.name}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolveSitePhoto(asset.url)} alt={asset.name} loading="lazy"/>
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
