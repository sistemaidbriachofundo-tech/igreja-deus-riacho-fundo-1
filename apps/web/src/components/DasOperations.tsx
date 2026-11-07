"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell, UIIcon } from "./AppShell";
import { RosterBoard } from "./RosterBoard";
import { PastoralBoard, DiscipleshipBoard, GroupsBoard } from "./CareBoards";
import { apiGet, apiPost, loadStoredToken, type LoginResult } from "../lib/api";
import { withBasePath } from "../lib/paths";
import {
  DAS_MODULES, DAS_RESOURCE_TABS, canViewDasModule, dasError, formatChurchDate,
  readDasRows, readDasSummary, scalarLabel, shortStatus,
  type DasModule, type DasRecord,
} from "../lib/das-operations";
import styles from "./das-operations.module.css";

type Session = { token: string; user: LoginResult["user"] };
type LoadState =
  | { kind: "idle" | "loading"; rows: DasRecord[]; summary: null }
  | { kind: "ready"; rows: DasRecord[]; summary: DasRecord | null }
  | { kind: "error"; rows: DasRecord[]; summary: null; message: string };
type Draft = {name:string; slug:string; title:string; date:string; ministryId:string; code:string; type:string; note:string};
const EMPTY:Draft = {name:"",slug:"",title:"",date:"",ministryId:"",code:"",type:"EXPENSE",note:""};

function canCreate(module:DasModule, roles:readonly string[]) {
  // O servidor decide; a interface não concede permissões.
  const leader=roles.includes("LIDER_MINISTERIO");
  const staff=roles.includes("SECRETARIA")||roles.includes("PASTOR");
  if(module==="financeiro") return roles.includes("TESOURARIA");
  if(module==="ministerios"||module==="escalas"||module==="celulas") return leader||staff;
  if(module==="eventos") return staff;
  return false;
}
function createRequest(module:DasModule, form:Draft):{path:string;body:Record<string,unknown>}|null {
  const trimmed=(s:string)=>s.trim();
  if(module==="ministerios" && trimmed(form.name).length>=3 && /^[a-z0-9-]{3,80}$/.test(trimmed(form.slug)))
    return {path:"/ministries",body:{name:trimmed(form.name),slug:trimmed(form.slug)}};
  if(module==="celulas" && trimmed(form.name).length>=3)
    return {path:"/small-groups",body:{name:trimmed(form.name),...(trimmed(form.note)?{meetsAtHint:trimmed(form.note)}:{})}};
  if(module==="escalas" && trimmed(form.title).length>=3 && form.date) {
    const d=new Date(form.date);
    if(Number.isNaN(d.getTime()))return null;
    return {path:"/rosters",body:{title:trimmed(form.title),serviceAt:d.toISOString(),...(trimmed(form.ministryId)?{ministryId:trimmed(form.ministryId)}:{})}};
  }
  if(module==="financeiro" && trimmed(form.code) && trimmed(form.name).length>=3)
    return {path:"/ledger/accounts",body:{code:trimmed(form.code),name:trimmed(form.name),type:form.type}};
  if(module==="eventos" && trimmed(form.name).length>=3 && /^[a-z0-9-]{3,80}$/.test(trimmed(form.slug)) && form.date){
    const d=new Date(form.date);
    if(Number.isNaN(d.getTime()))return null;
    return {path:"/events",body:{name:trimmed(form.name),slug:trimmed(form.slug),startsAt:d.toISOString()}};
  }
  return null;
}
function InputField({label,value,onChange,type="text",required=false,help,placeholder}:{
  label:string;value:string;onChange:(next:string)=>void;type?:string;required?:boolean;help?:string;placeholder?:string;
}) {
  return <label className={styles.field}><span>{label}</span>
    <input value={value} onChange={e=>onChange(e.target.value)} type={type} required={required} placeholder={placeholder} maxLength={140}/>
    {help&&<small>{help}</small>}
  </label>;
}
function Rows({module,rows}:{module:DasModule;rows:DasRecord[]}) {
  const [term,setTerm]=useState("");
  const [limit,setLimit]=useState(12);
  const filtered=rows.filter((item)=>{
    const title=scalarLabel(item,["title","name","displayName","label","code","slug"],"Registro");
    return title.toLocaleLowerCase("pt-BR").includes(term.trim().toLocaleLowerCase("pt-BR"));
  });
  return <section className={styles.card} aria-label="Registros consultados na API">
    <div className={styles.cardHeading}>
      <div><h2>Registros da API</h2><p>{rows.length} {rows.length===1?"registro encontrado":"registros encontrados"} na HML.</p></div>
      <label className={styles.search}><UIIcon name="search" size={18}/>
        <span className={styles.visuallyHidden}>Buscar registros exibidos</span>
        <input type="search" value={term} onChange={e=>{setTerm(e.target.value);setLimit(12);}} placeholder="Filtrar registros..." />
      </label>
    </div>
    {!filtered.length?<div className={styles.empty}><UIIcon name="search" size={22}/><strong>Nenhum registro para exibir</strong><p>O sistema não criou dados de exemplo automaticamente.</p></div>:
      <div className={styles.rows}>
        {filtered.slice(0,limit).map((item,index)=>{
          const title=scalarLabel(item,["title","name","displayName","label","code","slug"],"Registro sem título");
          const key=typeof item.id==="string"?item.id:String(index);
          const date=item.serviceAt??item.startsAt??item.createdAt;
          const subtype=module==="escalas"&&Array.isArray(item.slots)
            ? item.slots.length+" funções cadastradas"
            : module==="financeiro"
            ? scalarLabel(item,["code","type"],"Conta registrada")
            : module==="ministerios"?scalarLabel(item,["slug"],"Ministério cadastrado")
            : "Registro de homologação";
          return <article className={styles.entry} key={key}>
            <div className={styles.entryIcon} aria-hidden="true"><UIIcon name={module==="financeiro"?"layers":module==="escalas"?"calendar":"family"} size={19}/></div>
            <div className={styles.entryMain}>
              <strong>{title}</strong><span>{subtype}</span>
              {typeof date==="string"&&<small>{formatChurchDate(date)}</small>}
            </div>
            <span className={styles.state}>{shortStatus(item)}</span>
          </article>;
        })}
        {filtered.length>limit&&<button type="button" className={styles.more} onClick={()=>setLimit(n=>n+12)}>
          Exibir mais {Math.min(12,filtered.length-limit)} registros
        </button>}
      </div>}
  </section>;
}

