"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppShell, UIIcon } from "./AppShell";
import { apiLogin, clearToken, getApiBaseUrl, loadStoredToken, storeToken } from "../lib/api";
import { defaultSiteLayout, parseSiteLayout, sectionNames, siteMediaLibrary, siteSections, validSiteImage, type SiteLayout, type SiteSection } from "../lib/site-layout";
import { withBasePath } from "../lib/paths";
import s from "./site-manager.module.css";

type Tab = "conteudo"|"imagens"|"aparencia"|"estrutura"|"historico";
type Revision = {id:string;date:string;actorUserId:string|null;note:string|null};
type State = {draft:SiteLayout;published:SiteLayout|null;draftUpdatedAt:string|null;publishedAt:string|null;revisions:Revision[]};
const tabs: {key:Tab;label:string}[] = [
  {key:"conteudo",label:"Textos"},{key:"imagens",label:"Fotos"},{key:"aparencia",label:"Cores"},
  {key:"estrutura",label:"Estrutura"},{key:"historico",label:"Histórico"},
];
const imageUrl=(url:string)=>url.startsWith("/")?withBasePath(url):url;

async function siteRequest<T>(token:string,path:string,method:"GET"|"PATCH"|"POST"="GET",body?:unknown):Promise<T>{
  if(!/^\/cms\/site-layout(?:\/draft|\/publish|\/restore\/[a-zA-Z0-9-]+)?$/.test(path))throw new Error("Rota não autorizada");
  const r=await fetch(getApiBaseUrl()+path,{
    method,credentials:"omit",cache:"no-store",mode:"cors",
    headers:{Authorization:"Bearer "+token,Accept:"application/json",...(body===undefined?{}:{"Content-Type":"application/json"})},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  if(!r.ok){
    if(r.status===401)throw new Error("Sessão expirada. Entre novamente.");
    if(r.status===403)throw new Error("Seu perfil não tem autorização para gerenciar o site.");
    if(r.status===409)throw new Error("Outra pessoa alterou esta página. Atualize antes de salvar.");
    throw new Error("Não foi possível concluir a operação ("+r.status+").");
  }
  return r.json() as Promise<T>;
}

export function SiteManager() {
  const [token,setToken]=useState<string|null>(null);
  const [checking,setChecking]=useState(true),[busy,setBusy]=useState(false);
  const [email,setEmail]=useState(""),[password,setPassword]=useState("");
  const [tab,setTab]=useState<Tab>("conteudo"),[previewDevice,setPreviewDevice]=useState<"desktop"|"mobile">("desktop");
  const [layout,setLayout]=useState<SiteLayout>(defaultSiteLayout);
  const [draftUpdatedAt,setDraftUpdatedAt]=useState<string|null>(null);
  const [published,setPublished]=useState<SiteLayout|null>(null);
  const [publishedAt,setPublishedAt]=useState<string|null>(null);
  const [revisions,setRevisions]=useState<Revision[]>([]);
  const [dirty,setDirty]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
  const [imageSlot,setImageSlot]=useState<"hero"|0|1|2|3>("hero"),[customUrl,setCustomUrl]=useState("");

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
    setDirty(false);
  },[]);
  useEffect(()=>{
    const saved=loadStoredToken();
    if(!saved){setChecking(false);return;}
    let cancelled=false;
    void refresh(saved).then(()=>{if(!cancelled)setToken(saved);})
      .catch(err=>{if(!cancelled){setError(err instanceof Error?err.message:"Falha no acesso.");clearToken();}})
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
    if(!validSiteImage(value)){setError("Escolha uma imagem da biblioteca ou informe um endereço HTTPS válido.");return;}
    if(imageSlot==="hero")setHero("imageUrl",value);
    else {
      const items=layout.gallery.items.map((item,i)=>i===imageSlot?{...item,imageUrl:value}:item);
      update({...layout,gallery:{...layout.gallery,items}});
    }
    setCustomUrl("");setError("");
  }
  function changePhotoText(index:number,field:"title"|"subtitle"|"alt",value:string){
    update({...layout,gallery:{...layout.gallery,
      items:layout.gallery.items.map((item,i)=>i===index?{...item,[field]:value}:item),
    }});
  }
  function move(key:SiteSection,delta:-1|1){
    const order=[...layout.sections],idx=order.indexOf(key),target=idx+delta;
    if(target<0||target>=order.length)return;
    [order[idx],order[target]]=[order[target],order[idx]];
    update({...layout,sections:order});
  }
  function toggle(key:SiteSection){
    if(key==="convite")return;
    const hidden=layout.hidden.includes(key)?layout.hidden.filter(x=>x!==key):[...layout.hidden,key];
    update({...layout,hidden});
  }
  function logout(){clearToken();setToken(null);setPassword("");setError("");setNotice("");}
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
      setNotice("Rascunho salvo no banco. A página pública não foi alterada.");
    });
  }
  function publish(){
    if(!token||dirty||!draftUpdatedAt)return;
    if(!window.confirm("Publicar a versão salva da Home? Esta ação atualiza a configuração aprovada do site."))return;
    void work(async()=>{
      await siteRequest(token,"/cms/site-layout/publish","POST",{expectedUpdatedAt:draftUpdatedAt});
      await refresh(token);
      setNotice("Versão publicada. Sites com leitura dinâmica habilitada recebem a atualização automaticamente.");
    });
  }
  function restore(id:string){
    if(!token||!window.confirm("Restaurar esta versão ao RASCUNHO? A versão publicada continuará intacta."))return;
    void work(async()=>{
      await siteRequest(token,"/cms/site-layout/restore/"+id,"POST");
      await refresh(token);setNotice("Versão recuperada no rascunho. Confira e publique quando estiver pronta.");
    });
  }

  return <AppShell active="site" meta="Gestão do site" editorial>
    <div className={s.page}>
      <header className={s.hero}>
        <div><span className={s.eyebrow}>ID RIACHO 1 / CENTRAL DE GESTÃO</span>
          <h1>Seu site, nas mãos <em>da sua equipe.</em></h1>
          <p>Atualize o conteúdo visualmente, teste o resultado e publique com segurança. Sem precisar editar código ou acessar o GitHub.</p></div>
        <span className={s.statusPill}><UIIcon name="shield" size={16}/> Acesso por perfil</span>
      </header>
      {!configured&&<div className={s.message}>A API editorial ainda não está configurada nesta instalação. A versão pública não aceita alterações por navegador.</div>}
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
          <div><span className={s.mutedLabel}>PÁGINA INICIAL</span><strong>{dirty?"Alterações não salvas":published?"Versão publicada disponível":"Ainda não publicado"}</strong></div>
          <div className={s.actions}>
            <button type="button" disabled={busy} className={s.lightButton} onClick={()=>void work(async()=>{await refresh(token);setNotice("Última versão salva carregada.");})}>Recarregar</button>
            <button type="button" disabled={busy||!dirty} className={s.saveButton} onClick={save}>Salvar rascunho</button>
            <button type="button" disabled={busy||dirty||!draftUpdatedAt} className={s.publishButton} onClick={publish}>Publicar Home</button>
            <button type="button" className={s.logout} onClick={logout}>Sair</button>
          </div>
        </div>
        <div className={s.columns}>
          <section className={s.editor} aria-label="Controles de edição">
            <div className={s.tabs} role="group" aria-label="Ferramentas do editor">
              {tabs.map(item=><button type="button" key={item.key} className={tab===item.key?s.activeTab:s.tab} aria-pressed={tab===item.key} onClick={()=>setTab(item.key)}>{item.label}</button>)}
            </div>
            {tab==="conteudo"&&<div className={s.controls}>
              <h2>Textos da página</h2><p>Escreva normalmente; a prévia mostra as mudanças antes da publicação.</p>
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
              <h2>Biblioteca de fotos</h2><p>Escolha uma fotografia já aprovada para o site ou um endereço HTTPS autorizado. O upload direto de novos arquivos dependerá da implantação do armazenamento persistente.</p>
              <label>Onde usar a imagem<select value={String(imageSlot)} onChange={e=>setImageSlot(e.target.value==="hero"?"hero":Number(e.target.value) as 0|1|2|3)}>
                <option value="hero">Capa principal</option>{[0,1,2,3].map(x=><option value={x} key={x}>Galeria — foto {x+1}</option>)}
              </select></label>
              <div className={s.assetGrid}>{siteMediaLibrary.map(asset=><button className={s.asset} type="button" key={asset.src} onClick={()=>setPhoto(asset.src)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={withBasePath(asset.src)} loading="lazy" /><span>{asset.title}</span>
              </button>)}</div>
              <div className={s.urlEntry}><label>Outra foto autorizada (endereço HTTPS)<input type="url" placeholder="https://..." value={customUrl} onChange={e=>setCustomUrl(e.target.value)}/></label>
                <button type="button" disabled={!customUrl.trim()} className={s.lightButton} onClick={()=>setPhoto(customUrl.trim())}>Usar esta imagem</button></div>
            </div>}
            {tab==="aparencia"&&<div className={s.controls}>
              <h2>Aparência</h2><p>Três opções seguras. Logo, tipografia, contrastes mínimos e estrutura técnica permanecem protegidos.</p>
              <div className={s.palettes}>
                {(["dourado","verde","marfim"] as const).map(key=><button key={key} type="button" aria-pressed={layout.appearance===key} className={layout.appearance===key?s.paletteSelected:s.palette}
                  onClick={()=>update({...layout,appearance:key})}><span className={s.swatch} data-theme={key}/><strong>{key==="dourado"?"Dourado institucional":key==="verde"?"Verde acolhedor":"Marfim claro"}</strong><small>{layout.appearance===key?"Selecionado":"Aplicar paleta"}</small></button>)}
              </div>
            </div>}
            {tab==="estrutura"&&<div className={s.controls}>
              <h2>Organização da página</h2><p>Reordene as seções com as setas e escolha quais aparecem. O convite final fica sempre visível.</p>
              <ol className={s.sections}>{layout.sections.map((key,i)=><li key={key}>
                <span><strong>{sectionNames[key]}</strong><small>{layout.hidden.includes(key)?"Oculta":"Visível"}</small></span>
                <div>
                  <button type="button" aria-label={"Subir "+sectionNames[key]} disabled={i===0} onClick={()=>move(key,-1)}>↑</button>
                  <button type="button" aria-label={"Descer "+sectionNames[key]} disabled={i===layout.sections.length-1} onClick={()=>move(key,1)}>↓</button>
                  <label className={s.toggle}><input type="checkbox" checked={!layout.hidden.includes(key)} disabled={key==="convite"} onChange={()=>toggle(key)}/>Exibir</label>
                </div></li>)}</ol>
            </div>}
            {tab==="historico"&&<div className={s.controls}>
              <h2>Histórico de publicações</h2><p>Restaure uma versão ao rascunho. Nada é substituído no site sem nova publicação.</p>
              {!revisions.length&&<p>Nenhuma versão publicada no histórico.</p>}
              {revisions.map((revision,index)=><div className={s.historyItem} key={revision.id}><span><strong>Versão {revisions.length-index}</strong><small>{new Date(revision.date).toLocaleString("pt-BR")}</small></span>
                <button type="button" disabled={busy} onClick={()=>restore(revision.id)}>Restaurar rascunho</button></div>)}
            </div>}
          </section>
          <section className={s.preview} aria-label="Pré-visualização da página">
            <div className={s.previewHead}><div><span className={s.mutedLabel}>VISUALIZAÇÃO INSTANTÂNEA</span><strong>Prévia da Home</strong></div>
              <div className={s.deviceSwitch}><button type="button" aria-pressed={previewDevice==="desktop"} onClick={()=>setPreviewDevice("desktop")}>Computador</button><button type="button" aria-pressed={previewDevice==="mobile"} onClick={()=>setPreviewDevice("mobile")}>Celular</button></div>
            </div>
            <div className={s.previewCanvas} data-device={previewDevice} data-appearance={layout.appearance}>
              <div className={s.previewTop}><span className={s.previewMark}>✝</span><strong>IGREJA DE DEUS</strong><small>RIACHO FUNDO I</small></div>
              <div className={s.previewCover}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(layout.hero.imageUrl)} alt="Fotografia escolhida para a capa" />
                <div><small>IGREJA DE DEUS · RIACHO FUNDO I</small><h2>{layout.hero.title}<em>{layout.hero.accent}</em></h2><p>{layout.hero.description}</p><span>Quero visitar ↗</span></div>
              </div>
              {layout.sections.filter(key=>!layout.hidden.includes(key)).map(key=>key==="galeria"?<div className={s.previewGallery} key={key}>
                <h3>{layout.gallery.title} <em>{layout.gallery.accent}</em></h3><p>{layout.gallery.description}</p>
                <div>{layout.gallery.items.map((item,index)=><figure key={index}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl(item.imageUrl)} alt={item.alt}/><figcaption>{item.title}</figcaption>
                </figure>)}</div>
              </div>:<div className={s.previewOther} key={key}>{sectionNames[key]} <small>Componente original preservado</small></div>)}
            </div>
            <p className={s.previewNote}>Prévia fiel aos textos, fotos, paleta e ordem. O site definitivo preserva os componentes responsivos originais.</p>
            <p className={s.previewNote}>Salvar não publica. Publicar exige permissão e atualiza somente a versão aprovada; o site oficial precisa ter a leitura dinâmica habilitada.</p>
          </section>
        </div>
      </div>}
    </div>
  </AppShell>;
}
