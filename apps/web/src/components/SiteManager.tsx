"use client";

import { useActionConfirmation } from "./ui/ActionConfirmation";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppShell, UIIcon } from "./AppShell";
import { SiteMediaLibrary } from "./SiteMediaLibrary";
import { PageHeader } from "./ui/PageHeader";
import { ViviEditorialAssistant } from "./ViviEditorialAssistant";
import { ApiRequestError, apiLogin, clearToken, getApiBaseUrl, isInvalidSession, loadStoredToken, storeToken } from "../lib/api";
import type { RiachinhoParsedSuggestion } from "../lib/riachinho-suggestion";
import { defaultSiteLayout, parseSiteLayout, resolveSitePhoto, sectionNames, validSiteImage, type SiteLayout } from "../lib/site-layout";
import { SITE_IDENTITY_PHOTO } from "@idbrf/shared";
import { withBasePath } from "../lib/paths";
import ui from "./ui/ui.module.css";
import s from "./site-manager.module.css";

type Tab = "conteudo"|"imagens"|"aparencia"|"estrutura"|"historico"|"vivi";
type Revision = {id:string;date:string;actorUserId:string|null;note:string|null};
type State = {draft:SiteLayout;published:SiteLayout|null;draftUpdatedAt:string|null;publishedAt:string|null;revisions:Revision[];permissions:{canPublish:boolean}};
const tabs: {key:Tab;label:string}[] = [
  {key:"conteudo",label:"Textos"},{key:"imagens",label:"Fotos"},{key:"aparencia",label:"Cores"},
  {key:"estrutura",label:"Estrutura"},{key:"historico",label:"Histórico"},
];
const optionalSections = ["galeria", "videos"] as const;
const imageUrl=resolveSitePhoto;

function SiteLayoutCanvas({layout,device}:{layout:SiteLayout;device:"desktop"|"mobile"}){
  return <div className={s.previewCanvas} data-device={device} data-appearance={layout.appearance}>
    <div className={s.previewTop}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={withBasePath("/images/logo-igreja-aprovada.webp")} alt="" width={26} height={26} /><strong>Igreja de Deus</strong><small>Riacho Fundo I</small>
    </div>
    <div className={s.previewCover}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl(layout.hero.imageUrl)} alt="Fotografia escolhida para a capa" />
      <div className={s.previewIntro}>
        <div><small>Brasília, DF</small><h2>{layout.hero.title}<em>{layout.hero.accent}</em></h2></div>
        <div><p>{layout.hero.description}</p><span>Horários dos cultos</span></div>
      </div>
    </div>
    <div className={s.previewGallery}>
      <h3>Quem somos</h3>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl((layout.identity ?? SITE_IDENTITY_PHOTO).imageUrl)} alt={(layout.identity ?? SITE_IDENTITY_PHOTO).alt} width={120} />
    </div>
    <div className={s.previewAgenda}><h3>Cultos de domingo</h3><p>10h e 19h</p></div>
    {!layout.hidden.includes("galeria") && <div className={s.previewGallery}>
      <h3>{layout.gallery.title} <em>{layout.gallery.accent}</em></h3><p>{layout.gallery.description}</p>
      <div>{layout.gallery.items.map((item,index)=><figure key={index}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl(item.imageUrl)} alt={item.alt}/><figcaption>{item.title}</figcaption>
      </figure>)}</div>
    </div>}
    {!layout.hidden.includes("videos") && <div className={s.previewGallery}><h3>Cultos e mensagens</h3></div>}
  </div>;
}

export function SiteReaderPreview({published,device}:{published:SiteLayout|null;device:"desktop"|"mobile"}){
  if(!published){
    return <p className={s.readerEmpty} data-reader="empty">A página pública ainda usa o conteúdo padrão da igreja.</p>;
  }
  return <div data-reader="published"><SiteLayoutCanvas layout={published} device={device}/></div>;
}

