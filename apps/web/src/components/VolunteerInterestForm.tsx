"use client";

import { useState, type FormEvent } from "react";
import { publicApiBase } from "../lib/portal-live-data";
import s from "./volunteer-interest.module.css";

type FormState = { displayName:string; email:string; message:string };
const empty:FormState = { displayName:"",email:"",message:"" };

/**
 * Collects only purpose-limited volunteer interest with an explicitly published
 * privacy notice. No minors, medical details, prayer notes or anonymous storage.
 */
export function VolunteerInterestForm() {
  const [form,setForm]=useState(empty);
  const [consent,setConsent]=useState(false);
  const [adult,setAdult]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [received,setReceived]=useState(false);

  const base=publicApiBase(process.env.NEXT_PUBLIC_API_URL);
  const enabled=process.env.NEXT_PUBLIC_VOLUNTEER_INTAKE_ENABLED==="true" &&
    process.env.NEXT_PUBLIC_PORTAL_LIVE_ENABLED==="true";
  const policy=process.env.NEXT_PUBLIC_PRIVACY_URL?.trim() ?? "";
  const validPolicy=(()=>{try {return new URL(policy).protocol==="https:";}catch{return false;}})();
  if(!base||!enabled||!validPolicy)return null;

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!consent||!adult||busy)return;
    setBusy(true);setError("");
    try {
      const response=await fetch(base+"/public/volunteer-interests",{
        method:"POST",mode:"cors",credentials:"omit",cache:"no-store",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({
          displayName:form.displayName.trim(),email:form.email.trim(),
          message:form.message.trim()||null,ministrySlug:"atmosfera",
        }),
      });
      if(!response.ok)throw new Error("O envio não foi confirmado. Consulte a equipe pelos canais oficiais.");
      const ack:unknown=await response.json();
      const valid=typeof ack==="object"&&ack!==null&&"received" in ack&&ack.received===true;
      if(!valid)throw new Error("O recebimento não pôde ser confirmado.");
      setReceived(true);setForm(empty);setConsent(false);setAdult(false);
    } catch(err){setError(err instanceof Error?err.message:"Não foi possível enviar.");}
    finally{setBusy(false);}
  }

  return (
    <section className={s.section} aria-labelledby="volunteer-title">
      <div className={s.intro}>
        <span>ATMOSFERA / SERVIR COM PROPÓSITO</span>
        <h2 id="volunteer-title">Seu dom pode <em>fazer a diferença.</em></h2>
        <p>Se você deseja conversar sobre voluntariado, registre seu interesse. A equipe responsável analisará sua mensagem. Isto não é inscrição automática em escala.</p>
      </div>
      {received ? <div className={s.success} role="status"><strong>Interesse recebido!</strong><p>Obrigado por desejar servir. A equipe poderá entrar em contato pelos dados informados. Nenhuma vaga ou escala foi confirmada.</p></div> :
        <form onSubmit={submit} className={s.form}>
          <div className={s.pair}>
            <label>Seu nome<input type="text" required minLength={2} maxLength={120} autoComplete="name" value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})}/></label>
            <label>E-mail para contato<input type="email" required maxLength={200} autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
          </div>
          <label>Mensagem (opcional)<textarea maxLength={1000} rows={4} value={form.message} onChange={e=>setForm({...form,message:e.target.value})} placeholder="Conte brevemente em qual área gostaria de ajudar. Não envie dados sensíveis."/></label>
          <label className={s.check}><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)} required/><span>Declaro ter 18 anos ou mais.</span></label>
          <label className={s.check}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/><span>Autorizo o uso destes dados exclusivamente para contato sobre voluntariado, conforme a <a href={policy} target="_blank" rel="noopener noreferrer">política de privacidade</a>.</span></label>
          <div className={s.formBottom}><span>Seus dados não ficam salvos neste navegador. O envio será feito diretamente à API segura da igreja.</span>
            <button type="submit" disabled={busy||!consent||!adult}>{busy?"Enviando…":"Quero conversar sobre servir ↗"}</button></div>
          {error&&<p role="alert" className={s.error}>{error}</p>}
        </form>}
    </section>
  );
}
