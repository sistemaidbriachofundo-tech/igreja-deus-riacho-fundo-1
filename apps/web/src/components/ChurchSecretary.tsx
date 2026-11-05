"use client";

import { useMemo, useState } from "react";
import { AppShell, UIIcon } from "./AppShell";
import { useChurchRecords } from "../lib/use-church-records";
import { advanceAdmission, openAdmission, STAGE_LABEL, MODALITY_LABEL, type Member, type Modality, type AdmissionStage } from "../lib/church-synthetic";
import { withBasePath } from "../lib/paths";
import s from "./church-secretary.module.css";

const stages: { code: AdmissionStage; label: string; hint: string }[] = [
  {code:"DOCUMENTS",label:"Documentação",hint:"Conferir dados e anexos"},
  {code:"SECRETARIA",label:"Secretaria",hint:"Validar informações"},
  {code:"PASTOR",label:"Pastoral",hint:"Decisão final"},
];
function Avatar({person}:{person:Member}){
  const photoIndex = (Math.max(0,Number(person.id.split("-").at(-1))-1))%6;
  return <span className={s.avatar} role="img" aria-label={"Retrato sintético de "+person.name} style={{backgroundImage:`url("${withBasePath("/images/pessoas-sinteticas.webp")}")`,backgroundPosition:`${photoIndex*20}% center`}}/>;
}

