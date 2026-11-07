"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiGet, apiPost } from "../lib/api";
import { dasError, formatBRL, parseAmountCents, readDasRows, type DasRecord } from "../lib/das-operations";
import { canCheckInRegistration, formatMockPrice, toRegistrationPayload, validateRegistration } from "../lib/event-registrations";
import s from "./event-registrations.module.css";

type Pane="modalities"|"lots"|"registrations"|"checkin";
type ResourceState=
  | {kind:"idle"|"loading";modalities:DasRecord[];lots:DasRecord[];registrations:DasRecord[]}
  | {kind:"error";modalities:DasRecord[];lots:DasRecord[];registrations:DasRecord[];message:string}
  | {kind:"ready";modalities:DasRecord[];lots:DasRecord[];registrations:DasRecord[]};
const empty:ResourceState={kind:"idle",modalities:[],lots:[],registrations:[]};
const keyOf=(x:unknown)=>typeof x==="string"?x.trim():"";
const nameOf=(x:unknown,alt="Sem nome")=>keyOf(x)||alt;
const quantity=(x:unknown)=>typeof x==="number"&&Number.isInteger(x)?x:null;
const codeOf=(x:string)=>encodeURIComponent(x);
const isValidSlug=(v:string)=>/^[a-z0-9][a-z0-9-]{2,79}$/.test(v);
const partyDefaults={INDIVIDUAL:[1,1],COUPLE:[2,2],FAMILY:[2,8],CUSTOM:[1,20]} as const;
const panes:{id:Pane;label:string}[]=[
  {id:"modalities",label:"Modalidades"},
  {id:"lots",label:"Lotes e valores"},
  {id:"registrations",label:"Inscrições"},
  {id:"checkin",label:"Check-in"},
];

