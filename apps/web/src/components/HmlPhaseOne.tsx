"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell, UIIcon } from "./AppShell";
import { PersonPicker } from "./PersonPicker";
import { SecretaryDossier, credentialFromMemberships } from "./SecretaryDossier";
import { apiGet, apiLogin, apiPost, clearToken, isInvalidSession, loadStoredToken, storeToken, type LoginResult } from "../lib/api";
import s from "./hml-phase-one.module.css";
import { withBasePath } from "../lib/paths";

type View = "overview" | "members" | "secretary" | "cards";
type Role = "SECRETARIA" | "PASTOR" | "PLATFORM_ADMIN" | "MEMBRO";
type AuthUser = LoginResult["user"];
type Membership = {
  id:string;status:string;joinedAt:string;notes:string|null;
  person:{id:string;displayName:string;email:string|null;status:string;householdId:string|null};
  activeCredentialId:string|null;
};
type Admission = {
  id:string;personId:string;membershipId:string|null;status:string;modality:string|null;
  currentStep:"modality"|"documents"|"secretaria"|"pastor";
  checklist:{modalityRecorded:boolean;documentsComplete:boolean;secretariaApproved:boolean;pastorApproved:boolean};
  createdAt:string;credentialEligible:boolean;
};
type Household = {id:string;label:string;members?:unknown[]};

const statusLabels:Record<string,string> = {
  ACTIVE:"Ativo",INACTIVE:"Inativo",PENDING_ADMISSION:"Em admissão",TRANSFERRED:"Transferido",
  APPROVED:"Aprovado",DRAFT:"Rascunho",AWAITING_DOCUMENTS:"Documentação",
  AWAITING_SECRETARIA:"Análise da secretaria",AWAITING_PASTOR:"Aprovação pastoral",
  REJECTED:"Recusado",CANCELLED:"Cancelado",
};
function label(value:string) {return statusLabels[value]??value.replaceAll("_"," ");}
function displayError(error:unknown):string {
  if(!(error instanceof Error))return "Operação não concluída. Confira os dados e tente novamente.";
  if(/\(401\)|401|expired|expirad|JWT/.test(error.message))return "Sua sessão expirou. Entre novamente.";
  if(/\(403\)|403|permissão|permiss/.test(error.message))return "Seu perfil não tem permissão para executar esta operação.";
  if(/\(409\)|409/.test(error.message))return "Existe um conflito de cadastro ou de etapa. Atualize a lista antes de continuar.";
  return error.message.length>220?error.message.slice(0,220):error.message;
}
function hasRole(user:AuthUser|null,role:Role) {
  return Boolean(user?.grants.some(g=>g.roleCode===role));
}
function formatDate(value:string) {
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—";
}
const rowKey=(m:Membership)=>m.person.id;

