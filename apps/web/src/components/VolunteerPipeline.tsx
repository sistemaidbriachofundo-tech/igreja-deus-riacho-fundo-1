"use client";

import { useActionConfirmation } from "./ui/ActionConfirmation";

import { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../lib/api";
import { dasError, readDasRows, type DasRecord } from "../lib/das-operations";
import styles from "./care-boards.module.css";

type Props={ministries:DasRecord[];token:string;refresh:()=>void};
const txt=(x:unknown)=>typeof x==="string"?x.trim():"";
const journey=["INTERESSE","AVALIACAO","APROVACAO","EQUIPE","DISPONIBILIDADE","ESCALA"] as const;
const titles:Record<typeof journey[number],string>={
  INTERESSE:"Interesse recebido",AVALIACAO:"Avaliação",APROVACAO:"Aprovação",
  EQUIPE:"Integração à equipe",DISPONIBILIDADE:"Disponibilidade",ESCALA:"Escala",
};
const next=(stage:string)=>{
  const at=journey.findIndex(item=>item===stage);
  return at>=0&&at<journey.length-1?journey[at+1]:null;
};
export function VolunteerPipeline({ministries,token,refresh}:Props){
  const { confirm, confirmation } = useActionConfirmation();
  const [ministryId,setMinistryId]=useState("");
  const [interests,setInterests]=useState<DasRecord[]>([]);
  const [state,setState]=useState<"idle"|"loading"|"ready"|"error">("idle");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [personIds,setPersonIds]=useState<Record<string,string>>({});
  const [reload,setReload]=useState(0);

  useEffect(()=>{
    if(!ministryId){setInterests([]);setState("idle");return;}
    let cancelled=false;
    setState("loading");
    void apiGet<unknown>("/volunteer-interests?ministryId="+encodeURIComponent(ministryId),token)
      .then(body=>{const data=readDasRows(body,"interests");
        if(!cancelled){setInterests(data);setState("ready");}})
      .catch(()=>{if(!cancelled){setInterests([]);setState("error");}});
    return()=>{cancelled=true;};
  },[ministryId,token,reload]);

  async function change(interest:DasRecord,action:"advance"|"reject"){
    const id=txt(interest.id),stage=txt(interest.stage);
    if(!id||busy)return;
    const target=next(stage);
    if(action==="advance"&&!target)return;
    if (action === "reject" && !(await confirm({
      title: "Recusar interesse de voluntariado?",
      subject: txt(interest.displayName) || undefined,
      description: "O interesse será encerrado e deixará de seguir para as próximas etapas de avaliação.",
      action: "Recusar interesse",
      cancel: "Manter em avaliação",
      tone: "danger",
    }))) return;
    setBusy(true);setMessage("");
    try{
      const body=action==="reject"?{status:"REJECTED"}:{
        stage:target,...(txt(personIds[id])?{personId:txt(personIds[id])}:{})
      };
      await apiPatch("/volunteer-interests/"+encodeURIComponent(id),token,body);
      setMessage(action === "reject" ? "Interesse recusado." : "Etapa atualizada.");
      setReload(value=>value+1);refresh();
    }catch(error){setMessage(dasError(error));}
    finally{setBusy(false);}
  }

  return <section className={styles.board} aria-labelledby="interests-heading">
    {confirmation}
    <div className={styles.intro}><span>RF-012/015 · SERVIÇO VOLUNTÁRIO</span>
      <h2 id="interests-heading">Do interesse até a escala</h2>
      <p>A integração de voluntários exige avaliação humana, vínculo autorizado e disponibilidade. Esta etapa não envia mensagens automáticas.</p></div>
    <label className={styles.groupSelect}>Ministério<select value={ministryId}
      onChange={e=>{setMinistryId(e.target.value);setMessage("");}}>
      <option value="">Selecione um ministério</option>
      {ministries.map((m,i)=><option key={txt(m.id)||i} value={txt(m.id)}>{txt(m.name)||"Ministério"}</option>)}
    </select></label>
    {message&&<p role="status" className={styles.notice}>{message}</p>}
    {state==="loading"&&<p role="status" className={styles.empty}>Carregando interessados autorizados…</p>}
    {state==="error"&&<p role="alert" className={styles.notice}>Não foi possível consultar os interesses para este ministério. Verifique o acesso do seu perfil.</p>}
    {state==="ready"&&<div className={styles.stack}>
      {interests.length===0&&<p className={styles.empty}>Nenhum interesse recebido neste ministério.</p>}
      {interests.map((interest,i)=>{
        const id=txt(interest.id),stage=txt(interest.stage),status=txt(interest.status),step=next(stage);
        const open=status==="OPEN";
        return <article className={styles.item} key={id||i}>
          <div className={styles.itemHead}>
            <div><strong>{txt(interest.displayName)||"Manifestação de interesse"}</strong>
              <small>{titles[stage as keyof typeof titles]||"Etapa não identificada"} · {status||"sem estado"}</small></div>
          </div>
          {open&&id&&<div className={styles.details}>
            {step&&<label>ID da pessoa fictícia, caso seja necessário vinculá-la
              <input value={personIds[id]||""} onChange={e=>setPersonIds(prev=>({...prev,[id]:e.target.value}))}
                placeholder="Somente registro autorizado na base de testes" maxLength={100}/></label>}
            <div className={styles.task}>
              <span>O servidor verificará as permissões antes de alterar a etapa.</span>
              <div className={styles.task}>
                {step&&<button type="button" disabled={busy} onClick={()=>void change(interest,"advance")}>
                  Avançar para {titles[step]}
                </button>}
                <button type="button" disabled={busy} onClick={()=>void change(interest,"reject")}>Rejeitar interesse</button>
              </div>
            </div>
          </div>}
        </article>;
      })}
    </div>}
  </section>;
}