function IndicatorPanel({data}:{data:DasRecord}) {
  const rows=[
    ["Pessoas",data.persons??data.totalPersons??data.personCount],
    ["Membros ativos",data.activeMembers??data.membershipsActive??data.activeMemberships],
    ["Admissões",data.admissions??data.pendingAdmissions],
    ["Ministérios",data.ministries??data.ministriesCount],
  ].filter((entry):entry is [string,string|number]=>typeof entry[1]==="string"||typeof entry[1]==="number");
  return <section className={styles.card}>
    <div className={styles.cardHeading}><div><h2>Resumo institucional</h2>
      <p>Indicadores retornados pelo backend, respeitando a congregação e o usuário.</p></div></div>
    {data.stub===true&&<div className={styles.warning}>API indica <strong>stub: true</strong>. Os indicadores ainda não equivalem ao dashboard consolidado do DAS.</div>}
    {rows.length?<div className={styles.metrics}>{rows.map(([title,value])=><div key={title}><small>{title}</small><strong>{value}</strong></div>)}</div>:
      <div className={styles.empty}><strong>Sem métricas padronizadas disponíveis</strong><p>Não foram inferidos números nem substituídos por dados sintéticos.</p></div>}
  </section>;
}

function CreationForm({module,onCreate,busy}:{module:DasModule;onCreate:(payload:{path:string;body:Record<string,unknown>})=>Promise<void>;busy:boolean}) {
  const [form,setForm]=useState<Draft>(EMPTY);
  const [error,setError]=useState("");
  const update=(key:keyof Draft)=>(val:string)=>setForm(prev=>({...prev,[key]:val}));
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const request=createRequest(module,form);
    if(!request){setError("Preencha os campos obrigatórios com informações válidas (somente dados fictícios).");return;}
    setError("");
    void onCreate(request).then(()=>setForm(EMPTY)).catch(()=>{/* erro exibido no painel externo */});
  };
  return <section className={styles.card} aria-label="Novo cadastro de homologação">
    <div className={styles.cardHeading}><div><h2>Cadastrar na HML</h2>
      <p>Esta operação grava exclusivamente na API de homologação. Use dados fictícios.</p></div></div>
    <form onSubmit={submit} className={styles.form}>
      {(module==="ministerios"||module==="celulas"||module==="financeiro"||module==="eventos")&&
        <InputField label={module==="financeiro"?"Nome da conta":module==="eventos"?"Nome do evento":module==="celulas"?"Nome do grupo":"Nome do ministério"}
          value={form.name} onChange={update("name")} required placeholder="Somente informações fictícias"/>}
      {(module==="ministerios"||module==="eventos")&&<InputField label="Identificador (slug)" value={form.slug} onChange={update("slug")} required help="Letras minúsculas, números e hífens. Ex.: encontro-teste."/>}
      {module==="celulas"&&<InputField label="Horário ou local (opcional)" value={form.note} onChange={update("note")} placeholder="Encontro experimental"/>}
      {module==="escalas"&&<>
        <InputField label="Título da escala" value={form.title} onChange={update("title")} required placeholder="Escala teste — culto"/>
        <InputField label="Data e horário do culto" type="datetime-local" value={form.date} onChange={update("date")} required/>
        <InputField label="ID do ministério (opcional)" value={form.ministryId} onChange={update("ministryId")} help="Copie o ID de um ministério cadastrado; não é o nome."/>
      </>}
      {module==="financeiro"&&<>
        <InputField label="Código contábil" value={form.code} onChange={update("code")} required placeholder="1.1.01"/>
        <label className={styles.field}><span>Tipo da conta</span><select value={form.type} onChange={e=>update("type")(e.target.value)}>
          <option value="ASSET">Ativo</option><option value="LIABILITY">Passivo</option>
          <option value="EQUITY">Patrimônio líquido</option><option value="REVENUE">Receita</option>
          <option value="EXPENSE">Despesa</option>
        </select></label>
      </>}
      {module==="eventos"&&<InputField label="Data e horário do evento" type="datetime-local" value={form.date} onChange={update("date")} required/>}
      {error&&<p className={styles.formError} role="alert">{error}</p>}
      <button className={styles.primary} type="submit" disabled={busy}>
        <UIIcon name="plus" size={17}/>{busy?"Salvando…":"Registrar na API de testes"}
      </button>
    </form>
  </section>;
}