export function HmlPhaseOne({view}:{view:View}){
  const [token,setToken]=useState<string|null>(null);
  const [user,setUser]=useState<AuthUser|null>(null);
  const [checking,setChecking]=useState(true);
  const [busy,setBusy]=useState(false);
  const [loginEmail,setLoginEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [memberships,setMemberships]=useState<Membership[]>([]);
  const [admissions,setAdmissions]=useState<Admission[]>([]);
  const [households,setHouseholds]=useState<Household[]>([]);
  const [query,setQuery]=useState("");
  const [fichaId,setFichaId]=useState<string|null>(null);
  const [searchedPerson,setSearchedPerson]=useState("");
  const [newName,setNewName]=useState("");
  const [newEmail,setNewEmail]=useState("");
  const [modality,setModality]=useState("BATISMO");

  const refresh=useCallback(async(activeToken:string)=>{
    const me=await apiGet<AuthUser>("/auth/me",activeToken);
    setUser(me);
    const secretaria=hasRole(me,"SECRETARIA")||hasRole(me,"PLATFORM_ADMIN");
    const staff=secretaria||hasRole(me,"PASTOR");
    const settled=await Promise.allSettled([
      secretaria?apiGet<{memberships:Membership[]}>("/memberships",activeToken):Promise.resolve({memberships:[] as Membership[]}),
      staff?apiGet<{admissions:Admission[]}>("/admissions",activeToken):Promise.resolve({admissions:[] as Admission[]}),
      secretaria?apiGet<{households:Household[]}>("/households",activeToken):Promise.resolve({households:[] as Household[]}),
    ]);
    const invalid=settled.find((item)=>item.status==="rejected"&&isInvalidSession(item.reason));
    if(invalid&&invalid.status==="rejected")throw invalid.reason;
    const [people,processes,families]=settled;
    if(people.status==="fulfilled")setMemberships(people.value.memberships);
    if(processes.status==="fulfilled")setAdmissions(processes.value.admissions);
    if(families.status==="fulfilled")setHouseholds(families.value.households);
    if(settled.some((item)=>item.status==="rejected")){
      setError("Parte da lista não carregou. A sessão continua ativa.");
    }
  },[]);

  useEffect(()=>{
    const stored=loadStoredToken();
    if(!stored){setChecking(false);return;}
    let cancelled=false;
    void refresh(stored).then(()=>{
      if(!cancelled)setToken(stored);
    }).catch((err)=>{
      if(!isInvalidSession(err)){
        if(!cancelled){setToken(stored);setError(displayError(err));}
        return;
      }
      clearToken();
      if(!cancelled){setToken(null);setUser(null);}
    }).finally(()=>{if(!cancelled)setChecking(false);});
    return()=>{cancelled=true;};
  },[refresh]);

  const secretary=hasRole(user,"SECRETARIA")||hasRole(user,"PLATFORM_ADMIN");
  const pastor=hasRole(user,"PASTOR");
  const staff=secretary||pastor;
  const membershipByPerson=useMemo(()=>new Map(memberships.map(m=>[m.person.id,m])),[memberships]);
  const pending=admissions.filter(a=>!["APPROVED","REJECTED","CANCELLED"].includes(a.status));
  const active=memberships.filter(m=>m.status==="ACTIVE");
  const credentials=memberships.filter(m=>Boolean(m.activeCredentialId));
  const q=query.trim().toLocaleLowerCase("pt-BR");
  const filtered=memberships.filter(m=>[m.person.displayName,m.person.email??"",m.status,m.id].join(" ").toLocaleLowerCase("pt-BR").includes(q));
  const filteredAdmissions=admissions.filter(a=>{
    const member=membershipByPerson.get(a.personId);
    return [member?.person.displayName??a.personId,a.modality??"",a.status].join(" ").toLocaleLowerCase("pt-BR").includes(q);
  });

  function logout(){
    clearToken();setToken(null);setUser(null);setMemberships([]);setAdmissions([]);setHouseholds([]);setFichaId(null);
    setPassword("");setError("");setNotice("");
    window.location.assign(withBasePath("/login/"));
  }
  async function login(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);setError("");setNotice("");
    try{
      const signed=await apiLogin(loginEmail.trim(),password);
      await refresh(signed.accessToken);
      storeToken(signed.accessToken);setToken(signed.accessToken);setPassword("");
      setNotice("Acesso autorizado ao banco fictício de homologação.");
    }catch(err){
      setError(displayError(err));
      if(isInvalidSession(err)){clearToken();setToken(null);}
    }
    finally{setBusy(false);setChecking(false);}
  }
  async function run(action:()=>Promise<unknown>,message:string){
    if(!token)return;
    setBusy(true);setError("");setNotice("");
    try{await action();await refresh(token);setNotice(message);}
    catch(err){setError(displayError(err));}
    finally{setBusy(false);}
  }
  function createAdmission(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!token||!secretary)return;
    const name=newName.trim();const email=newEmail.trim().toLowerCase();
    if(name.length<3||!email.endsWith("@example.test")){
      setError("Somente nomes fictícios e e-mails terminados em @example.test são permitidos na HML.");return;
    }
    void run(()=>apiPost("/admissions",token,{displayName:name,email,modality}),"Novo protocolo fictício aberto na API e persistido no PostgreSQL.");
    setNewName("");setNewEmail("");
  }
  function nextAdmission(a:Admission){
    if(!token)return;
    const stage=a.currentStep;
    if(stage==="pastor"&&!pastor)return;
    if(stage!=="pastor"&&!secretary)return;
    void run(
      ()=>apiPost("/admissions/"+encodeURIComponent(a.id)+"/advance",token,{
        completeStep:stage,decision:stage==="pastor"||stage==="secretaria"?"APPROVE":undefined,
        modality:stage==="modality"?"BATISMO":undefined,
      }),
      stage==="pastor"?"Aprovação pastoral fictícia registrada com auditoria.":"Etapa fictícia registrada no backend.",
    );
  }
  function issueCard(m:Membership){
    if(!token||!secretary)return;
    void run(()=>apiPost("/credentials/issue/"+encodeURIComponent(m.id),token),"Credencial sintética emitida pela API.");
  }
  function revokeCard(m:Membership){
    const credentialId=m.activeCredentialId;
    if(!token||!secretary||!credentialId)return;
    void run(()=>apiPost("/credentials/revoke/"+encodeURIComponent(credentialId),token),"Credencial sintética revogada pela API.");
  }

  const names:Record<View,string>={
    overview:"Painel HML — Fase 1",members:"Pessoas e famílias",secretary:"Admissões e secretaria",cards:"Carteirinhas",
  };

  if(process.env.NEXT_PUBLIC_HML_ENABLED!=="true"){
    return <AppShell active={view==="overview"?"visao":view==="members"?"membros":view==="secretary"?"secretaria":"carteirinha"} meta="Área administrativa">
      <section className={s.loginPanel}><h1>Homologação não habilitada</h1>
      <p>O portal público mantém a demonstração local. Nenhuma API administrativa está configurada nesta publicação.</p></section>
    </AppShell>;
  }
  return <AppShell active={view==="overview"?"visao":view==="members"?"membros":view==="secretary"?"secretaria":"carteirinha"} meta={names[view]}>
    <div className={s.page} data-ficha-open={fichaId?"true":undefined}>
      <div className={s.topline}><span className={s.environment}>HML · DADOS 100% FICTÍCIOS</span>
        {user&&<div className={s.topUser}><span>{user.email}</span><button type="button" onClick={logout}>Sair</button></div>}
      </div>
      {checking?<section className={s.loginPanel} role="status"><h1>Verificando sessão…</h1></section>:
      !token||!user?
        <section className={s.loginPanel} aria-labelledby="login-hml">
          <span className={s.kicker}>AMBIENTE DE HOMOLOGAÇÃO · FASE 1</span>
          <h1 id="login-hml">Entre no ID Riacho 1</h1>
          <p>Este é o ambiente de validação, conectado à API NestJS e a um banco PostgreSQL exclusivo. Use somente contas sintéticas autorizadas para o teste.</p>
          <form onSubmit={login} className={s.form}>
            <label>E-mail de teste<input type="email" required autoComplete="username" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="conta.demo@example.test"/></label>
            <label>Senha de teste<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
            <button type="submit" disabled={busy}>{busy?"Autenticando…":"Entrar na homologação"}</button>
          </form>
          <p className={s.helper}>Acesso real exige validação de credenciais; a página pública permanece independente.</p>
        </section>:
        <div>
          <header className={s.heading}><div><span className={s.kicker}>ID RIACHO 1 · BASE REAL DE TESTES</span><h1>{names[view]}</h1>
            <p>Fluxos conectados ao backend, com persistência e papéis reais; todos os dados são inventados para esta simulação.</p></div>
            <button type="button" className={s.secondaryButton} onClick={()=>{if(token)void run(()=>refresh(token),"Dados atualizados da API.");}} disabled={busy}><UIIcon name="refresh" size={17}/> Atualizar</button>
          </header>
          {notice&&<div role="status" className={s.notice}>{notice}</div>}
          {error&&<div role="alert" className={s.error}>{error}</div>}
          <div className={s.stats}>
            <div><span>Pessoas com vínculo</span><strong>{secretary?memberships.length:"—"}</strong><small>Persistidas no PostgreSQL</small></div>
            <div><span>Membros ativos</span><strong>{secretary?active.length:"—"}</strong><small>Escopo da igreja piloto</small></div>
            <div><span>Admissões pendentes</span><strong>{staff?pending.length:"—"}</strong><small>Etapas controladas por perfil</small></div>
            <div><span>Credenciais ativas</span><strong>{secretary?credentials.length:"—"}</strong><small>QR individual verificável via API</small></div>
          </div>
          {view==="overview"&&<div className={s.overviewGrid}>
            <section className={s.panel}><h2>Fluxos conectados</h2><p>Cadastro, famílias, admissão e carteirinhas compartilham a mesma base persistente, com controle de acesso pelo backend.</p>
              <nav className={s.links}><a href={withBasePath("/app/membros/")}>Pessoas e famílias</a><a href={withBasePath("/app/secretaria/")}>Admissões</a><a href={withBasePath("/app/membros/carteirinha/")}>Carteirinhas</a><a href={withBasePath("/app/tesouraria/")}>Tesouraria sintética</a><a href={withBasePath("/app/ministerios/")}>Vínculo de ministério</a><a href={withBasePath("/app/servir/louvor/")}>Escalas</a><a href={withBasePath("/app/servir/meu-espaco/")}>Meu Espaço</a></nav>
            </section>
            <section className={s.panel}><h2>Aprovações em aberto</h2>
              {pending.slice(0,6).map(a=><div className={s.listRow} key={a.id}><strong>{membershipByPerson.get(a.personId)?.person.displayName??"Pessoa fictícia"}</strong><span>{label(a.status)}</span></div>)}
              {!pending.length&&<p>Nenhuma pendência para o perfil atual.</p>}
            </section>
          </div>}
          {view==="overview"&&<section className={s.panel} aria-labelledby="modules-status-heading">
            <h2 id="modules-status-heading">Visão integrada da plataforma</h2>
            <p>Este quadro diferencia o que já pode ser exercitado com registros fictícios daquilo que ainda exige integração e testes. Não exibe métricas nem aprovações inventadas.</p>
            <div className={s.listRow}><strong>Pessoas, famílias, admissões e carteirinhas</strong><span>Disponível na HML sintética</span></div>
            <div className={s.listRow}><strong>Prévia do estúdio em /w1-estudio</strong><span>Não grava o site público</span></div>
            <div className={s.listRow}><strong>Vínculo formal de ministério</strong><span>Indisponível — a API responde 501 e nada é persistido</span></div>
            <div className={s.listRow}><strong>Escalas de Atmosfera e Louvor</strong><span>Disponível no contrato de roster já publicado</span></div>
            <div className={s.listRow}><strong>Meu Espaço</strong><span>Não lista a agenda pessoal; só confirma pelo identificador</span></div>
            <div className={s.listRow}><strong>Tesouraria</strong><span>Posição e rascunho sintéticos se o ledger responder; sem banco, Pix ou saldo real</span></div>
            <div className={s.listRow}><strong>Cuidado pastoral</strong><span>Contagem só para quem tem permissão pastoral</span></div>
            <div className={s.listRow}><strong>Eventos, inscrições e pagamentos</strong><span>Jornada completa indisponível</span></div>
            <p>Os dados e fluxos indicados como HML são de demonstração e <strong>não substituem a autorização institucional para operar com dados reais.</strong></p>
          </section>}
          {view==="members"&&<div className={s.grid}>
            <section className={s.panel}><div className={s.panelHeading}><h2>Diretório de membros</h2><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar nome ou situação" aria-label="Buscar membros"/></div>
              {!secretary?<p>Seu perfil não possui permissão para listar todas as pessoas. A API bloqueia a consulta por escopo.</p>:
                <div className={s.tableWrap}><table><thead><tr><th>Nome fictício</th><th>Situação</th><th>E-mail de teste</th><th>Carteirinha</th><th>Ficha</th></tr></thead><tbody>
                  {filtered.map(m=><tr key={rowKey(m)}><td><strong>{m.person.displayName}</strong></td><td>{label(m.status)}</td><td>{m.person.email??"—"}</td><td>{m.activeCredentialId?"Ativa":"Não emitida"}</td><td><button type="button" className={s.openFicha} onClick={()=>setFichaId(m.person.id)} aria-label={"Abrir ficha de "+m.person.displayName}>Abrir ficha</button></td></tr>)}
                </tbody></table>{filtered.length===0&&<p>Sem registros encontrados.</p>}</div>}
            </section>
            <section className={s.panel}><h2>Núcleos familiares</h2><strong className={s.bigNumber}>{households.length}</strong><p>Famílias fictícias vinculadas à congregação. As relações são consultadas pelo endpoint autenticado.</p>
              <div className={s.slimList}>{households.slice(0,8).map(h=><span key={h.id}>{h.label}</span>)}</div>
            </section>
          </div>}
          {view==="secretary"&&<div className={s.grid}>
            <section className={s.panel}><div className={s.panelHeading}><h2>Protocolos de admissão</h2><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar processo" aria-label="Buscar admissão"/></div>
              {!staff?<p>Seu perfil não pode consultar os processos.</p>:
                <div className={s.admissions}>{filteredAdmissions.map(a=>{
                  const canAct=a.currentStep==="pastor"?pastor:secretary;
                  const done=["APPROVED","REJECTED","CANCELLED"].includes(a.status);
                  return <article key={a.id} className={s.admission}>
                    <div><strong>{membershipByPerson.get(a.personId)?.person.displayName??"Pessoa de teste · "+a.personId.slice(0,8)}</strong>
                      <small>{label(a.status)} · {a.modality??"Modalidade pendente"}</small></div>
                    <div className={s.admissionActions}>
                      <button type="button" className={s.openFicha} onClick={()=>setFichaId(a.personId)} aria-label={"Abrir ficha de "+(membershipByPerson.get(a.personId)?.person.displayName??"pessoa de teste")}>Abrir ficha</button>
                      <button type="button" disabled={busy||done||!canAct} onClick={()=>nextAdmission(a)}>
                        {done?"Concluído":!canAct?"Ação reservada":"Concluir "+(a.currentStep==="pastor"?"decisão pastoral":a.currentStep==="secretaria"?"secretaria":"documentação")}
                      </button>
                    </div>
                  </article>;
                })}{filteredAdmissions.length===0&&<p>Não há protocolos neste filtro.</p>}</div>}
            </section>
            <section className={s.panel}><h2>Buscar pessoa e abrir ficha</h2>
              <p>A busca usa o endpoint de pessoas. A ficha lê o prontuário gravado na API.</p>
              {staff && token ? <>
                <PersonPicker token={token} roles={user.grants.map(grant=>grant.roleCode)} label="Pessoa fictícia" value={searchedPerson} onChange={setSearchedPerson} placeholder="Buscar pelo nome sintético"/>
                <button type="button" className={s.openFicha} disabled={!searchedPerson} onClick={()=>setFichaId(searchedPerson)}>Abrir ficha da busca</button>
              </> : <p>A busca de pessoas exige Secretaria, pastor ou administração da congregação.</p>}
              <h2 className={s.follow}>Abrir protocolo fictício</h2><p>A abertura cria pessoa, vínculo e admissão na mesma transação da API. Utilize nomes inventados e domínio <code>example.test</code>.</p>
              {secretary?<form className={s.form} onSubmit={createAdmission}>
                <label>Nome fictício<input value={newName} onChange={e=>setNewName(e.target.value)} required minLength={3} placeholder="Pessoa Demonstração"/></label>
                <label>E-mail de teste<input value={newEmail} onChange={e=>setNewEmail(e.target.value)} required type="email" placeholder="pessoa.nova@example.test"/></label>
                <label>Modalidade<select value={modality} onChange={e=>setModality(e.target.value)}>
                  <option value="BATISMO">Batismo</option><option value="TRANSFERENCIA">Transferência</option><option value="RECONCILIACAO">Reconciliação</option><option value="OUTRO">Outro</option>
                </select></label>
                <button type="submit" disabled={busy}>{busy?"Salvando…":"Cadastrar e iniciar admissão"}</button>
              </form>:<p>A abertura exige o perfil Secretaria.</p>}
            </section>
          </div>}
          {view==="cards"&&<section className={s.panel}><h2>Carteirinhas digitais</h2>
            <p>Emissão e revogação autenticadas. O download do PDF depende de storage privado persistente, não disponível nesta HML serverless.</p>
            {!secretary?<p>Listagem e emissão reservadas à secretaria. Membros podem consultar a própria credencial na API.</p>:
              <div className={s.admissions}>{memberships.filter(m=>m.status==="ACTIVE").map(m=><article key={m.id} className={s.admission}>
                <div><strong>{m.person.displayName}</strong><small>{m.activeCredentialId?"Carteirinha ativa":"Aguardando emissão"} · {formatDate(m.joinedAt)}</small></div>
                <button type="button" disabled={busy} onClick={()=>m.activeCredentialId?revokeCard(m):issueCard(m)}>
                  {m.activeCredentialId?"Revogar credencial":"Emitir credencial"}
                </button></article>)}</div>}
          </section>}
          {fichaId&&token&&<SecretaryDossier token={token} personId={fichaId} households={households} canEdit={secretary} canReadDocuments={staff} credential={credentialFromMemberships(secretary,memberships,fichaId)} onClose={()=>setFichaId(null)} onSessionExpired={logout}/>}
          <p className={s.footerNote}>HML Fase 1 · Dados sintéticos, ações auditadas e persistência no banco isolado. Não inserir informações de membros reais.</p>
        </div>}
    </div>
  </AppShell>;
}