export function EventRegistrations({events,token}:{events:DasRecord[];token:string}) {
  const [eventId,setEventId]=useState("");
  const [pane,setPane]=useState<Pane>("modalities");
  const [reload,setReload]=useState(0);
  const [data,setData]=useState<ResourceState>(empty);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [issuedCode,setIssuedCode]=useState("");

  const [modalityName,setModalityName]=useState("");
  const [modalityCode,setModalityCode]=useState("");
  const [modalityKind,setModalityKind]=useState<keyof typeof partyDefaults>("INDIVIDUAL");
  const [modalityCapacity,setModalityCapacity]=useState("");
  const [lotName,setLotName]=useState("");
  const [lotCode,setLotCode]=useState("");
  const [lotCapacity,setLotCapacity]=useState("");
  const [lotPrice,setLotPrice]=useState("0");
  const [lotModality,setLotModality]=useState("");
  const [registrationName,setRegistrationName]=useState("");
  const [registrationModality,setRegistrationModality]=useState("");
  const [registrationLot,setRegistrationLot]=useState("");
  const [partySize,setPartySize]=useState(1);
  const [minor,setMinor]=useState(false);
  const [guardian,setGuardian]=useState("");
  const [checkInCodes,setCheckInCodes]=useState<Record<string,string>>({});

  const selected=events.find(x=>x.id===eventId);
  const base="/events/"+codeOf(eventId);
  const modality=data.modalities.find(x=>x.id===registrationModality);
  const compatibleLots=data.lots.filter(x=>!keyOf(x.modalityId)||x.modalityId===registrationModality);
  const stats=useMemo(()=>({
    participants:data.registrations.reduce((total,item)=>total+(quantity(item.partySize)??0),0),
    checkedIn:data.registrations.filter(item=>item.status==="CHECKED_IN").length,
    pending:data.registrations.filter(item=>item.status==="PENDING_PAYMENT").length,
  }),[data.registrations]);

  useEffect(()=>{
    if(!eventId){setData(empty);return;}
    let cancelled=false;
    setData({kind:"loading",modalities:[],lots:[],registrations:[]});
    const prefix="/events/"+codeOf(eventId);
    void Promise.all([
      apiGet<unknown>(prefix+"/modalities",token),
      apiGet<unknown>(prefix+"/lots",token),
      apiGet<unknown>(prefix+"/registrations",token),
    ]).then(([m,l,r])=>{
      const modalities=readDasRows(m,"modalities"),lots=readDasRows(l,"lots"),registrations=readDasRows(r,"registrations");
      if(!cancelled)setData({kind:"ready",modalities,lots,registrations});
    }).catch(err=>{if(!cancelled)setData({kind:"error",modalities:[],lots:[],registrations:[],message:dasError(err)});});
    return()=>{cancelled=true;};
  },[token,eventId,reload]);

  async function perform(path:string,body?:unknown,after?:()=>void):Promise<boolean> {
    if(busy||data.kind!=="ready")return false;
    setBusy(true);setMessage("");setIssuedCode("");
    try {
      const response=await apiPost<unknown>(path,token,body);
      after?.();
      const wrapper=response!==null&&typeof response==="object"&&!Array.isArray(response)?response as Record<string,unknown>:null;
      const registration=wrapper?.registration&&typeof wrapper.registration==="object"
        ? wrapper.registration as Record<string,unknown>:wrapper;
      if(path.endsWith("/registrations")&&typeof registration?.checkInCode==="string"){
        setIssuedCode(registration.checkInCode);
      }
      setMessage("Operação concluída na base sintética de homologação. Dados atualizados.");
      setReload(v=>v+1);
      return true;
    } catch(err){setMessage(dasError(err));return false;}
    finally{setBusy(false);}
  }

  function createModality(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!isValidSlug(modalityCode)||modalityName.trim().length<3){setMessage("Informe nome e código válido com letras minúsculas.");return;}
    const capacity=modalityCapacity.trim()?Number(modalityCapacity):null;
    if(capacity!==null&&(!Number.isSafeInteger(capacity)||capacity<1)){setMessage("A capacidade deve ser um número inteiro positivo.");return;}
    const [minPartySize,maxPartySize]=partyDefaults[modalityKind];
    void perform(base+"/modalities",{
      code:modalityCode,name:modalityName.trim(),kind:modalityKind,minPartySize,maxPartySize,
      ...(capacity!==null?{capacity}:{})
    },()=>{setModalityName("");setModalityCode("");setModalityCapacity("");});
  }
  function createLot(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!isValidSlug(lotCode)||lotName.trim().length<3){setMessage("Informe código e nome do lote.");return;}
    const price=lotPrice.trim()==="0"||lotPrice.trim()==="0,00"?0:parseAmountCents(lotPrice);
    if(price===null){setMessage("O valor deve ser zero ou um preço válido com até duas casas decimais.");return;}
    const capacity=lotCapacity.trim()?Number(lotCapacity):null;
    if(capacity!==null&&(!Number.isSafeInteger(capacity)||capacity<1)){setMessage("Capacidade inválida.");return;}
    void perform(base+"/lots",{
      name:lotName.trim(),code:lotCode,priceCents:price,status:"DRAFT",currency:"BRL",
      ...(lotModality?{modalityId:lotModality}:{}),...(capacity!==null?{capacity}:{}),
    },()=>{setLotName("");setLotCode("");setLotCapacity("");setLotPrice("0");});
  }
  function createRegistration(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(data.kind!=="ready")return;
    const input={displayName:registrationName,modalityId:registrationModality,
      lotId:registrationLot,partySize,isMinor:minor,guardianDisplayName:guardian};
    const error=validateRegistration(input,data.modalities,data.lots);
    if(error){setMessage(error);return;}
    void perform(base+"/registrations",toRegistrationPayload(input),()=>{
      setRegistrationName("");setGuardian("");setMinor(false);
    });
  }
  function checkIn(row:DasRecord){
    const id=keyOf(row.id),provided=(checkInCodes[id]??"").trim(),actual=keyOf(row.checkInCode);
    if(!id||!canCheckInRegistration(row))return;
    if(!actual||!provided||provided!==actual){setMessage("O código digitado não corresponde à inscrição. Confira o comprovante de teste.");return;}
    if(!window.confirm("Confirmar presença desta inscrição fictícia?"))return;
    void perform("/registrations/"+codeOf(id)+"/check-in",{checkInCode:provided},
      ()=>setCheckInCodes(prev=>({...prev,[id]:""})));
  }
  function cancel(row:DasRecord){
    const id=keyOf(row.id);
    if(!id||row.status==="CANCELLED"||row.status==="CHECKED_IN")return;
    if(!window.confirm("Cancelar a inscrição fictícia? Esta operação será auditada na HML."))return;
    void perform("/registrations/"+codeOf(id)+"/cancel");
  }

  return <section className={s.workspace} aria-labelledby="registration-workspace-heading">
    <div className={s.heading}>
      <div><small>RF-020 A RF-022 • EVENTOS E INSCRIÇÕES</small>
        <h2 id="registration-workspace-heading">Operação do evento</h2>
        <p>Modalidades, vagas, lotes, inscrições e confirmação de presença em um único fluxo. Apenas dados fictícios.</p>
      </div><span className={s.mock}>Pagamentos: MOCK · sem transação real</span>
    </div>
    <label className={s.eventSelect}>Escolha o evento
      <select value={eventId} onChange={e=>{setEventId(e.target.value);setMessage("");setIssuedCode("");setPane("modalities");}}>
        <option value="">Selecione um evento existente na HML</option>
        {events.filter(e=>keyOf(e.id)).map(x=><option key={keyOf(x.id)} value={keyOf(x.id)}>
          {nameOf(x.name)} · {nameOf(x.status,"DRAFT")}
        </option>)}
      </select>
    </label>
    {!eventId?<div className={s.empty}><strong>Escolha um evento para começar</strong>
      <p>Primeiro crie um evento de teste no módulo Eventos, se necessário.</p></div>:
    data.kind==="loading"?<div className={s.empty} role="status">Carregando cadastros e inscrições autorizadas…</div>:
    data.kind==="error"?<div role="alert" className={s.error}>
      <strong>Não foi possível conectar esta jornada à API.</strong>
      <p>{data.message} O contrato do Cursor pode ainda não estar publicado na HML. Nenhuma informação foi inventada.</p>
      <button type="button" onClick={()=>setReload(n=>n+1)}>Tentar novamente</button>
    </div>:data.kind==="ready"&&<>
      <div className={s.summary} aria-label="Resumo da operação de testes">
        <div><strong>{data.modalities.length}</strong><span>Modalidades</span></div>
        <div><strong>{data.lots.length}</strong><span>Lotes</span></div>
        <div><strong>{data.registrations.length}</strong><span>Inscrições</span></div>
        <div><strong>{stats.participants}</strong><span>Participantes</span></div>
        <div><strong>{stats.checkedIn}</strong><span>Check-ins</span></div>
      </div>
      <nav className={s.tabs} aria-label="Etapas de operação do evento">
        {panes.map(t=><button key={t.id} type="button" className={pane===t.id?s.activeTab:s.tab}
          aria-current={pane===t.id?"page":undefined}
          onClick={()=>{setPane(t.id);setMessage("");setIssuedCode("");}}>{t.label}</button>)}
      </nav>
      {message&&<p className={s.notice} role="status">{message}</p>}
      {issuedCode&&<div className={s.receipt} role="status">
        <strong>Comprovante da inscrição de teste</strong>
        <p>Guarde o código de check-in para validar a presença no fluxo de homologação.</p>
        <code>{issuedCode}</code>
      </div>}
      {pane==="modalities"&&<div className={s.columns}>
        <div className={s.records}>
          <h3>Modalidades cadastradas</h3>
          {data.modalities.length===0&&<p>Não há modalidades neste evento.</p>}
          {data.modalities.map((m,i)=><article className={s.item} key={keyOf(m.id)||i}>
            <strong>{nameOf(m.name)}</strong>
            <small>{nameOf(m.kind,"INDIVIDUAL")} · {quantity(m.minPartySize)??1}–{quantity(m.maxPartySize)??1} pessoas</small>
            <span>{quantity(m.remaining)===null?"Capacidade não limitada":"Vagas restantes: "+m.remaining}</span>
          </article>)}
        </div>
        <form className={s.form} onSubmit={createModality}>
          <h3>Nova modalidade fictícia</h3>
          <label>Nome<input required value={modalityName} maxLength={100} onChange={e=>setModalityName(e.target.value)} placeholder="Inscrição familiar — teste"/></label>
          <label>Código<input required value={modalityCode} maxLength={80} onChange={e=>setModalityCode(e.target.value.toLowerCase())} placeholder="familia-teste" pattern="[a-z0-9][a-z0-9-]{2,79}"/></label>
          <label>Formato<select value={modalityKind} onChange={e=>setModalityKind(e.target.value as keyof typeof partyDefaults)}>
            <option value="INDIVIDUAL">Individual (1)</option>
            <option value="COUPLE">Casal (2)</option>
            <option value="FAMILY">Família (2–8)</option>
            <option value="CUSTOM">Personalizado (1–20)</option>
          </select></label>
          <label>Capacidade (opcional)<input type="number" min={1} step={1} value={modalityCapacity} onChange={e=>setModalityCapacity(e.target.value)}/></label>
          <button type="submit" disabled={busy}>Criar modalidade na HML</button>
        </form>
      </div>}
      {pane==="lots"&&<div className={s.columns}>
        <div className={s.records}><h3>Lotes configurados</h3>
          {data.lots.length===0&&<p>Nenhum lote nesta base.</p>}
          {data.lots.map((lot,i)=><article key={keyOf(lot.id)||i} className={s.item}>
            <strong>{nameOf(lot.name)}</strong>
            <small>{formatMockPrice(lot.priceCents)} · {nameOf(lot.status)}</small>
            <span>{quantity(lot.remaining)===null?"Sem limite de vagas":"Restantes: "+lot.remaining}</span>
          </article>)}
        </div>
        <form className={s.form} onSubmit={createLot}>
          <h3>Criar lote de simulação</h3>
          <label>Nome do lote<input required value={lotName} maxLength={100} onChange={e=>setLotName(e.target.value)} placeholder="Lote 1 — teste"/></label>
          <label>Código<input required value={lotCode} maxLength={80} onChange={e=>setLotCode(e.target.value.toLowerCase())} placeholder="lote-1-teste" pattern="[a-z0-9][a-z0-9-]{2,79}"/></label>
          <label>Modalidade<select value={lotModality} onChange={e=>setLotModality(e.target.value)}>
            <option value="">Qualquer modalidade</option>
            {data.modalities.map(m=><option key={keyOf(m.id)} value={keyOf(m.id)}>{nameOf(m.name)}</option>)}
          </select></label>
          <label>Capacidade (opcional)<input type="number" min={1} step={1} value={lotCapacity} onChange={e=>setLotCapacity(e.target.value)}/></label>
          <label>Preço simulado em R$<input type="text" inputMode="decimal" required value={lotPrice} maxLength={18} onChange={e=>setLotPrice(e.target.value)} placeholder="0,00"/></label>
          <p className={s.hint}>Criado sempre como rascunho, sem gateway de pagamento e sem cobrança.</p>
          <button type="submit" disabled={busy}>Criar lote DRAFT</button>
        </form>
      </div>}
      {pane==="registrations"&&<div className={s.columns}>
        <div className={s.records}><h3>Inscrições da HML</h3>
          {data.registrations.length===0&&<p>Não há inscrições registradas.</p>}
          {data.registrations.map((reg,i)=><article key={keyOf(reg.id)||i} className={s.item}>
            <strong>{nameOf(reg.displayName,"Inscrição de teste")}</strong>
            <small>{quantity(reg.partySize)??1} pessoa(s) · {nameOf(reg.status)}</small>
            <span>Pagamento: {nameOf(reg.paymentStatus,"não informado")}</span>
          </article>)}
        </div>
        <form className={s.form} onSubmit={createRegistration}>
          <h3>Nova inscrição sintética</h3>
          <label>Identificador fictício<input required maxLength={120} value={registrationName}
            onChange={e=>setRegistrationName(e.target.value)} placeholder="TESTE PARTICIPANTE 01"/></label>
          <label>Modalidade<select required value={registrationModality} onChange={e=>{
            const selected=data.modalities.find(m=>m.id===e.target.value);
            setRegistrationModality(e.target.value);setRegistrationLot("");
            setPartySize(quantity(selected?.minPartySize)??1);
          }}>
            <option value="">Selecione</option>
            {data.modalities.map(m=><option key={keyOf(m.id)} value={keyOf(m.id)}>{nameOf(m.name)}</option>)}
          </select></label>
          <label>Lote (opcional)<select value={registrationLot} onChange={e=>setRegistrationLot(e.target.value)}>
            <option value="">Sem lote</option>
            {compatibleLots.filter(l=>l.status!=="CLOSED").map(l=><option key={keyOf(l.id)} value={keyOf(l.id)}>
              {nameOf(l.name)} · {formatMockPrice(l.priceCents)}
            </option>)}
          </select></label>
          <label>Pessoas na inscrição<input type="number" min={quantity(modality?.minPartySize)??1}
            max={quantity(modality?.maxPartySize)??20} step={1} value={partySize}
            onChange={e=>setPartySize(Number(e.target.value))}/></label>
          <label className={s.checkbox}><input type="checkbox" checked={minor} onChange={e=>{setMinor(e.target.checked);setGuardian("");}}/>
            <span>Esta inscrição de teste representa um menor</span></label>
          {minor&&<label>Responsável fictício<input required value={guardian} maxLength={120}
            onChange={e=>setGuardian(e.target.value)} placeholder="TESTE RESPONSÁVEL 01"/></label>}
          <p className={s.hint}>Dados reais, documentos, e-mails e telefones são proibidos na HML. Valores pagos não são confirmados por esta tela.</p>
          <button type="submit" disabled={busy||!registrationModality}>Registrar inscrição de teste</button>
        </form>
      </div>}
      {pane==="checkin"&&<div className={s.checkin}>
        <div className={s.checkinHead}>
          <h3>Confirmação de presença</h3>
          <p>{stats.pending} inscrições aguardando confirmação de pagamento simulado. A confirmação de pagamento é feita somente por webhook assinado no backend, não por esta tela.</p>
        </div>
        {data.registrations.length===0&&<p className={s.hint}>Nenhuma inscrição disponível para check-in.</p>}
        {data.registrations.map((reg,i)=>{
          const id=keyOf(reg.id),eligible=canCheckInRegistration(reg),finished=reg.status==="CHECKED_IN",cancelled=reg.status==="CANCELLED";
          return <article className={s.checkinRow} key={id||i}>
            <div><strong>{nameOf(reg.displayName,"Inscrição")}</strong>
              <small>{nameOf(reg.status)} · pagamento {nameOf(reg.paymentStatus)} · {quantity(reg.partySize)??1} pessoa(s)</small></div>
            {finished?<span className={s.completed}>Presença confirmada</span>:
            cancelled?<span className={s.neutral}>Inscrição cancelada</span>:
            eligible?<div className={s.checkinAction}>
              <label>Código do comprovante<input type="text" autoComplete="off" value={checkInCodes[id]??""}
                onChange={e=>setCheckInCodes(prev=>({...prev,[id]:e.target.value}))} placeholder="Digite o código do participante"/></label>
              <button type="button" disabled={busy||!keyOf(checkInCodes[id])} onClick={()=>checkIn(reg)}>Confirmar</button>
            </div>:<span className={s.pending}>Aguardando pagamento simulado</span>}
            {!finished&&!cancelled&&<button type="button" className={s.cancel} disabled={busy||!id}
              onClick={()=>cancel(reg)}>Cancelar inscrição de teste</button>}
          </article>;
        })}
      </div>}
      <button className={s.refresh} type="button" onClick={()=>setReload(n=>n+1)} disabled={busy}>Atualizar dados do evento</button>
    </>}
    {selected&&<p className={s.footnote}>Evento selecionado: {nameOf(selected.name)}. As operações estão limitadas à base de homologação e à autorização fornecida pelo backend.</p>}
  </section>;
}
