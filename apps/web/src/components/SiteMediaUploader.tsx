"use client";

import { useCallback,useEffect,useRef,useState,type ChangeEvent } from "react";
import { getApiBaseUrl } from "../lib/api";
import s from "./site-media-uploader.module.css";

type UploadedImage={url:string;pathname:string;size:number;uploadedAt:string};
type Library={images:UploadedImage[];hasMore:boolean};

async function optimizeImage(file:File):Promise<File>{
  if(file.size>15*1024*1024)throw new Error("A imagem original excede 15 MB. Escolha um arquivo menor.");
  if(!["image/jpeg","image/png","image/webp","image/avif"].includes(file.type))throw new Error("Use uma foto JPEG, PNG, WebP ou AVIF.");
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    await new Promise<void>((resolve,reject)=>{
      img.onload=()=>resolve();img.onerror=()=>reject(new Error("Não foi possível ler esta fotografia."));
      img.src=url;
    });
    if(!img.naturalWidth||!img.naturalHeight)throw new Error("Imagem inválida.");
    const scale=Math.min(1,1800/img.naturalWidth,1800/img.naturalHeight);
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const context=canvas.getContext("2d");
    if(!context)throw new Error("Não foi possível preparar a imagem.");
    context.drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>{
      canvas.toBlob(b=>b?resolve(b):reject(new Error("Não foi possível otimizar a imagem.")),"image/webp",0.78);
    });
    if(blob.type!=="image/webp"||blob.size>3*1024*1024)throw new Error("Não foi possível reduzir a imagem a 3 MB. Escolha outra fotografia.");
    return new File([blob],"foto-site-"+Date.now()+".webp",{type:"image/webp"});
  }finally{URL.revokeObjectURL(url);}
}

export function SiteMediaUploader({token,onSelect}:{token:string;onSelect:(url:string)=>void}){
  const [files,setFiles]=useState<UploadedImage[]>([]);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[confirmed,setConfirmed]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const load=useCallback(async()=>{
    const r=await fetch(getApiBaseUrl()+"/cms/site-media",{
      headers:{Authorization:"Bearer "+token,Accept:"application/json"},mode:"cors",credentials:"omit",cache:"no-store",
    });
    if(!r.ok)throw new Error(r.status===503?"A biblioteca ainda não tem armazenamento conectado.":"Não foi possível listar as fotos ("+r.status+").");
    const data=await r.json() as Library;
    setFiles(data.images??[]);
    return data;
  },[token]);

  useEffect(()=>{
    let stopped=false;
    setLoading(true);
    void load().catch(e=>{if(!stopped)setError(e instanceof Error?e.message:"Biblioteca indisponível.");})
      .finally(()=>{if(!stopped)setLoading(false);});
    return()=>{stopped=true;};
  },[load]);

  async function upload(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];
    if(!file)return;
    if(!confirmed){setError("Confirme os direitos de publicação antes de enviar uma imagem.");e.target.value="";return;}
    setBusy(true);setError("");setNotice("");
    try{
      const optimized=await optimizeImage(file);
      const form=new FormData();
      form.append("file",optimized);
      const result=await fetch(getApiBaseUrl()+"/cms/site-media/upload",{
        method:"POST",mode:"cors",credentials:"omit",
        headers:{Authorization:"Bearer "+token,Accept:"application/json"},
        body:form,
      });
      if(!result.ok)throw new Error(result.status===413?"A foto ainda está grande demais.":result.status===403?"Seu perfil não permite enviar imagens.":"Falha no upload ("+result.status+").");
      const data=await result.json() as {url:string};
      if(!data.url.startsWith("https://"))throw new Error("O armazenamento não retornou um endereço seguro.");
      setNotice("Imagem enviada. Clique em Usar foto para colocá-la na página.");
      await load();onSelect(data.url);
    }catch(err){setError(err instanceof Error?err.message:"Não foi possível enviar a foto.");}
    finally{setBusy(false);if(input.current)input.current.value="";}
  }

  return <section aria-label="Biblioteca de mídia da igreja" className={s.library}>
    <h3>Enviar e organizar fotos</h3>
    <p>Envie uma foto diretamente do computador ou celular. Otimizamos a imagem antes de armazenar, sem GitHub ou intervenção técnica.</p>
    <label className={s.consent}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
      <span>Confirmo que a imagem pode ser exibida publicamente no site e que possuo autorização de uso e imagem das pessoas retratadas, quando necessária.</span>
    </label>
    <label className={s.upload}>Selecionar foto<input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy||!confirmed} onChange={e=>void upload(e)}/></label>
    {busy&&<div role="status" className={s.status}>Otimizando e enviando foto…</div>}
    {notice&&<div role="status" className={s.success}>{notice}</div>}
    {error&&<div role="alert" className={s.error}>{error}</div>}
    <h4>Fotos já enviadas</h4>
    {loading&&<p role="status">Carregando a biblioteca…</p>}
    {!loading&&files.length===0&&<p>A biblioteca ainda está vazia. As fotos existentes no site continuam disponíveis abaixo.</p>}
    <div className={s.grid}>{files.map((file,i)=><button type="button" className={s.card} key={file.pathname} onClick={()=>{onSelect(file.url);setNotice("Fotografia selecionada para a prévia. Salve o rascunho para guardar a alteração.");}}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={file.url} alt={"Fotografia da biblioteca "+(i+1)} loading="lazy"/>
      <span>Usar foto</span>
    </button>)}</div>
  </section>;
}
