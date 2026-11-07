"use client";

import { useState, type FormEvent } from "react";
import { apiPost } from "../lib/api";
import { dasError, formatChurchDate, type DasRecord } from "../lib/das-operations";
import styles from "./roster-board.module.css";

type Props={rows:DasRecord[];token:string;personId:string;roles:readonly string[];refresh:()=>void};

const record=(v:unknown):DasRecord|null=>typeof v==="object"&&v!==null&&!Array.isArray(v)?v as DasRecord:null;
const id=(v:unknown)=>typeof v==="string"&&v.length>0?v:null;
const records=(v:unknown):DasRecord[]=>Array.isArray(v)?v.map(record).filter((x):x is DasRecord=>x!==null):[];
const text=(v:unknown,fallback:string)=>typeof v==="string"&&v.trim()?v.trim():fallback;

export function RosterBoard({rows,token,personId,roles,refresh}:Props){
  const [active,setActive]=useState<string|null>(null);
  const [roleLabel,setRoleLabel]=useState("");
  const [requiresCouple,setRequiresCouple]=useState(false);
  const [slotId,setSlotId]=useState("");
  const [volunteer,setVolunteer]=useState("");
  const [partner,setPartner]=useState("");
  const [replacement,setReplacement]=useState("");
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  const leader=roles.includes("LIDER_MINISTERIO")||roles.includes("PASTOR")||roles.includes("SECRETARIA");

  async function execute(path:string,payload?:unknown){
    if(saving)return;
    setSaving(true);setNotice("");
    try{await apiPost(path,token,payload);
      setNotice("Alteração registrada na API de homologação. Estado recarregado.");
      refresh();
    }catch(err){setNotice(dasError(err));}
    finally{setSaving(false);}
  }
  function addSlot(e:FormEvent<HTMLFormElement>,rosterId:string){
    e.preventDefault();
    if(!leader||roleLabel.trim().length<2)return;
    void execute("/rosters/"+encodeURIComponent(rosterId)+"/slots",{
      roleLabel:roleLabel.trim(),requiresCouple,
    }).then(()=>{setRoleLabel("");setRequiresCouple(false);});
  }
  function assign(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!leader||!slotId||!volunteer.trim())return;
    void execute("/slots/"+encodeURIComponent(slotId)+"/assignments",{
      personId:volunteer.trim(),...(partner.trim()?{partnerPersonId:partner.trim()}:{})
    }).then(()=>{setVolunteer("");setPartner("");});
  }
  return <section className={styles.wrap} aria-labelledby="rosters-heading">
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}>RF-013 a RF-015 · JORNADA DE ESCALAS</span>
        <h2 id="rosters-heading">Funções e confirmações</h2>
        <p>Consulte escalas da API, abra funções e registre decisões no servidor. Somente dados de homologação.</p>
      </div>
    </div>
    {notice&&<div role="status" className={styles.notice}>{notice}</div>}
    {rows.length===0?<p className={styles.empty}>Ainda não existem escalas na base de testes.</p>:
      <div className={styles.rosters}>
        {rows.map((row,index)=>{
          const rosterId=id(row.id);
          const expanded=Boolean(rosterId&&active===rosterId);
          const slots=records(row.slots);
          return <article className={styles.roster} key={rosterId??index}>
            <button type="button" className={styles.toggle}
              onClick={()=>setActive(expanded?null:rosterId)}
              disabled={!rosterId}
              aria-expanded={expanded}
              aria-controls={rosterId?"roster-"+rosterId:undefined}>
              <div><strong>{text(row.title,"Escala sem título")}</strong><span>{formatChurchDate(row.serviceAt)}</span></div>
              <span className={styles.count}>{slots.length} {slots.length===1?"função":"funções"} {expanded?"−":"+"}</span>
            </button>
            {expanded&&rosterId&&<div className={styles.details} id={"roster-"+rosterId}>
              {slots.length===0?<p className={styles.empty}>Nenhuma função cadastrada nesta escala.</p>:
                slots.map((slot,index)=>{
                  const sId=id(slot.id),assignments=records(slot.assignments);
                  return <section key={sId??index} className={styles.slot}>
                    <div className={styles.slotHeader}><div>
                      <strong>{text(slot.roleLabel,"Função")}</strong>
                      {slot.requiresCouple===true&&<small>Exige casal segundo regra configurada</small>}
                    </div><span>{assignments.length} {assignments.length===1?"pessoa designada":"pessoas designadas"}</span></div>
                    {assignments.map((a,index)=>{
                      const aId=id(a.id);
                      const owns=id(a.personId)===personId;
                      const canRespond=aId&&(owns||leader);
                      const pending=typeof a.status==="string"&&a.status==="PENDING";
                      return <div key={aId??index} className={styles.assignment}>
                        <span className={styles.assignmentTitle}>Pessoa designada: <strong>{text(a.personId,"ID indisponível")}</strong>
                          <small>{text(a.status,"Estado não informado")}</small>
                        </span>
                        {pending&&canRespond&&<div className={styles.actions}>
                          <button type="button" disabled={saving} onClick={()=>void execute("/assignments/"+encodeURIComponent(aId)+"/confirm")}>Confirmar</button>
                          <button type="button" disabled={saving} onClick={()=>void execute("/assignments/"+encodeURIComponent(aId)+"/decline")}>Recusar</button>
                        </div>}
                        {leader&&aId&&a.status!=="SUBSTITUTED"&&<form className={styles.replace} onSubmit={e=>{e.preventDefault();if(replacement.trim())void execute("/assignments/"+encodeURIComponent(aId)+"/substitute",{personId:replacement.trim()}).then(()=>setReplacement(""));}}>
                          <label><span>Substituir por ID de pessoa fictícia</span><input value={replacement} onChange={e=>setReplacement(e.target.value)} placeholder="ID da pessoa autorizada" required/></label>
                          <button type="submit" disabled={saving||!replacement.trim()}>Substituir</button>
                        </form>}
                      </div>;
                    })}
                    {leader&&sId&&<button className={styles.pick} type="button" onClick={()=>{setSlotId(sId);setVolunteer("");setPartner("");}}>Designar voluntário nesta função</button>}
                  </section>;
                })}
              {leader&&<form className={styles.addSlot} onSubmit={e=>addSlot(e,rosterId)}>
                <h3>Nova função nesta escala</h3>
                <label><span>Nome da função</span><input required value={roleLabel} onChange={e=>setRoleLabel(e.target.value)} placeholder="Recepção — porta principal"/></label>
                <label className={styles.check}><input type="checkbox" checked={requiresCouple} onChange={e=>setRequiresCouple(e.target.checked)}/><span>Exige casal</span></label>
                <button type="submit" disabled={saving||roleLabel.trim().length<2}>Adicionar função</button>
              </form>}
            </div>}
          </article>;
        })}
      </div>}
    {leader&&slotId&&<form className={styles.assignPanel} onSubmit={assign}>
      <h3>Designar pessoa à função selecionada</h3>
      <p>O backend verifica disponibilidade, conflitos e regras de casal. Use exclusivamente IDs de cadastro sintético.</p>
      <div className={styles.assignGrid}>
        <label><span>ID da pessoa</span><input required value={volunteer} onChange={e=>setVolunteer(e.target.value)} placeholder="ID do cadastro fictício"/></label>
        <label><span>ID do par (se necessário)</span><input value={partner} onChange={e=>setPartner(e.target.value)} placeholder="Opcional"/></label>
      </div>
      <button type="submit" disabled={saving||!volunteer.trim()}>Validar e designar na API</button>
      <button type="button" className={styles.cancel} onClick={()=>setSlotId("")}>Cancelar seleção</button>
    </form>}
  </section>;
}