async function siteRequest<T>(token:string,path:string,method:"GET"|"PATCH"|"POST"="GET",body?:unknown):Promise<T>{
  if(!/^\/cms\/site-layout(?:\/draft|\/publish|\/restore\/[a-zA-Z0-9-]+)?$/.test(path))throw new Error("Rota não autorizada");
  const r=await fetch(getApiBaseUrl()+path,{
    method,credentials:"omit",cache:"no-store",mode:"cors",
    headers:{Authorization:"Bearer "+token,Accept:"application/json",...(body===undefined?{}:{"Content-Type":"application/json"})},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  if(!r.ok){
    if(r.status===401)throw new ApiRequestError("Sessão expirada. Entre novamente.", 401, "unauthorized");
    if(r.status===403)throw new Error("Seu perfil não tem autorização para gerenciar o site.");
    if(r.status===409)throw new Error("Outra pessoa alterou esta página. Atualize antes de salvar.");
    throw new Error("Não foi possível concluir a operação ("+r.status+").");
  }
  return r.json() as Promise<T>;
}

export function SiteManager() {
  const { confirm, confirmation } = useActionConfirmation();
  const [token,setToken]=useState<string|null>(null);
  const [checking,setChecking]=useState(true),[busy,setBusy]=useState(false);
  const [email,setEmail]=useState(""),[password,setPassword]=useState("");
  const [tab,setTab]=useState<Tab>("conteudo"),[previewDevice,setPreviewDevice]=useState<"desktop"|"mobile">("desktop"),[previewMode,setPreviewMode]=useState<"rascunho"|"leitor">("rascunho");
  const [layout,setLayout]=useState<SiteLayout>(defaultSiteLayout);
  const [draftUpdatedAt,setDraftUpdatedAt]=useState<string|null>(null);
  const [published,setPublished]=useState<SiteLayout|null>(null);
  const [canPublish,setCanPublish]=useState(false);
  const [publishedAt,setPublishedAt]=useState<string|null>(null);
  const [revisions,setRevisions]=useState<Revision[]>([]);
  const [dirty,setDirty]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
  const [imageSlot,setImageSlot]=useState<"hero"|"identity"|number>("hero");

  const configured=Boolean(process.env.NEXT_PUBLIC_API_URL);
  const refresh=useCallback(async(t:string)=>{
    const result=await siteRequest<State>(t,"/cms/site-layout");
    const config=parseSiteLayout(result.draft);
    if(!config)throw new Error("A configuração recebida não é válida.");
    setLayout(config);
    setDraftUpdatedAt(result.draftUpdatedAt);
    setPublished(result.published?parseSiteLayout(result.published):null);
    setPublishedAt(result.publishedAt);
    setRevisions(result.revisions);
    setCanPublish(result.permissions?.canPublish===true);
    setDirty(false);
  },[]);
  useEffect(()=>{
    const saved=loadStoredToken();
    if(!saved){setChecking(false);return;}
    let cancelled=false;
    void refresh(saved).then(()=>{if(!cancelled)setToken(saved);})
      .catch(err=>{
        if(cancelled)return;
        setError(err instanceof Error?err.message:"Falha no acesso.");
        const denied=err instanceof Error && err.message.includes("não tem autorização");
        if(isInvalidSession(err))clearToken();
        else if(!denied)setToken(saved);
      })
      .finally(()=>{if(!cancelled)setChecking(false);});
    return()=>{cancelled=true;};
  },[refresh]);

  function update(next:SiteLayout){setLayout(next);setDirty(true);setNotice("");}
  function setHero(field:keyof SiteLayout["hero"],value:string){
    update({...layout,hero:{...layout.hero,[field]:value}});
  }
  function setGallery(field:"title"|"accent"|"description",value:string){
    update({...layout,gallery:{...layout.gallery,[field]:value}});
  }
  function setPhoto(value:string){
    if(!validSiteImage(value)){setError("Escolha uma foto da biblioteca ou uma imagem enviada ao armazenamento da igreja.");return;}
    if(imageSlot==="hero")setHero("imageUrl",value);
    else if(imageSlot==="identity")update({...layout,identity:{...(layout.identity??SITE_IDENTITY_PHOTO),imageUrl:value}});
    else {
      const items=layout.gallery.items.map((item,i)=>i===imageSlot?{...item,imageUrl:value}:item);
      update({...layout,gallery:{...layout.gallery,items}});
    }
    setError("");
  }
  function changePhotoText(index:number,field:"title"|"subtitle"|"alt",value:string){
    update({...layout,gallery:{...layout.gallery,
      items:layout.gallery.items.map((item,i)=>i===index?{...item,[field]:value}:item),
    }});
  }
  function toggle(key:(typeof optionalSections)[number]){
    const hidden=layout.hidden.includes(key)?layout.hidden.filter(x=>x!==key):[...layout.hidden,key];
    update({...layout,hidden});
  }
  async function reloadDraft() {
    if (dirty && !await confirm({
      title: "Recarregar o rascunho?",
      description: "Você perderá as alterações que ainda não salvou.",
      action: "Recarregar rascunho",
    })) return;
    if (!token) return;
    void work(async()=>{await refresh(token);setNotice("Rascunho salvo carregado.");});
  }
  async function login(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");
    try{
      const response=await apiLogin(email.trim(),password);
      await refresh(response.accessToken);
      storeToken(response.accessToken);setToken(response.accessToken);setPassword("");
    }catch(err){setError(err instanceof Error?err.message:"Erro de login.");}
    finally{setBusy(false);setChecking(false);}
  }
  async function work(fn:()=>Promise<void>){
    setBusy(true);setError("");setNotice("");
    try{await fn();}catch(err){setError(err instanceof Error?err.message:"Operação não concluída.");}
    finally{setBusy(false);}
  }
  function save(){
    if(!token)return;
    const validated=parseSiteLayout(layout);
    if(!validated){setError("Revise os campos obrigatórios, imagens e limites antes de salvar.");return;}
    void work(async()=>{
      const result=await siteRequest<{draftUpdatedAt:string}>(token,"/cms/site-layout/draft","PATCH",{layout:validated,expectedUpdatedAt:draftUpdatedAt});
      setDraftUpdatedAt(result.draftUpdatedAt);setDirty(false);
      setNotice("Rascunho salvo. Você pode conferir a prévia antes de publicar.");
    });
  }
  async function publish(){
    if(!token||dirty||!draftUpdatedAt||!canPublish||busy)return;
    if (!(await confirm({
      title: "Publicar página inicial?",
      description: "O rascunho salvo passará a ser a versão publicada da página inicial.",
      action: "Publicar página",
      cancel: "Voltar ao rascunho",
    }))) return;
    void work(async()=>{
      await siteRequest(token,"/cms/site-layout/publish","POST",{expectedUpdatedAt:draftUpdatedAt});
      await refresh(token);
      setNotice("Versão publicada. Sites com leitura dinâmica habilitada recebem a atualização automaticamente.");
    });
  }
  async function restore(id:string){
    if (!token || busy) return;
    if (!(await confirm({
      title: "Restaurar versão no rascunho?",
      description: "A versão escolhida substituirá o conteúdo atual do rascunho, inclusive as alterações ainda sem salvar.",
      action: "Restaurar rascunho",
      cancel: "Manter rascunho atual",
      tone: "danger",
    }))) return;
    void work(async()=>{
      await siteRequest(token,"/cms/site-layout/restore/"+id,"POST");
      await refresh(token);setNotice("Versão recuperada no rascunho. Confira e publique quando estiver pronta.");
    });
  }
  function applyRiachinhoSuggestion(suggestion:RiachinhoParsedSuggestion){
    if(suggestion.target==="alts"&&suggestion.alts?.length){
      const items=layout.gallery.items.map((item,i)=>({
        ...item,
        alt:suggestion.alts?.[i]??item.alt,
      }));
      update({...layout,gallery:{...layout.gallery,items}});
    }else if(suggestion.target==="gallery"){
      update({
        ...layout,
        gallery:{
          ...layout.gallery,
          title:suggestion.title??layout.gallery.title,
          accent:suggestion.accent??layout.gallery.accent,
          description:suggestion.description??layout.gallery.description,
        },
      });
    }else{
      update({
        ...layout,
        hero:{
          ...layout.hero,
          title:suggestion.title??layout.hero.title,
          accent:suggestion.accent??layout.hero.accent,
          description:suggestion.description??layout.hero.description,
        },
      });
    }
    setTab("conteudo");
    setNotice("Sugestão aplicada. Revise o texto e salve o rascunho.");
  }

  return <AppShell active="site" meta="Gestão do site" editorial>
    <div className={s.page} id="capa">
    {confirmation}
      <PageHeader appearance="workspace" heading="h1" title="Gestão do site"
        description="Edite a capa, os textos e as fotos da página inicial." />
      {!configured&&<div className={s.message}>O ambiente de edição ainda não está conectado. A página pública permanece como está.</div>}
      {error&&<div className={s.error} role="alert">{error}</div>}
      {notice&&<div className={s.notice} role="status">{notice}</div>}
      {checking&&<div role="status" className={s.message}>Verificando acesso…</div>}
      {!checking&&configured&&!token&&<section className={s.loginWrap}>
        <div><span className={s.eyebrow}>CONTA AUTORIZADA</span><h2>Entre para administrar o site</h2><p>Use sua conta de editor ou publicador. Nenhuma mudança será publicada automaticamente.</p></div>
        <form onSubmit={login} className={s.form}>
          <label>E-mail<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
          <label>Senha<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
          <button disabled={busy} type="submit" className={s.primary}>Entrar no editor</button>
        </form>
      </section>}
      {token&&<div className={s.workspace}>
        <div className={s.actionbar}>
          <div><strong>{dirty?"Alterações não salvas":published?"Página publicada":"Página padrão no ar"}</strong></div>
          <div className={s.actions}>
            <button type="button" disabled={busy} className={ui.workspaceQuiet} onClick={() => void reloadDraft()}>Recarregar</button>
            <button type="button" disabled={busy||!dirty} className={dirty ? ui.workspacePrimary : ui.workspaceSecondary} onClick={save}>Salvar rascunho</button>
            {canPublish && <button type="button" disabled={busy||dirty||!draftUpdatedAt} className={dirty ? ui.workspaceSecondary : ui.workspacePrimary} onClick={publish}>Publicar página</button>}
          </div>
        </div>
        {!canPublish&&<p className={s.warning} role="status">Seu perfil pode preparar e salvar o site. A publicação precisa ser feita por um pastor ou publicador autorizado.</p>}
        <div className={s.columns}>
          <section className={s.editor} aria-label="Controles de edição">
            <div className={s.tabs} role="group" aria-label="Ferramentas do editor">
              {tabs.map(item=><button type="button" key={item.key} className={tab===item.key?s.activeTab:s.tab} aria-pressed={tab===item.key} onClick={()=>setTab(item.key)}>{item.label}</button>)}
            </div>
            {tab==="conteudo"&&<div className={s.controls}>
              <div className={s.editorHeading}><h2>Textos da página</h2><button type="button" className={ui.workspaceQuiet} onClick={() => setTab("vivi")}>Ajuda de redação</button></div>
              <h3>Capa principal</h3>
              <label>Título principal<input value={layout.hero.title} maxLength={110} onChange={e=>setHero("title",e.target.value)}/></label>
              <label>Palavra ou frase de destaque<input value={layout.hero.accent} maxLength={110} onChange={e=>setHero("accent",e.target.value)}/></label>
              <label>Texto de apresentação<textarea rows={4} maxLength={500} value={layout.hero.description} onChange={e=>setHero("description",e.target.value)}/></label>
              <h3>Galeria</h3>
              <label>Título da galeria<input maxLength={110} value={layout.gallery.title} onChange={e=>setGallery("title",e.target.value)}/></label>
              <label>Destaque<input maxLength={110} value={layout.gallery.accent} onChange={e=>setGallery("accent",e.target.value)}/></label>
              <label>Descrição<textarea rows={3} maxLength={500} value={layout.gallery.description} onChange={e=>setGallery("description",e.target.value)}/></label>
              {layout.gallery.items.map((item,i)=><div className={s.photoFields} key={i}><strong>Foto {i+1}</strong>
                <label>Título<input maxLength={55} value={item.title} onChange={e=>changePhotoText(i,"title",e.target.value)}/></label>
                <label>Legenda<input maxLength={80} value={item.subtitle} onChange={e=>changePhotoText(i,"subtitle",e.target.value)}/></label>
                <label>Descrição acessível<input maxLength={220} value={item.alt} onChange={e=>changePhotoText(i,"alt",e.target.value)}/></label></div>)}
            </div>}
            {tab==="imagens"&&<div className={s.controls}>
              <h2>Fotos da página inicial</h2>
              <p>Escolha a foto que deseja trocar e selecione uma imagem do acervo ou envie um arquivo.</p>
              <label>Local da foto<select value={String(imageSlot)} onChange={event=>{
                const value=event.target.value;
                setImageSlot(value==="hero"||value==="identity"?value:Number(value));
              }}>
                <option value="hero">Capa principal</option>
                <option value="identity">Quem somos</option>
                {layout.gallery.items.map((item,index)=><option value={index} key={index}>Galeria · {item.title}</option>)}
              </select></label>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={s.currentPhoto} src={imageUrl(imageSlot==="hero"?layout.hero.imageUrl:imageSlot==="identity"?(layout.identity??SITE_IDENTITY_PHOTO).imageUrl:layout.gallery.items[imageSlot]?.imageUrl??layout.hero.imageUrl)} alt="Foto selecionada para este local" />
              {imageSlot==="identity"&&<label>Descrição acessível<input maxLength={220} value={(layout.identity??SITE_IDENTITY_PHOTO).alt}
                onChange={event=>update({...layout,identity:{...(layout.identity??SITE_IDENTITY_PHOTO),alt:event.target.value}})} /></label>}
              <SiteMediaLibrary token={token} onChoose={setPhoto}/>
            </div>}
            {tab==="aparencia"&&<div className={s.controls}>
              <h2>Aparência</h2><p>Três opções seguras. Logo, tipografia, contrastes mínimos e estrutura técnica permanecem protegidos.</p>
              <div className={s.palettes}>
                {(["dourado","verde","marfim"] as const).map(key=><button key={key} type="button" aria-pressed={layout.appearance===key} className={layout.appearance===key?s.paletteSelected:s.palette}
                  onClick={()=>update({...layout,appearance:key})}><span className={s.swatch} data-theme={key}/><strong>{key==="dourado"?"Dourado institucional":key==="verde"?"Verde acolhedor":"Marfim claro"}</strong><small>{layout.appearance===key?"Selecionado":"Aplicar paleta"}</small></button>)}
              </div>
            </div>}
            {tab==="estrutura"&&<div className={s.controls}>
              <h2>Seções da página inicial</h2>
              <ul className={s.sections}>{optionalSections.map(key=><li key={key}>
                <strong>{sectionNames[key]}</strong>
                <label className={s.toggle}><input type="checkbox" checked={!layout.hidden.includes(key)} onChange={()=>toggle(key)}/>Exibir {sectionNames[key].toLocaleLowerCase("pt-BR")}</label>
              </li>)}</ul>
            </div>}
            {tab==="vivi"&&<div className={s.controls}><button type="button" className={ui.workspaceQuiet} onClick={() => setTab("conteudo")}>Voltar aos textos</button><ViviEditorialAssistant token={token} layout={layout} onApplySuggestion={applyRiachinhoSuggestion}/></div>}
            {tab==="historico"&&<div className={s.controls}>
              <h2>Histórico de publicações</h2><p>Restaure uma versão ao rascunho. Nada é substituído no site sem nova publicação.</p>
              {!revisions.length&&<p>Nenhuma versão publicada no histórico.</p>}
              {revisions.map((revision,index)=><div className={s.historyItem} key={revision.id}><span><strong>Versão {revisions.length-index}</strong><small>{new Date(revision.date).toLocaleString("pt-BR")}</small></span>
                <button type="button" disabled={busy} onClick={()=>restore(revision.id)}>Restaurar rascunho</button></div>)}
            </div>}
          </section>
          <section className={s.preview} aria-label="Pré-visualização da página">
            <div className={s.previewHead}><div><span className={s.mutedLabel}>{previewMode==="leitor"?"O QUE O LEITOR VÊ":"RASCUNHO DA EQUIPE"}</span><strong>{previewMode==="leitor"?"Versão publicada":"Prévia do rascunho"}</strong></div>
              <div className={s.deviceSwitch}>
                <button type="button" aria-pressed={previewMode==="rascunho"} onClick={()=>setPreviewMode("rascunho")}>Rascunho</button>
                <button type="button" aria-pressed={previewMode==="leitor"} onClick={()=>setPreviewMode("leitor")}>Como leitor</button>
                <button type="button" aria-pressed={previewDevice==="desktop"} onClick={()=>setPreviewDevice("desktop")}>Computador</button>
                <button type="button" aria-pressed={previewDevice==="mobile"} onClick={()=>setPreviewDevice("mobile")}>Celular</button>
              </div>
            </div>
            {previewMode==="leitor"
              ? <SiteReaderPreview published={published} device={previewDevice}/>
              : <SiteLayoutCanvas layout={layout} device={previewDevice}/>}
          </section>
        </div>
      </div>}
    </div>
  </AppShell>;
}