export function DasOperations() {
  const enabled=process.env.NEXT_PUBLIC_HML_ENABLED==="true";
  const [session,setSession]=useState<Session|null>(null);
  const [checking,setChecking]=useState(true);
  const [active,setActive]=useState<DasModule>("ministerios");
  const [reload,setReload]=useState(0);
  const [resourceId,setResourceId]=useState("");
  const [data,setData]=useState<LoadState>({kind:"idle",rows:[],summary:null});
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");

  useEffect(()=>{
    if(!enabled){setChecking(false);return;}
    const token=loadStoredToken();
    if(!token){setChecking(false);return;}
    let cancelled=false;
    void apiGet<LoginResult["user"]>("/auth/me",token)
      .then(user=>{if(!cancelled)setSession({token,user});})
      .catch(()=>{if(!cancelled)setSession(null);})
      .finally(()=>{if(!cancelled)setChecking(false);});
    return()=>{cancelled=true;};
  },[enabled]);

  const roles=useMemo(()=>session?.user.grants.map(grant=>grant.roleCode)??[],[session]);
  const visible=useMemo(()=>DAS_MODULES.filter(module=>canViewDasModule(roles,module.allowedRoles)),[roles]);
  const chosen=visible.find(module=>module.id===active)??visible[0];
  const resourceTabs=chosen?DAS_RESOURCE_TABS[chosen.id]??[]:[];
  const resource=resourceTabs.find(tab=>tab.id===resourceId)??resourceTabs[0];

  useEffect(()=>{
    if(!session||!chosen){setData({kind:"idle",rows:[],summary:null});return;}
    let cancelled=false;
    setData({kind:"loading",rows:[],summary:null});
    void apiGet<unknown>(resource?.endpoint??chosen.endpoint,session.token).then(body=>{
      if(cancelled)return;
      const summary=(resource?.dataKind??chosen.dataKind)==="summary"?readDasSummary(body):null;
      const rows=summary?[]:readDasRows(body,resource?.envelope??chosen.envelope);
      setData({kind:"ready",rows,summary});
    }).catch(err=>{if(!cancelled)setData({kind:"error",rows:[],summary:null,message:dasError(err)});});
    return()=>{cancelled=true;};
  },[session,chosen,resource,reload]);

  const doCreate=useCallback(async(request:{path:string;body:Record<string,unknown>})=>{
    if(!session||!chosen)return;
    setSaving(true);setNotice("");
    try{
      await apiPost(request.path,session.token,request.body);
      setNotice("Registro fictício salvo no backend de homologação. Lista atualizada.");
      setReload(n=>n+1);
    }catch(err){
      setNotice(dasError(err));
      throw err;
    }finally{setSaving(false);}
  },[session,chosen]);

  return <AppShell active="operacao" meta="Operação integrada · DAS">
    <div className={styles.page}>
      <div className={styles.breadcrumb}>Gestão institucional <span>/</span> Operação integrada</div>
      <header className={styles.hero}>
        <div><span className={styles.eyebrow}>IGREJA DE DEUS · DAS V1.1</span>
          <h1>Uma plataforma. <em>Todas as frentes.</em></h1>
          <p>Cuidado, voluntariado, escalas, finanças e eventos conectados à mesma operação institucional.</p>
        </div><span className={styles.hmlMark}><UIIcon name="shield" size={16}/> Homologação · somente registros fictícios</span>
      </header>
      {!enabled?<section className={styles.card} role="status"><h2>Homologação desabilitada</h2>
        <p>A operação autenticada só pode ser exercitada com configuração e banco de testes. O site público continua independente.</p></section>:
      checking?<section className={styles.card} role="status">Verificando a sessão…</section>:
      !session?<section className={styles.card}><h2>Entrar para continuar</h2>
        <p>Essa área não mostra informações internas sem autenticação. Acesse o painel com uma conta fictícia autorizada e retorne aqui.</p>
        <a className={styles.primaryLink} href={withBasePath("/app/")}>Ir para o login de homologação <UIIcon name="arrow" size={17}/></a>
      </section>:
      !chosen?<section className={styles.card}><h2>Nenhuma área habilitada para este perfil</h2>
        <p>Os módulos exigem concessão de acesso por função e congregação. Solicite revisão a um responsável autorizado.</p></section>:
      <>
        <section className={styles.sessionBar} aria-label="Identificação da sessão">
          <div><UIIcon name="shield" size={18}/><span>Conectado como <strong>{session.user.email}</strong></span></div>
          <span>Dados de homologação · nunca usar cadastros reais</span>
        </section>
        <nav className={styles.modules} aria-label="Áreas de trabalho do DAS">
          {visible.map(module=><button type="button" key={module.id} onClick={()=>{setActive(module.id);setNotice("");}}
            aria-current={chosen.id===module.id?"page":undefined}
            className={chosen.id===module.id?styles.moduleActive:styles.module}>
            <small>{module.phase}</small><strong>{module.label}</strong>
          </button>)}
        </nav>
        <div className={styles.moduleTop}><div>
          <span className={styles.phase}>{chosen.phase} · Integração HML</span>
          <h2>{chosen.label}</h2><p>{chosen.description}</p>
        </div><button type="button" className={styles.refresh} onClick={()=>{setReload(n=>n+1);setNotice("");}} disabled={data.kind==="loading"}>
          <UIIcon name="refresh" size={17}/> Atualizar
        </button></div>
        {resourceTabs.length>0&&<nav className={styles.resourceTabs} aria-label={"Consultas de "+chosen.label}>
          {resourceTabs.map(tab=><button type="button" key={tab.id}
            className={resource?.id===tab.id?styles.resourceActive:styles.resourceTab}
            aria-current={resource?.id===tab.id?"page":undefined}
            onClick={()=>{setResourceId(tab.id);setNotice("");}}>
            {tab.label}
          </button>)}
        </nav>}
        {notice&&<div role="status" className={styles.notice}>{notice}</div>}
        {data.kind==="loading"&&<div role="status" className={styles.card}>Consultando registros autorizados na API…</div>}
        {data.kind==="error"&&<div role="alert" className={styles.formError}>{data.message}</div>}
        {data.kind==="ready"&&<>
          {data.summary?<IndicatorPanel data={data.summary}/>:<>
            <Rows key={chosen.id} module={chosen.id} rows={data.rows}/>
            {chosen.id==="escalas"&&<RosterBoard rows={data.rows} token={session.token} personId={session.user.personId} roles={roles} refresh={()=>setReload(n=>n+1)}/>}
            {chosen.id==="pastoral"&&roles.includes("PASTOR")&&<PastoralBoard rows={data.rows} token={session.token} refresh={()=>setReload(n=>n+1)}/>}
            {chosen.id==="discipulado"&&<DiscipleshipBoard rows={data.rows} token={session.token} refresh={()=>setReload(n=>n+1)}/>}
            {chosen.id==="celulas"&&<GroupsBoard rows={data.rows} token={session.token} refresh={()=>setReload(n=>n+1)}/>}

          </>}
          {canCreate(chosen.id,roles)&&(!resource||chosen.id!=="financeiro"||resource.id==="accounts")&&<CreationForm key={chosen.id} module={chosen.id} onCreate={doCreate} busy={saving}/>}
        </>}
        <footer className={styles.disclaimer}><UIIcon name="shield" size={18}/>
          <p>Os dados exibidos pertencem à homologação. A existência de uma rota não significa que um requisito do DAS foi homologado.
            Regras de privacidade e autorização são aplicadas no backend. Sem emissão, pagamento ou disparo de mensagens reais por esta tela.</p>
        </footer>
      </>}
    </div>
  </AppShell>;
}
