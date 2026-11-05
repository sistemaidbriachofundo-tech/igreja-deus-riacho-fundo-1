"use client";

import { useMemo, useState } from "react";
import { AppShell, UIIcon } from "./AppShell";
import { useChurchRecords } from "../lib/use-church-records";
import { setMemberCard, type Member } from "../lib/church-synthetic";
import { withBasePath } from "../lib/paths";
import s from "./church-credentials.module.css";

function Photo({ person, wide=false }: { person:Member;wide?:boolean }){
  const index=(Math.max(0,Number(person.id.split("-").at(-1))-1))%6;
  return <span role="img" aria-label={"Retrato sintético de "+person.name} className={wide?s.photoLarge:s.photo}
    style={{backgroundImage:`url("${withBasePath("/images/pessoas-sinteticas.webp")}")`,backgroundPosition:`${index*20}% center`}}/>;
}
function stateText(person:Member){return person.card==="ACTIVE"?"Ativa":person.card==="REVOKED"?"Revogada":"Não emitida";}

export function ChurchCredentials(){
  const {members,setMembers}=useChurchRecords();
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<"ALL"|"ACTIVE"|"PENDING">("ALL");
  const [notice,setNotice]=useState("");
  const eligible=useMemo(()=>members.filter(p=>p.status==="ACTIVE"),[members]);
  const issued=eligible.filter(p=>p.card==="ACTIVE");
  const notIssued=eligible.filter(p=>p.card!=="ACTIVE");
  const visible=eligible.filter(p=>(filter==="ALL"||(filter==="ACTIVE"?p.card==="ACTIVE":p.card!=="ACTIVE")) &&
    [p.name,p.family,p.id].join(" ").toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const selected=eligible.find(p=>p.id===selectedId)??eligible[0]??null;

  function changeCard(person: Member,action:"ISSUE"|"REVOKE"){
    const result=setMemberCard(members,person.id,action);
    if(!result.ok){setNotice(result.message);return;}
    setMembers(result.members);
    setNotice(action==="ISSUE"?"Carteirinha de avaliação emitida localmente.":"Carteirinha de avaliação revogada localmente.");
  }

  return <AppShell active="carteirinha" meta="Carteirinhas">
    <div className={s.page}>
      <header className={s.header}>
        <div><span className={s.kicker}>IDENTIDADE & PERTENCIMENTO</span>
          <h1>Uma identidade que <em>representa.</em></h1>
          <p>Uma nova experiência para organizar as credenciais da comunidade.</p>
        </div>
        <span className={s.headerState}><i/> Ambiente sintético · sem validação externa</span>
      </header>
      <div className={s.stats}>
        <div><span><UIIcon name="badge" size={21}/></span><strong>{issued.length}</strong><small>Credenciais ativas</small></div>
        <div><span><UIIcon name="people" size={21}/></span><strong>{eligible.length}</strong><small>Membros elegíveis</small></div>
        <div><span><UIIcon name="clock" size={21}/></span><strong>{notIssued.length}</strong><small>Pendentes de emissão</small></div>
      </div>

      {notice&&<div className={s.notice} role="status"><UIIcon name="check" size={17}/>{notice}<button aria-label="Fechar aviso" type="button" onClick={()=>setNotice("")}><UIIcon name="close" size={17}/></button></div>}

      <div className={s.layout}>
        <section className={s.previewArea} aria-labelledby="preview-title">
          <div className={s.previewTop}><div><span className={s.kicker}>CREDENCIAL DIGITAL</span><h2 id="preview-title">Visualização da carteirinha</h2><p>Documento ilustrativo para homologação da experiência.</p></div><span className={s.previewChip}><UIIcon name="shield" size={14}/> Prévia</span></div>
          {selected?<div className={s.cardOuter}>
            <div className={s.identityCard}>
              <div className={s.orbitOne}/><div className={s.orbitTwo}/>
              <div className={s.identityTop}><div className={s.brandGroup}>
                <span className={s.brandLogo} style={{backgroundImage:`url("${withBasePath("/images/logo-igreja-aprovada.webp")}")`}} role="img" aria-label="Logomarca da Igreja de Deus"/>
                <span><strong>IGREJA DE DEUS</strong><small>NO RIACHO FUNDO I</small></span>
              </div><span className={s.identityEdition}>MEMBRESIA / 2026</span></div>
              <div className={s.identityCenter}>
                <span className={s.cardOverline}>IDENTIFICAÇÃO ECLESIÁSTICA</span>
                <div className={s.identityProfile}><Photo person={selected} wide/><span><strong>{selected.name}</strong><small>{selected.family}</small><em>Membro da congregação</em></span></div>
              </div>
              <div className={s.identityBottom}><div><span>MATRÍCULA</span><strong>{selected.id}</strong></div><div><span>CONDIÇÃO</span><strong>{stateText(selected).toUpperCase()}</strong></div><div className={s.cardEmblem}><UIIcon name="spark" size={23}/></div></div>
              <span className={s.cardWatermark}>AMBIENTE DE TESTE • DOCUMENTO SEM VALIDADE</span>
            </div>
          </div>:<div className={s.noCard}>Não existem membros elegíveis na base sintética.</div>}
          <div className={s.previewFoot}><div><UIIcon name="shield" size={17}/><span><strong>Visual de homologação</strong><small>QR de verificação e assinatura oficial não estão habilitados nesta versão.</small></span></div><span>MODELO 01 / INSTITUCIONAL</span></div>
        </section>

        <aside className={s.manager}>
          <div className={s.managerTop}><span className={s.kicker}>CONTROLE DE IDENTIDADE</span><h2>Gerenciar credencial</h2><p>Selecione uma pessoa abaixo para visualizar e alterar sua carteirinha sintética.</p></div>
          {selected&&<div className={s.managerSelected}><Photo person={selected}/><span><strong>{selected.name}</strong><small>{selected.id} · {selected.family}</small></span></div>}
          {selected&&<><div className={s.managerField}><span>Situação da membresia</span><strong className={s.greenState}><i/> Ativo</strong></div>
            <div className={s.managerField}><span>Estado da carteirinha</span><strong className={selected.card==="ACTIVE"?s.greenState:s.pendingState}><i/>{stateText(selected)}</strong></div>
            <div className={s.managerDivider}/>
            <button type="button" className={selected.card==="ACTIVE"?s.revokeButton:s.issueButton} onClick={()=>changeCard(selected,selected.card==="ACTIVE"?"REVOKE":"ISSUE")}>
              <UIIcon name={selected.card==="ACTIVE"?"shield":"badge"} size={18}/>{selected.card==="ACTIVE"?"Revogar carteirinha":"Emitir carteirinha"}<UIIcon name="arrow" size={16}/>
            </button>
            <p className={s.actionDisclaimer}>Ação local e fictícia. Nenhuma carteirinha oficial será emitida ou revogada.</p></>}
          <div className={s.managerFeature}><UIIcon name="spark" size={19}/><strong>Cada pessoa. Uma história.</strong><p>A identidade digital é uma extensão do cuidado, não apenas um número.</p></div>
        </aside>
      </div>

      <section className={s.directory}>
        <header className={s.directoryHeader}><div><span className={s.kicker}>DIRETÓRIO DE IDENTIFICAÇÕES</span><h2>Controle de carteirinhas <span>{visible.length}</span></h2><p>Todos os membros elegíveis encontrados nesta base de avaliação.</p></div></header>
        <div className={s.directoryControls}>
          <label className={s.search}><UIIcon name="search" size={18}/><input placeholder="Buscar por nome, família ou matrícula" aria-label="Pesquisar carteirinhas" value={query} onChange={e=>setQuery(e.target.value)}/></label>
          <div className={s.filterGroup} role="group" aria-label="Filtrar carteirinhas">
            {([{id:"ALL",label:"Todas"},{id:"ACTIVE",label:"Ativas"},{id:"PENDING",label:"Pendentes"}] as const).map(opt=><button type="button" key={opt.id} className={filter===opt.id?s.filterActive:s.filter} onClick={()=>setFilter(opt.id)}>{opt.label}</button>)}
          </div>
        </div>
        <div className={s.directoryGrid}>
          {visible.map(person=><button key={person.id} type="button" onClick={()=>{setSelectedId(person.id);setNotice("");window.scrollTo({top:0,behavior:"smooth"});}} className={selected?.id===person.id?s.personSelected:s.person}>
            <Photo person={person}/><span><strong>{person.name}</strong><small>{person.id} · {person.family}</small></span><span className={person.card==="ACTIVE"?s.activeBadge:s.pendingBadge}><i/>{stateText(person)}</span><UIIcon name="chevron" size={18}/>
          </button>)}
          {visible.length===0&&<p className={s.empty}>Nenhuma carteirinha corresponde aos filtros informados.</p>}
        </div>
      </section>
    </div>
  </AppShell>;
}
