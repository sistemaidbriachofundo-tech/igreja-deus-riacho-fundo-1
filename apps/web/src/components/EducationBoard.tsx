"use client";

import { useActionConfirmation } from "./ui/ActionConfirmation";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost } from "../lib/api";
import { churchLocalToISO, dasError, formatChurchDate, readDasRows, type DasRecord } from "../lib/das-operations";
import { PersonPicker } from "./PersonPicker";
import s from "./operations-expansion.module.css";

type ViewState="idle"|"loading"|"ready"|"error";
type Props={courses:DasRecord[];token:string;roles:readonly string[];refresh:()=>void};
const str=(v:unknown)=>typeof v==="string"?v:"";
const id=(v:unknown)=>encodeURIComponent(str(v));
const title=(v:unknown,fallback="Cadastro de teste")=>str(v).trim()||fallback;
const synthetic=(v:string)=>/^TESTE(?:\s|[-_]|$)/i.test(v.trim())&&v.trim().length>=7;
const getRows=(value:unknown,key:string)=>readDasRows(value,key);
const liveEnrollment=(r:DasRecord)=>r.status==="ENROLLED";

export function EducationBoard({courses,token,roles,refresh}:Props){
  const { confirm, confirmation } = useActionConfirmation();
  const [courseId,setCourseId]=useState("");
  const [classId,setClassId]=useState("");
  const [classes,setClasses]=useState<DasRecord[]>([]);
  const [enrollments,setEnrollments]=useState<DasRecord[]>([]);
  const [sessions,setSessions]=useState<DasRecord[]>([]);
  const [classState,setClassState]=useState<ViewState>("idle");
  const [classError,setClassError]=useState("");
  const [sessionState,setSessionState]=useState<ViewState>("idle");
  const [sessionError,setSessionError]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [revision,setRevision]=useState(0);
  const [courseName,setCourseName]=useState("");
  const [courseCode,setCourseCode]=useState("");
  const [courseDescription,setCourseDescription]=useState("");
  const [className,setClassName]=useState("");
  const [teacher,setTeacher]=useState("");
  const [student,setStudent]=useState("");
  const [meetingTitle,setMeetingTitle]=useState("");
  const [meetingAt,setMeetingAt]=useState("");
  const [attendance,setAttendance]=useState<Record<string,boolean>>({});
  const [certificates,setCertificates]=useState<Record<string,boolean>>({});

  useEffect(()=>{
    if(!courseId){setClasses([]);setClassState("idle");return;}
    let cancelled=false;setClassState("loading");setClassError("");setClasses([]);
    void apiGet<unknown>("/courses/"+id(courseId)+"/classes",token)
      .then(body=>{const rows=getRows(body,"classes");if(!cancelled){setClasses(rows);setClassState("ready");}})
      .catch(error=>{if(!cancelled){setClasses([]);setClassError(dasError(error));setClassState("error");}});
    return()=>{cancelled=true;};
  },[courseId,token,revision]);

  useEffect(()=>{
    if(!classId){setEnrollments([]);setSessions([]);setSessionState("idle");return;}
    let cancelled=false;setSessionState("loading");setSessionError("");setEnrollments([]);setSessions([]);
    void Promise.all([
      apiGet<unknown>("/courses/classes/"+id(classId)+"/enrollments",token),
      apiGet<unknown>("/courses/classes/"+id(classId)+"/sessions",token),
    ]).then(([e,m])=>{
      const people=getRows(e,"enrollments"),meetings=getRows(m,"sessions");
      if(!cancelled){setEnrollments(people);setSessions(meetings);setSessionState("ready");}
    }).catch(error=>{if(!cancelled){setEnrollments([]);setSessions([]);setSessionError(dasError(error));setSessionState("error");}});
    return()=>{cancelled=true;};
  },[classId,token,revision]);

  async function action(path:string,body:unknown,onSuccess:()=>void){
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      await apiPost(path,token,body);
      onSuccess();setMessage("Alteração registrada.");
      setRevision(n=>n+1);refresh();
    }catch(error){setMessage(dasError(error));}
    finally{setBusy(false);}
  }

  function newCourse(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!synthetic(courseName)){setMessage("Para a HML, o nome do curso deve começar por TESTE.");return;}
    void action("/courses",{name:courseName.trim(),...(courseCode.trim()?{code:courseCode.trim()}:{}),
      ...(courseDescription.trim()?{description:courseDescription.trim()}:{} )},()=>{
      setCourseName("");setCourseCode("");setCourseDescription("");
    });
  }
  function newClass(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!courseId)return;
    if(!synthetic(className)){setMessage("O nome da turma fictícia deve começar por TESTE.");return;}
    void action("/courses/"+id(courseId)+"/classes",{name:className.trim(),...(teacher?{teacherPersonId:teacher}:{})},
      ()=>{setClassName("");setTeacher("");});
  }
  async function enroll(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!classId||!student)return;
    if (!(await confirm({
      title: "Registrar matrícula?",
      subject: selectedClass ? title(selectedClass.name) : undefined,
      description: "A pessoa selecionada será inscrita na turma.",
      action: "Matricular",
    }))) return;
    void action("/courses/classes/"+id(classId)+"/enrollments",{personId:student},()=>setStudent(""));
  }
  async function complete(enrollment:DasRecord){
    const enrollmentId=str(enrollment.id);
    if(!enrollmentId||!liveEnrollment(enrollment))return;
    const issueCertificate=certificates[enrollmentId]===true;
    if (!(await confirm({
      title: "Concluir matrícula?",
      subject: selectedClass ? title(selectedClass.name) : undefined,
      description: issueCertificate
        ? "A matrícula será concluída e a aprovação do certificado será registrada."
        : "A matrícula será marcada como concluída.",
      action: "Concluir matrícula",
    }))) return;
    void action("/courses/enrollments/"+id(enrollmentId)+"/complete",{issueCertificate},()=>{
      setCertificates(prev=>({...prev,[enrollmentId]:false}));
    });
  }
  async function newSession(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!classId)return;
    const occurredAt=churchLocalToISO(meetingAt);
    if(!occurredAt){setMessage("Informe data e hora válidas no fuso de Brasília.");return;}
    const roster=enrollments.filter(liveEnrollment);
    const attendances=roster.map(x=>({personId:str(x.personId),present:attendance[str(x.personId)]===true}))
      .filter(x=>x.personId.length>0);
    if(attendances.length!==roster.length){setMessage("Há matrículas sem identidade válida. Não é possível gravar a chamada.");return;}
    if (!(await confirm({
      title: "Registrar frequência?",
      subject: meetingTitle.trim() || "Aula de teste",
      description: "As pessoas marcadas terão presença registrada. As demais receberão falta.",
      action: "Registrar frequência",
      cancel: "Revisar chamada",
    }))) return;
    void action("/courses/classes/"+id(classId)+"/sessions",{
      occurredAt,title:meetingTitle.trim()||"Aula de teste",attendances
    },()=>{setMeetingTitle("");setMeetingAt("");setAttendance({});});
  }

  const selectedCourse=courses.find(x=>x.id===courseId);
  const selectedClass=classes.find(x=>x.id===classId);
  return <section className={s.board} aria-labelledby="education-heading">
    {confirmation}
    <header className={s.heading}>
      <div><span>RF-023 · ENSINO CRISTÃO</span><h2 id="education-heading">Jornada de ensino e EBD</h2>
        <p>Planeje turmas, acompanhe matrículas, registre frequência e conclusão. Discipulado e EBD permanecem domínios distintos.</p>
      </div><span className={s.pill}>Base sintética · HML</span>
    </header>
    <div className={s.statGrid} aria-label="Resumo do ensino">
      <div><strong>{courses.length}</strong><span>Cursos cadastrados</span></div>
      <div><strong>{classes.length}</strong><span>Turmas do curso</span></div>
      <div><strong>{enrollments.length}</strong><span>Matrículas na turma</span></div>
      <div><strong>{sessions.length}</strong><span>Aulas registradas</span></div>
    </div>
    {message&&<p className={s.notice} role="status">{message}</p>}
    <div className={s.split}>
      <div className={s.panel}>
        <h3>01 / Cursos e trilhas</h3>
        <label>Escolha um curso
          <select value={courseId} onChange={e=>{setCourseId(e.target.value);setClassId("");setMessage("");}}>
            <option value="">Selecione para visualizar as turmas</option>
            {courses.map(x=><option key={str(x.id)} value={str(x.id)}>{title(x.name)} · {title(x.status,"ACTIVE")}</option>)}
          </select>
        </label>
        {courseId&&selectedCourse&&<p className={s.context}><strong>{title(selectedCourse.name)}</strong>
          {title(selectedCourse.description,"Nenhuma descrição informada")}</p>}
        <form className={s.form} onSubmit={newCourse}>
          <h4>Novo curso de homologação</h4>
          <label>Nome fictício<input required maxLength={120} value={courseName} onChange={e=>setCourseName(e.target.value)} placeholder="TESTE — Curso para novos membros"/></label>
          <label>Código opcional<input maxLength={60} value={courseCode} onChange={e=>setCourseCode(e.target.value)} placeholder="TESTE-EB-01"/></label>
          <label>Descrição opcional<textarea rows={2} maxLength={400} value={courseDescription}
            onChange={e=>setCourseDescription(e.target.value)} placeholder="Objetivos da formação fictícia"/></label>
          <button disabled={busy} type="submit">Criar curso fictício</button>
        </form>
      </div>
      <div className={s.panel}>
        <h3>02 / Turmas e professores</h3>
        {!courseId?<p className={s.empty}>Selecione um curso para gerenciar suas turmas.</p>:
        classState==="loading"?<p role="status" className={s.empty}>Carregando turmas autorizadas…</p>:
        classState==="error"?<p role="alert" className={s.error}>{classError}</p>:<>
          <label>Turma do curso
            <select value={classId} onChange={e=>{setClassId(e.target.value);setMessage("");}}>
              <option value="">Selecione uma turma</option>
              {classes.map(c=><option key={str(c.id)} value={str(c.id)}>{title(c.name)} · {title(c.status,"OPEN")}</option>)}
            </select>
          </label>
          {classes.length===0&&<p className={s.empty}>Ainda não existem turmas cadastradas.</p>}
          <form className={s.form} onSubmit={newClass}>
            <h4>Abrir turma</h4>
            <label>Nome fictício<input required maxLength={120} value={className} onChange={e=>setClassName(e.target.value)} placeholder="TESTE — Turma de domingo"/></label>
            <PersonPicker token={token} roles={roles} label="Professor cadastrado (opcional)"
              value={teacher} onChange={setTeacher}/>
            <button type="submit" disabled={busy}>Criar turma na HML</button>
          </form>
        </>}
      </div>
    </div>
    {selectedClass&&<div className={s.panel}>
      <div className={s.panelTop}><div><h3>03 / Gestão da turma</h3>
        <p><strong>{title(selectedClass.name)}</strong> · Situação: {title(selectedClass.status)}</p></div>
        <button type="button" className={s.outline} onClick={()=>setRevision(n=>n+1)} disabled={busy}>Atualizar frequência</button>
      </div>
      {sessionState==="loading"?<p role="status">Consultando matrículas e aulas…</p>:
      sessionState==="error"?<p role="alert" className={s.error}>{sessionError}</p>:sessionState==="ready"&&<>
        <div className={s.split}>
          <div className={s.subsection}>
            <h4>Matrículas</h4>
            {enrollments.length===0&&<p className={s.empty}>Nenhum aluno matriculado nesta turma.</p>}
            <div className={s.list}>
              {enrollments.map(enrollment=>{
                const eId=str(enrollment.id);
                return <article className={s.item} key={eId}>
                  <div><strong>Cadastro {str(enrollment.personId).slice(0,8)}…</strong>
                    <small>{title(enrollment.status)} · {formatChurchDate(str(enrollment.enrolledAt))}</small></div>
                  {liveEnrollment(enrollment)&&<div className={s.itemActions}>
                    <label className={s.checkbox}><input type="checkbox" checked={certificates[eId]===true}
                      onChange={e=>setCertificates(p=>({...p,[eId]:e.target.checked}))}/>
                      <span>Aprovar certificado (metadado)</span>
                    </label>
                    <button type="button" disabled={busy} onClick={()=>complete(enrollment)}>Concluir</button>
                  </div>}
                  {enrollment.status==="COMPLETED"&&<span className={s.ok}>Concluído</span>}
                </article>;
              })}
            </div>
            <form className={s.form} onSubmit={enroll}>
              <h4>Adicionar aluno fictício</h4>
              <PersonPicker token={token} roles={roles} label="Pessoa cadastrada" value={student} onChange={setStudent} required/>
              <button type="submit" disabled={busy||!student||selectedClass.status!=="OPEN"}>Matricular aluno</button>
            </form>
          </div>
          <div className={s.subsection}>
            <h4>Frequência e aulas</h4>
            <div className={s.list}>
              {sessions.length===0&&<p className={s.empty}>Nenhuma aula registrada ainda.</p>}
              {sessions.map(session=><article className={s.item} key={str(session.id)}>
                <div><strong>{title(session.title,"Aula registrada")}</strong>
                  <small>{formatChurchDate(str(session.occurredAt))} · {Array.isArray(session.attendances)?session.attendances.length:0} registros de frequência</small></div>
              </article>)}
            </div>
            <form className={s.form} onSubmit={newSession}>
              <h4>Registrar chamada fictícia</h4>
              <label>Assunto da aula<input required maxLength={150} value={meetingTitle}
                onChange={e=>setMeetingTitle(e.target.value)} placeholder="TESTE — Aula sobre serviço"/></label>
              <label>Data e hora da igreja<input type="datetime-local" required value={meetingAt}
                onChange={e=>setMeetingAt(e.target.value)}/></label>
              <fieldset className={s.attendance}>
                <legend>Presenças de alunos matriculados</legend>
                {enrollments.filter(liveEnrollment).length===0&&<p>Nenhum aluno ativo. A chamada poderá ser registrada sem participantes.</p>}
                {enrollments.filter(liveEnrollment).map(e=>{
                  const pId=str(e.personId);
                  return <label className={s.checkbox} key={str(e.id)}>
                    <input type="checkbox" checked={attendance[pId]===true}
                      onChange={ev=>setAttendance(prev=>({...prev,[pId]:ev.target.checked}))}/>
                    <span>Aluno {pId.slice(0,8)}…</span>
                  </label>;
                })}
              </fieldset>
              <p className={s.help}>Não marcados serão registrados como ausentes. Não gera certificado em PDF.</p>
              <button type="submit" disabled={busy}>Registrar frequência</button>
            </form>
          </div>
        </div>
      </>}
    </div>}
    <p className={s.foot}>Ensino/EBD integrado ao contrato do backend. Nenhum curso real, certificado PDF ou comunicação é gerado sem autorização.</p>
  </section>;
}
