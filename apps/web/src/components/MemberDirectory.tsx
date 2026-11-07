"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AppShell, UIIcon } from "./AppShell";
import { withBasePath } from "../lib/paths";
import { useChurchRecords } from "../lib/use-church-records";
import {
  STATUS_LABEL, STAGE_LABEL, MODALITY_LABEL, filterMembers, summarize,
  createMember, openAdmission, updateMemberNotes,
  type Member, type MemberStatus, type Modality, type MemberInput,
} from "../lib/church-synthetic";
import s from "./member-directory.module.css";

type ViewMode = "LIST" | "GRID";
type Filter = "ALL" | MemberStatus;
const EMPTY:MemberInput={name:"",email:"",family:"",phone:""};
const FILTERS: {key:Filter;label:string}[]=[
  {key:"ALL",label:"Todas as pessoas"},{key:"ACTIVE",label:"Membros ativos"},
  {key:"PENDING_ADMISSION",label:"Em admissão"},{key:"VISITOR",label:"Visitantes"},{key:"INACTIVE",label:"Inativos"},
];

function PersonAvatar({person,size="normal"}:{person:Member;size?:"normal"|"large"|"small"}){
  const words=person.name.trim().split(/\s+/);
  const initials=[words[0]?.[0],words.at(-1)?.[0]].filter(Boolean).join("").toUpperCase();
  return <span className={size==="large"?s.avatarLarge:size==="small"?s.avatarSmall:s.avatar}
    role="img" aria-label={"Avatar fictício de "+person.name}>{initials}</span>;
}
function Status({value}:{value:MemberStatus}){
  return <span className={s.status+" "+s["status"+value]}><i/>{STATUS_LABEL[value]}</span>;
}
const dateLabel=(value:string)=>new Date(value+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"});
function downloadCsv(people:Member[]){
  const esc=(v:string)=>'"'+v.replace(/^([=+\-@\t\r])/,"'$1").replace(/"/g,'""')+'"';
  const cols=[["ID","Nome","E-mail sintético","Família","Ministério","Situação","Cadastro"],...people.map(p=>[p.id,p.name,p.email,p.family,p.ministry,STATUS_LABEL[p.status],p.joinedAt])];
  const csv="\uFEFF"+cols.map(row=>row.map(x=>esc(String(x))).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="igreja-registros-sinteticos.csv";document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function MemberDirectory(){
  const {members,setMembers,reset}=useChurchRecords();
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<Filter>("ALL");
  const [view,setView]=useState<ViewMode>("LIST");
  const [sort,setSort]=useState<"NAME"|"RECENT">("NAME");
  const [page,setPage]=useState(1);
  const [selectedId,setSelectedId]=useState<string|null>("RF1-0001");
  const [inspectorOpen,setInspectorOpen]=useState(false);
  const [formOpen,setFormOpen]=useState(false);
  const [form,setForm]=useState<MemberInput>(EMPTY);
  const [notes,setNotes]=useState("");
  const [modality,setModality]=useState<Modality>("BATISMO");
  const [notice,setNotice]=useState("");
  const [resetPending,setResetPending]=useState(false);
  const perPage=view==="GRID"?9:10;
  const stats=useMemo(()=>summarize(members),[members]);
  const filtered=useMemo(()=>{
    const rows=filterMembers(members,query,filter);
    return rows.sort((a,b)=>sort==="RECENT"?b.joinedAt.localeCompare(a.joinedAt):a.name.localeCompare(b.name,"pt-BR"));
  },[members,query,filter,sort]);
  const pages=Math.max(1,Math.ceil(filtered.length/perPage));
  const visible=filtered.slice((Math.min(page,pages)-1)*perPage,Math.min(page,pages)*perPage);
  const selected=members.find(p=>p.id===selectedId)??null;
  const familyMembers=selected?members.filter(p=>p.family===selected.family):[];

  useEffect(()=>{
    function onKey(e:KeyboardEvent){
      if(e.key==="Escape"){setFormOpen(false);setInspectorOpen(false);}
    }
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[]);
  function open(person:Member){setSelectedId(person.id);setNotes(person.notes);setInspectorOpen(true);setNotice("");}
  function add(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const id="RF1-"+String(Math.max(0,...members.map(p=>Number(p.id.split("-").at(-1))||0))+1).padStart(4,"0");
    const result=createMember(members,form,id);
    if(!result.ok){setNotice(result.message);return;}
    setMembers(result.members);setForm(EMPTY);setFormOpen(false);setSelectedId(id);setNotes("");setInspectorOpen(true);
    setFilter("ALL");setQuery("");setPage(1);setNotice("Pessoa fictícia adicionada à base local.");
  }
  function saveNotes(){
    if(!selected)return;
    const result=updateMemberNotes(members,selected.id,notes);
    if(!result.ok){setNotice(result.message);return;}
    setMembers(result.members);setNotice("Anotações atualizadas apenas nesta base sintética.");
  }
  function start(){
    if(!selected)return;
    const result=openAdmission(members,selected.id,modality);
    if(!result.ok){setNotice(result.message);return;}
    setMembers(result.members);setNotice("Protocolo de admissão fictício iniciado.");
  }
  function clear(){
    reset();setSelectedId("RF1-0001");setInspectorOpen(false);setPage(1);setQuery("");setFilter("ALL");
    setNotice("Base sintética restaurada. Nenhum dado oficial foi alterado.");
    setResetPending(false);
  }

  return <AppShell active="membros" meta="Membros e famílias">
    <div className={s.page}>
      <header className={s.pageHeader}>
        <div className={s.headingContent}>
          <span className={s.eyebrow}><span/> PESSOAS & RELACIONAMENTOS</span>
          <h1>Pessoas fazem a <em>igreja.</em></h1>
          <p>Uma visão viva de cada história, família e jornada de pertencimento.</p>
        </div>
        <div className={s.headingActions}>
          <button type="button" className={s.exportButton} onClick={()=>downloadCsv(filtered)}><UIIcon name="download" size={17}/> Exportar CSV</button>
          <button type="button" className={s.addButton} onClick={()=>{setFormOpen(true);setNotice("");}}><UIIcon name="plus" size={17}/> Nova pessoa</button>
        </div>
      </header>

      <div className={s.insightStrip}>
        <div className={s.featureMetric}><span>TOTAL DA COMUNIDADE</span><div><strong>{stats.total}</strong><span>Pessoas na base sintética</span></div><div className={s.metricLines}><i/><i/><i/><i/><i/></div></div>
        <div className={s.stripMetric}><span className={s.stripIcon}><UIIcon name="people" size={18}/></span><strong>{stats.active}</strong><span>Membros ativos</span></div>
        <div className={s.stripMetric}><span className={s.stripIcon}><UIIcon name="family" size={18}/></span><strong>{stats.families}</strong><span>Núcleos familiares</span></div>
        <div className={s.stripMetric}><span className={s.stripIcon}><UIIcon name="clock" size={18}/></span><strong>{stats.pending}</strong><span>Em admissão</span></div>
        <div className={s.stripEmblem}><UIIcon name="spark" size={26}/><span>UMA IGREJA<br/>FEITA DE HISTÓRIAS.</span></div>
      </div>

      {notice&&<div className={s.notice} role="status"><UIIcon name="check" size={17}/><span>{notice}</span><button type="button" onClick={()=>setNotice("")} aria-label="Fechar aviso"><UIIcon name="close" size={17}/></button></div>}

      <div className={s.mainGrid}>
        <section className={s.listPanel} aria-labelledby="people-title">
          <div className={s.panelHeader}><div><span className={s.panelKicker}>DIRETÓRIO CENTRAL</span><h2 id="people-title">Sua comunidade <span>{filtered.length}</span></h2><p>Todos os registros acessíveis neste ambiente de avaliação.</p></div>
            <div className={s.panelHeaderButtons}>
              <button type="button" aria-label="Restaurar base de avaliação" title="Restaurar base de avaliação" aria-expanded={resetPending} aria-controls="confirmar-restauracao" onClick={()=>setResetPending(pending=>!pending)}><UIIcon name="refresh" size={17}/></button>
              <span className={s.viewSwitch} role="group" aria-label="Alternar visualização">
                <button type="button" className={view==="LIST"?s.viewActive:""} aria-label="Visualização em lista" aria-pressed={view==="LIST"} onClick={()=>{setView("LIST");setPage(1);}}><UIIcon name="layers" size={16}/></button>
                <button type="button" className={view==="GRID"?s.viewActive:""} aria-label="Visualização em galeria" aria-pressed={view==="GRID"} onClick={()=>{setView("GRID");setPage(1);}}><UIIcon name="grid" size={16}/></button>
              </span>
            </div>
          </div>
          {resetPending&&<div id="confirmar-restauracao" className={s.resetConfirm} role="group" aria-label="Confirmação de restauração de dados sintéticos">
            <UIIcon name="shield" size={22}/>
            <div><strong>Restaurar os dados de demonstração?</strong><p>Isso descarta cadastros, anotações e alterações desta base fictícia no seu navegador. Nenhum registro oficial da igreja será alterado.</p></div>
            <div className={s.resetConfirmActions}>
              <button type="button" onClick={()=>setResetPending(false)}>Cancelar</button>
              <button type="button" onClick={clear}>Restaurar dados fictícios</button>
            </div>
          </div>}
          <div className={s.controls}>
            <label className={s.search}><UIIcon name="search" size={18}/><input aria-label="Buscar pessoa, família ou ministério" placeholder="Buscar pessoas, famílias e ministérios..." value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></label>
            <label className={s.sort}><span>Ordenar:</span><select value={sort} onChange={e=>setSort(e.target.value as typeof sort)} aria-label="Ordenar pessoas"><option value="NAME">Nome A–Z</option><option value="RECENT">Mais recentes</option></select></label>
          </div>
          <div className={s.filters} role="group" aria-label="Situação da membresia">
            {FILTERS.map(x=><button type="button" key={x.key} className={filter===x.key?s.activeFilter:s.filter} aria-pressed={filter===x.key} onClick={()=>{setFilter(x.key);setPage(1);}}>{x.label}</button>)}
          </div>

          {view==="LIST"?
            <div className={s.peopleList}>
              <div className={s.tableHead}><span>PESSOA</span><span>VÍNCULO & MINISTÉRIO</span><span>SITUAÇÃO</span><span/></div>
              {visible.map(p=><button type="button" key={p.id} className={selectedId===p.id?s.personSelected:s.personRow} onClick={()=>open(p)} aria-label={"Abrir cadastro de "+p.name}>
                <span className={s.identity}><PersonAvatar person={p}/><span><strong>{p.name}</strong><small>{p.id} · {p.email}</small></span></span>
                <span className={s.family}><strong>{p.family}</strong><small>{p.ministry}</small></span>
                <span className={s.statusCell}><Status value={p.status}/></span>
                <span className={s.rowAction}><UIIcon name="chevron" size={18}/></span>
              </button>)}
              {visible.length===0&&<div className={s.empty}><UIIcon name="search" size={28}/><strong>Não encontramos essa pessoa.</strong><p>Tente outro nome ou remova os filtros.</p><button type="button" onClick={()=>{setQuery("");setFilter("ALL");setPage(1);}}>Limpar filtros</button></div>}
            </div>:
            <div className={s.peopleGrid}>{visible.map(p=><button key={p.id} type="button" className={s.personCard} onClick={()=>open(p)}>
              <span className={s.personCardTop}><PersonAvatar person={p} size="large"/><UIIcon name="arrow" size={16}/></span>
              <strong>{p.name}</strong><small>{p.family}</small><Status value={p.status}/><span className={s.personCardFoot}>{p.ministry}</span>
            </button>)}
              {visible.length===0&&<div className={s.empty}>Nenhum registro encontrado.</div>}
            </div>
          }
          <footer className={s.pagination}><span>{visible.length} exibidos · {filtered.length} resultados</span><div><button type="button" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</button><span>{Math.min(page,pages)} / {pages}</span><button type="button" disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Próxima</button></div></footer>
        </section>

        <aside className={inspectorOpen?s.inspectorOpen:s.inspector} aria-label="Prontuário selecionado">
          {selected?<><div className={s.inspectorHero}><span className={s.inspectorLabel}><UIIcon name="spark" size={15}/> PERFIL & HISTÓRICO</span>
              <button type="button" onClick={()=>{setInspectorOpen(false);setSelectedId(null);}} aria-label="Fechar prontuário"><UIIcon name="close" size={17}/></button>
              <div className={s.inspectorPhoto}><PersonAvatar person={selected} size="large"/></div>
              <h2>{selected.name}</h2><p>{selected.id} · {selected.email}</p><Status value={selected.status}/>
            </div>
            <div className={s.inspectorBody}><span className={s.infoTitle}>DADOS DA PESSOA</span>
              <dl className={s.detailGrid}>
                <div><dt>Núcleo familiar</dt><dd>{selected.family}</dd></div>
                <div><dt>Ministério</dt><dd>{selected.ministry}</dd></div>
                <div><dt>Cadastro</dt><dd>{dateLabel(selected.joinedAt)}</dd></div>
                <div><dt>Carteirinha</dt><dd>{selected.card==="ACTIVE"?"Ativa":selected.card==="REVOKED"?"Revogada":"Não emitida"}</dd></div>
              </dl>
              <div className={s.separator}/>
              <div className={s.familySection}><span className={s.infoTitle}>CONEXÃO FAMILIAR</span>
                <div className={s.familyBubble}><UIIcon name="family" size={18}/><span><strong>{selected.family}</strong><small>{familyMembers.length} {familyMembers.length===1?"pessoa vinculada":"pessoas vinculadas"}</small></span></div>
              </div>
              <div className={s.separator}/>
              <label className={s.notesLabel} htmlFor="internal-notes">OBSERVAÇÕES SINTÉTICAS</label>
              <textarea id="internal-notes" rows={3} maxLength={500} placeholder="Anotações de acompanhamento..." value={notes} onChange={e=>setNotes(e.target.value)}/>
              <button type="button" className={s.saveNotes} onClick={saveNotes}>Salvar observações <UIIcon name="check" size={16}/></button>
              {selected.status==="VISITOR"&&<div className={s.admissionActions}><span className={s.infoTitle}>INICIAR ADMISSÃO</span><select aria-label="Modalidade de admissão" value={modality} onChange={e=>setModality(e.target.value as Modality)}>{Object.entries(MODALITY_LABEL).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select><button type="button" onClick={start}>Iniciar protocolo de avaliação <UIIcon name="arrow" size={17}/></button></div>}
              {selected.status==="PENDING_ADMISSION"&&<a className={s.admissionLink} href={withBasePath("/app/secretaria/")}>Acompanhar {STAGE_LABEL[selected.stage]} <UIIcon name="arrow" size={17}/></a>}
              <p className={s.inspectorDisclaimer}><UIIcon name="shield" size={14}/> Os dados deste perfil são fictícios e ficam neste navegador.</p>
            </div></>:<div className={s.inspectorEmpty}><UIIcon name="people" size={34}/><strong>Selecione uma pessoa</strong><p>O prontuário será exibido aqui para acompanhamento.</p></div>}
        </aside>
      </div>
      {inspectorOpen&&<button type="button" className={s.mobileScrim} aria-label="Fechar prontuário" onClick={()=>setInspectorOpen(false)}/>}
    </div>

    {formOpen&&<div className={s.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setFormOpen(false);}}>
      <section className={s.modal} role="dialog" aria-modal="true" aria-labelledby="person-modal-title">
        <header><div><span className={s.panelKicker}>CADASTRO DE AVALIAÇÃO</span><h2 id="person-modal-title">Adicionar uma pessoa.</h2><p>Informações sintéticas para explorar a experiência.</p></div><button type="button" onClick={()=>setFormOpen(false)} aria-label="Fechar formulário"><UIIcon name="close" size={18}/></button></header>
        <form onSubmit={add} className={s.form}>
          <label>Nome completo<input required minLength={3} placeholder="Ex.: Marina Exemplo" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
          <label>E-mail sintético<input required type="email" placeholder="pessoa20@example.test" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
          <label>Família<input placeholder="Família Exemplo" value={form.family} onChange={e=>setForm({...form,family:e.target.value})}/></label>
          <label>Telefone fictício<input placeholder="Não informado" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
          <p>Somente e-mails do domínio <strong>@example.test</strong> serão aceitos.</p>
          <div className={s.formActions}><button type="button" onClick={()=>setFormOpen(false)}>Cancelar</button><button type="submit"><UIIcon name="plus" size={16}/> Salvar cadastro</button></div>
        </form>
      </section>
    </div>}
  </AppShell>;
}
