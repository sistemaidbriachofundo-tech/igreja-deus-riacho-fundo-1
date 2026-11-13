"use client";

import { useState, type FormEvent } from "react";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import { churchLocalToISO, dasError, formatChurchDate, type DasRecord } from "../lib/das-operations";
import styles from "./care-boards.module.css";
import { PersonPicker } from "./PersonPicker";

type Shared={ rows:DasRecord[]; token:string; roles:readonly string[]; refresh:()=>void };
const value=(v:unknown)=>typeof v==="string"?v.trim():"";
const record=(v:unknown):DasRecord|null=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as DasRecord:null;
const items=(v:unknown):DasRecord[]=>Array.isArray(v)?v.map(record).filter((x):x is DasRecord=>Boolean(x)):[];
const code=(value:string)=>encodeURIComponent(value);

/** Dados pastorais só são solicitados mediante clique do próprio PASTOR. */
export function PastoralBoard({rows,token,roles,refresh}:Shared){
  const [personId,setPersonId]=useState("");
  const [title,setTitle]=useState("");
  const [kind,setKind]=useState("VISITA");
  const [opened,setOpened]=useState<string|null>(null);
  const [detail,setDetail]=useState<DasRecord|null>(null);
  const [task,setTask]=useState("");
  const [assignee,setAssignee]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");

  async function execute(taskAction:()=>Promise<unknown>,onSuccess?:()=>void){
    if(busy)return false;
    setBusy(true);setNotice("");
    try{
      await taskAction();
      setNotice("Alteração registrada na base de homologação.");
      onSuccess?.();refresh();
      return true;
    }catch(err){setNotice(dasError(err));return false;}
    finally{setBusy(false);}
  }
  async function showCase(id:string){
    if(busy)return;
    if(opened===id){setOpened(null);setDetail(null);return;}
    setBusy(true);setNotice("");setDetail(null);
    try{
      const response=await apiGet<unknown>("/pastoral-cases/"+code(id),token);
      const body=record(response);
      if(!body)throw new Error("DTO inválido");
      setDetail(body);setOpened(id);
    }catch(e){setOpened(null);setNotice(dasError(e));}
    finally{setBusy(false);}
  }
  function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(personId.trim().length<2||title.trim().length<3)return;
    void execute(()=>apiPost("/pastoral-cases",token,{personId:personId.trim(),kind,title:title.trim()}),()=>{
      setPersonId("");setTitle("");
    });
  }
  return <section className={styles.board} aria-labelledby="pastoral-heading">
    <div className={styles.intro}><span>RF-008/009 · ACESSO PASTORAL</span><h2 id="pastoral-heading">Acompanhamento com sigilo</h2>
      <p>Somente o perfil pastoral autorizado pode consultar casos. Não registre informações reais ou dados íntimos na HML.</p></div>
    {notice&&<p role="status" className={styles.notice}>{notice}</p>}
    <form className={styles.form} onSubmit={create}>
      <h3>Abrir caso de teste</h3>
      <PersonPicker token={token} roles={roles} label="Pessoa atendida (fictícia)" value={personId} onChange={setPersonId} required/>
      <label>Categoria de atendimento<select value={kind} onChange={e=>setKind(e.target.value)}>
        <option value="VISITA">Visita</option><option value="ACOLHIMENTO">Acolhimento</option><option value="ACOMPANHAMENTO">Acompanhamento</option>
      </select></label>
      <label>Assunto genérico, sem detalhes íntimos<input required value={title} onChange={e=>setTitle(e.target.value)} maxLength={140} placeholder="Visita de acompanhamento (teste)"/></label>
      <button type="submit" disabled={busy||!personId.trim()||title.trim().length<3}>Abrir atendimento de teste</button>
    </form>
    <div className={styles.stack}>
      {rows.length===0&&<p className={styles.empty}>Nenhum atendimento na base de testes.</p>}
      {rows.map((row,i)=>{
        const id=value(row.id);const selected=opened===id;
        return <article key={id||i} className={styles.item}>
          <div className={styles.itemHead}>
            <div><strong>{value(row.title)||"Atendimento sem título"}</strong>
              <small>Estado: {value(row.status)||"não informado"} · {formatChurchDate(row.createdAt)}</small></div>
            <button type="button" disabled={!id||busy} onClick={()=>{setOpened(null);setDetail(null);}} aria-expanded={selected}>
              {selected?"Ocultar":"Abrir com autorização"}
            </button>
          </div>
          {selected&&detail&&<div className={styles.details}>
            <label>Andamento<select aria-label="Estado do atendimento" value={value(detail.status)||"OPEN"}
              onChange={e=>void execute(()=>apiPatch("/pastoral-cases/"+code(id)+"/status",token,{status:e.target.value}),()=>{setOpened(null);setDetail(null);})} disabled={busy}>
              <option value="OPEN">Aberto</option><option value="IN_PROGRESS">Em andamento</option><option value="DONE">Concluído</option><option value="CANCELLED">Cancelado</option>
            </select></label>
            <form onSubmit={e=>{e.preventDefault();if(assignee.trim())void execute(()=>apiPatch("/pastoral-cases/"+code(id)+"/assign",token,{assignedToUserId:assignee.trim()}),()=>setAssignee(""));}}>
              <label>ID do responsável autorizado<input value={assignee} onChange={e=>setAssignee(e.target.value)} required maxLength={100}/></label>
              <button type="submit" disabled={busy||!assignee.trim()}>Atribuir</button>
            </form>
            <h3>Tarefas de acompanhamento</h3>
            {items(detail.tasks).map((entry,i)=>{
              const taskId=value(entry.id);
              return <div className={styles.task} key={taskId||i}>
                <span>{value(entry.title)||"Tarefa"} {entry.done===true?"· Concluída":"· Pendente"}</span>
                <button disabled={busy||!taskId} type="button"
                  onClick={()=>void execute(()=>apiPatch("/pastoral-cases/"+code(id)+"/tasks/"+code(taskId),token,{done:entry.done!==true}),()=>{setOpened(null);setDetail(null);})}>
                  {entry.done===true?"Reabrir":"Concluir"}
                </button>
              </div>;
            })}
            <form onSubmit={e=>{e.preventDefault();if(task.trim().length>2)void execute(()=>apiPost("/pastoral-cases/"+code(id)+"/tasks",token,{title:task.trim()}),()=>setTask(""));}}>
              <label>Nova tarefa genérica<input required value={task} onChange={e=>setTask(e.target.value)} maxLength={140}/></label>
              <button type="submit" disabled={busy||task.trim().length<3}>Criar tarefa</button>
            </form>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}

export function DiscipleshipBoard({rows,token,roles,refresh}:Shared){
  const [newName,setNewName]=useState("");
  const [description,setDescription]=useState("");
  const [trackId,setTrackId]=useState("");
  const [personId,setPersonId]=useState("");
  const [mentorId,setMentorId]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  async function submit(action:()=>Promise<unknown>,reset:()=>void){
    if(busy)return;
    setBusy(true);setNotice("");
    try{await action();reset();refresh();setNotice("Registro atualizado e sincronizado com a API de testes.");}
    catch(e){setNotice(dasError(e));}
    finally{setBusy(false);}
  }
  return <section className={styles.board} aria-labelledby="discipleship-heading">
    <div className={styles.intro}><span>RF-010 · DISCIPULADO</span><h2 id="discipleship-heading">Trilhas e mentorias</h2>
      <p>Acompanhe trilhas existentes e vincule pessoas fictícias a um mentor, com histórico gerenciado no servidor.</p></div>
    {notice&&<p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.split}>
      <form className={styles.form} onSubmit={e=>{e.preventDefault();if(newName.trim().length>2)void submit(
        ()=>apiPost("/discipleship/tracks",token,{name:newName.trim(),description:description.trim()}),
        ()=>{setNewName("");setDescription("");}
      );}}>
        <h3>Nova trilha</h3>
        <label>Nome da trilha<input required value={newName} onChange={e=>setNewName(e.target.value)} maxLength={100}/></label>
        <label>Descrição institucional curta<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={600} rows={2}/></label>
        <button type="submit" disabled={busy||newName.trim().length<3}>Criar trilha fictícia</button>
      </form>
      <form className={styles.form} onSubmit={e=>{e.preventDefault();if(trackId&&personId.trim())void submit(
        ()=>apiPost("/discipleship/enrollments",token,{trackId,personId:personId.trim(),...(mentorId.trim()?{mentorPersonId:mentorId.trim()}:{})}),
        ()=>{setPersonId("");setMentorId("");}
      );}}>
        <h3>Matricular em trilha</h3>
        <label>Trilha existente<select required value={trackId} onChange={e=>setTrackId(e.target.value)}>
          <option value="">Selecione uma trilha</option>{rows.map((row,i)=><option key={value(row.id)||i} value={value(row.id)}>{value(row.name)||"Trilha sem nome"}</option>)}
        </select></label>
        <PersonPicker token={token} roles={roles} label="Pessoa fictícia" value={personId} onChange={setPersonId} required/>
        <PersonPicker token={token} roles={roles} label="Mentor (opcional)" value={mentorId} onChange={setMentorId}/>
        <button type="submit" disabled={busy||!trackId||!personId.trim()}>Registrar matrícula</button>
      </form>
    </div>
    <div className={styles.stack}>
      {rows.map((row,i)=><article key={value(row.id)||i} className={styles.item}>
        <div className={styles.itemHead}><div><strong>{value(row.name)||"Trilha"}</strong><small>{Array.isArray(row.enrollments)?items(row.enrollments).length+" matrículas na resposta atual":"A API não incluiu matrículas nesta consulta"}</small></div></div>
        {items(row.enrollments).map((enrollment,i)=>{
          const eid=value(enrollment.id);const status=value(enrollment.status);
          return <div className={styles.task} key={eid||i}>
            <span>Inscrição {i+1} · {status||"sem estado"}</span>
            {eid&&<label>Atualizar etapa<select value={status||"ACTIVE"} disabled={busy}
              onChange={e=>void submit(()=>apiPatch("/discipleship/enrollments/"+code(eid),token,{status:e.target.value}),()=>{})}>
              <option value="ACTIVE">Ativa</option><option value="PAUSED">Pausada</option><option value="COMPLETED">Concluída</option><option value="CANCELLED">Cancelada</option>
            </select></label>}
          </div>;
        })}
      </article>)}
    </div>
  </section>;
}

export function GroupsBoard({rows,token,roles,refresh}:Shared){
  const [selected,setSelected]=useState("");
  const [personId,setPersonId]=useState("");
  const [role,setRole]=useState("MEMBER");
  const [meeting,setMeeting]=useState("");
  const [attendance,setAttendance]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  async function submit(task:()=>Promise<unknown>,reset:()=>void){
    if(busy)return;
    setBusy(true);setNotice("");
    try{await task();reset();refresh();setNotice("Registro confirmado pela API de homologação.");}
    catch(e){setNotice(dasError(e));}finally{setBusy(false);}
  }
  const validGroup=rows.some(row=>row.id===selected);
  return <section className={styles.board} aria-labelledby="groups-heading">
    <div className={styles.intro}><span>RF-011 · GRUPOS E CÉLULAS</span><h2 id="groups-heading">Pessoas, encontros e presença</h2>
      <p>Presenças e vínculos são gravados por ID de pessoa. Não utilizar nomes ou registros reais nesta base.</p></div>
    {notice&&<p role="status" className={styles.notice}>{notice}</p>}
    <label className={styles.groupSelect}>Selecionar grupo<select value={selected} onChange={e=>setSelected(e.target.value)}>
      <option value="">Escolha um grupo da API</option>{rows.map((row,i)=><option key={value(row.id)||i} value={value(row.id)}>{value(row.name)||"Grupo"}</option>)}
    </select></label>
    {validGroup&&<div className={styles.split}>
      <form className={styles.form} onSubmit={e=>{e.preventDefault();if(personId.trim())void submit(
        ()=>apiPost("/small-groups/"+code(selected)+"/members",token,{personId:personId.trim(),role}),
        ()=>setPersonId("")
      );}}>
        <h3>Vincular pessoa ao grupo</h3>
        <label>ID da pessoa fictícia<input required value={personId} onChange={e=>setPersonId(e.target.value)}/></label>
        <label>Papel<select value={role} onChange={e=>setRole(e.target.value)}><option value="MEMBER">Participante</option><option value="LEADER">Líder</option></select></label>
        <button type="submit" disabled={busy||!personId.trim()}>Adicionar ao grupo</button>
      </form>
      <form className={styles.form} onSubmit={e=>{e.preventDefault();if(!meeting)return;
        const iso=churchLocalToISO(meeting);if(!iso){setNotice("Data inválida para o fuso de Brasília.");return;}
        const ids=attendance.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
        if(ids.length!==new Set(ids).size){setNotice("ID repetido na presença.");return;}
        void submit(()=>apiPost("/small-groups/"+code(selected)+"/meetings",token,{
          occurredAt:iso,attendance:ids.map(personId=>({personId,present:true}))
        }),()=>{setMeeting("");setAttendance("");});
      }}>
        <h3>Registrar encontro</h3>
        <label>Data e horário do encontro<input type="datetime-local" required value={meeting} onChange={e=>setMeeting(e.target.value)}/></label>
        <label>IDs dos presentes (opcional, separados por vírgula)<textarea rows={2} value={attendance} onChange={e=>setAttendance(e.target.value)} placeholder="ID-pessoa-1, ID-pessoa-2"/></label>
        <button type="submit" disabled={busy||!meeting}>Registrar encontro de teste</button>
      </form>
    </div>}
  </section>;
}