export function ChurchSecretary() {
  const {members,setMembers} = useChurchRecords();
  const [actor,setActor] = useState<"SECRETARIA" | "PASTOR">("SECRETARIA");
  const [filter,setFilter] = useState<"ALL"|AdmissionStage>("ALL");
  const [term,setTerm] = useState("");
  const [selected,setSelected] = useState<string|null>(null);
  const [modality,setModality] = useState<Modality>("BATISMO");
  const [notice,setNotice] = useState("");
  const pending = useMemo(()=>members.filter(p=>p.status==="PENDING_ADMISSION"),[members]);
  const visitors=useMemo(()=>members.filter(p=>p.status==="VISITOR"),[members]);
  const visible=pending.filter(p=>(filter==="ALL"||p.stage===filter) && [p.name,p.family].join(" ").toLocaleLowerCase("pt-BR").includes(term.toLocaleLowerCase("pt-BR")));
  const activeMember=members.find(p=>p.id===selected);
  const pastoral=pending.filter(p=>p.stage==="PASTOR").length;
  const documentary=pending.filter(p=>p.stage==="DOCUMENTS").length;
  const secretary=pending.filter(p=>p.stage==="SECRETARIA").length;

  function complete(member: Member) {
    const result=advanceAdmission(members,member.id,actor);
    if(!result.ok){setNotice(result.message);return;}
    setMembers(result.members);
    setNotice(member.stage==="PASTOR"?"Admissão concluída na base sintética.":"Etapa sintética concluída com sucesso.");
  }
  function start(member:Member){
    const result=openAdmission(members,member.id,modality);
    if(!result.ok){setNotice(result.message);return;}
    setMembers(result.members);
    setNotice("Protocolo sintético iniciado. Nenhuma decisão oficial foi registrada.");
  }

  return <AppShell active="secretaria" meta="Secretaria">
    <div className={s.page}>
      <div className={s.crumb}>Plataforma <span>/</span> Administração <span>/</span> <strong>Secretaria</strong></div>
      <header className={s.titleHeader}>
        <div><span className={s.eyebrow}>GESTÃO DE JORNADAS · F2</span><h1>Uma jornada de <em>pertencimento.</em></h1>
          <p>Protocolo, documentação e aprovação — com visibilidade do início ao fim.</p></div>
        <div className={s.headerActions}><span className={s.environment}><i/> Somente dados sintéticos</span><a href={withBasePath("/app/membros/")} className={s.newButton}><UIIcon name="plus" size={17}/> Cadastrar pessoa</a></div>
      </header>

      <section className={s.topPanel}>
        <div className={s.topPanelIntro}><span className={s.panelLabel}><UIIcon name="activity" size={17}/> VISÃO DE ACOMPANHAMENTO</span>
          <h2>Do primeiro encontro à membresia.</h2><p>Cada etapa importa. O processo deve ser transparente e humano.</p></div>
        <div className={s.workflow}>
          {stages.map((step,i)=><div className={s.workflowStep} key={step.code}>
            <div className={s.workflowNode}><span>{String(i+1).padStart(2,"0")}</span><UIIcon name={i===0?"layers":i===1?"check":"shield"} size={19}/></div>
            <div><strong>{step.label}</strong><small>{step.hint}</small><span>{pending.filter(p=>p.stage===step.code).length} {pending.filter(p=>p.stage===step.code).length===1?"processo":"processos"}</span></div>
          </div>)}
        </div>
      </section>

      <div className={s.summary}>
        <div><span><UIIcon name="layers" size={18}/></span><strong>{pending.length}</strong><small>Protocolos abertos</small><i>Em andamento</i></div>
        <div><span><UIIcon name="clock" size={18}/></span><strong>{documentary}</strong><small>Em documentação</small><i>Conferência inicial</i></div>
        <div><span><UIIcon name="check" size={18}/></span><strong>{secretary}</strong><small>Com a Secretaria</small><i>Validar informações</i></div>
        <div><span><UIIcon name="shield" size={18}/></span><strong>{pastoral}</strong><small>Com o pastor</small><i>Decisão pendente</i></div>
      </div>

      {notice && <div className={s.notice} role="status"><UIIcon name="check" size={16}/>{notice}<button type="button" aria-label="Fechar aviso" onClick={()=>setNotice("")}><UIIcon name="close" size={16}/></button></div>}

      <div className={s.board}>
        <section className={s.mainPanel}>
          <div className={s.sectionTop}><div><span className={s.kicker}>PAINEL DE PROTOCOLOS</span><h2>Admissões em andamento <span>{visible.length}</span></h2><p>Selecione uma pessoa para acompanhar os detalhes da solicitação.</p></div></div>
          <div className={s.controls}>
            <label className={s.search}><UIIcon name="search" size={17}/><input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Buscar por pessoa ou família..." aria-label="Pesquisar protocolos"/></label>
            <label className={s.actor}><span>Perfil da simulação</span><select aria-label="Perfil de avaliação" value={actor} onChange={e=>setActor(e.target.value as "SECRETARIA"|"PASTOR")}><option value="SECRETARIA">Secretaria</option><option value="PASTOR">Pastor</option></select></label>
          </div>
          <div className={s.filters} role="group" aria-label="Filtrar por etapa">{[{key:"ALL",label:"Todos"},{key:"DOCUMENTS",label:"Documentos"},{key:"SECRETARIA",label:"Secretaria"},{key:"PASTOR",label:"Pastoral"}].map(x=><button key={x.key} type="button" className={filter===x.key?s.filterActive:s.filter} onClick={()=>setFilter(x.key as typeof filter)}>{x.label}</button>)}</div>
          <div className={s.protocols}>{visible.map(person=><article key={person.id} className={selected===person.id?s.protocolSelected:s.protocol}>
            <button type="button" className={s.protocolIdentity} onClick={()=>setSelected(person.id)} aria-label={"Abrir admissão de "+person.name}>
              <Avatar person={person}/><span><strong>{person.name}</strong><small>{person.id} · {person.family}</small></span>
            </button>
            <div className={s.progressTrack} aria-label={"Etapa atual: "+STAGE_LABEL[person.stage]}>{stages.map((step,i)=><span key={step.code} className={i<=stages.findIndex(x=>x.code===person.stage)?s.progressFilled:s.progressEmpty}/>)}</div>
            <div className={s.stepTag}><span>{STAGE_LABEL[person.stage]}</span></div>
            <button type="button" className={s.openButton} onClick={()=>setSelected(person.id)} aria-label={"Ver detalhes de "+person.name}><UIIcon name="chevron" size={18}/></button>
          </article>)}
          {visible.length===0&&<div className={s.empty}><UIIcon name="search" size={27}/><strong>Nenhuma admissão encontrada</strong><small>Altere os filtros para encontrar outros processos.</small><button type="button" onClick={()=>{setTerm("");setFilter("ALL")}}>Limpar filtros</button></div>}
          </div>
          <p className={s.panelFoot}>Situações simuladas; atos formais só serão realizados com autenticação e auditoria pela API.</p>
        </section>

        <aside className={s.sidePanel}>
          <div className={s.detailHead}><span className={s.kicker}>PAINEL DE ACOMPANHAMENTO</span><h2>{activeMember?"Detalhes da jornada":"Próxima decisão"}</h2></div>
          {activeMember ? <div className={s.detailContent}>
            <div className={s.detailPerson}><Avatar person={activeMember}/><div><strong>{activeMember.name}</strong><small>{activeMember.id}</small></div><button aria-label="Fechar detalhes" type="button" onClick={()=>setSelected(null)}><UIIcon name="close" size={17}/></button></div>
            <div className={s.detailField}><span>Situação</span><strong>{activeMember.status==="VISITOR"?"Visitante":activeMember.status==="ACTIVE"?"Ativo":"Em admissão"}</strong></div>
            <div className={s.detailField}><span>Etapa</span><strong>{STAGE_LABEL[activeMember.stage]}</strong></div>
            <div className={s.detailField}><span>Modalidade</span><strong>{MODALITY_LABEL[activeMember.modality]}</strong></div>
            <div className={s.detailField}><span>Responsável nesta etapa</span><strong>{activeMember.stage==="PASTOR"?"Pastor":"Secretaria"}</strong></div>
            {activeMember.status==="PENDING_ADMISSION"&&<button type="button" className={s.nextStepButton} onClick={()=>complete(activeMember)}><UIIcon name="check" size={18}/> Concluir etapa sintética</button>}
            {activeMember.status==="VISITOR"&&<><label className={s.modalityLabel}>Modalidade<select aria-label="Modalidade de admissão" value={modality} onChange={e=>setModality(e.target.value as Modality)}>{Object.entries(MODALITY_LABEL).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><button type="button" className={s.nextStepButton} onClick={()=>start(activeMember)}><UIIcon name="plus" size={17}/> Iniciar admissão sintética</button></>}
            <div className={s.warning}><UIIcon name="shield" size={15}/> Perfil da simulação não substitui permissões oficiais.</div>
          </div> : <div className={s.detailEmpty}>
            <span className={s.detailVisual}><UIIcon name="layers" size={32}/></span>
            <strong>Cada etapa com a atenção que merece.</strong><p>Escolha um processo na lista para consultar o andamento e registrar uma ação de teste.</p>
          </div>}
          <div className={s.visitors}>
            <div><span className={s.kicker}>ACOLHIMENTO</span><h3>Novos visitantes <span>{visitors.length}</span></h3></div>
            {visitors.slice(0,4).map(p=><button key={p.id} type="button" onClick={()=>{setSelected(p.id);setNotice("");}}><Avatar person={p}/><span>{p.name}</span><UIIcon name="plus" size={16}/></button>)}
            <a href={withBasePath("/app/membros/")}>Abrir diretório completo <UIIcon name="arrow" size={15}/></a>
          </div>
        </aside>
      </div>
    </div>
  </AppShell>;
}
