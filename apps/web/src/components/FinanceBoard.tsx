"use client";

import { useActionConfirmation } from "./ui/ActionConfirmation";
import { useFeedback } from "./ui/FeedbackProvider";

import { useEffect, useState, type FormEvent } from "react";
import { nextDualApprovalStage } from "@idbrf/shared";
import { apiGet, apiPost } from "../lib/api";
import { dasError, formatBRL, parseAmountCents, readDasRows, type DasRecord } from "../lib/das-operations";
import styles from "./finance-board.module.css";

type Props = { tab:string; rows:DasRecord[]; token:string; refresh:()=>void };
const str=(x:unknown)=>typeof x==="string"?x.trim():"";
const id=(x:unknown)=>typeof x==="string"&&x.trim()?x.trim():null;
const cents=(x:unknown)=>typeof x==="number"&&Number.isInteger(x)&&Number.isFinite(x)?formatBRL(x):"Valor não informado";
const statusLabel=(status:string)=>status==="DRAFT"?"Rascunho":status==="PENDING_APPROVAL"?"Aguardando duas pessoas":status==="APPROVED"?"Aprovado por duas pessoas":status==="REJECTED"?"Recusado":status==="REVERSED"?"Estornado":status==="OPEN"?"Aberta":status==="CLOSED"?"Fechada":status||"Estado não informado";

export function financeApproval(actorUserId:string|null, entry:DasRecord):{text:string;canApprove:boolean}{
  const status=str(entry.status);
  if(status!=="PENDING_APPROVAL")return {text:statusLabel(status),canApprove:false};
  const created=str(entry.createdByUserId);
  const first=str(entry.firstApprovedByUserId);
  if(!actorUserId)return {text:"Aguardando identificar quem aprova.",canApprove:false};
  const stage=nextDualApprovalStage({actorUserId,createdByUserId:created,firstApprovedByUserId:first||null});
  if(!stage.ok)return {text:first?"A primeira aprovação já é sua. Outra pessoa precisa concluir.":"Quem lançou não aprova a própria peça.",canApprove:false};
  return {text:stage.stage==="FIRST"?"Você pode registrar a primeira aprovação.":"Você pode registrar a segunda aprovação.",canApprove:true};
}

export function FinanceBoard({tab,rows,token,refresh}:Props){
  const { showFeedback } = useFeedback();
  const { confirm, confirmation } = useActionConfirmation();
  const [accounts,setAccounts]=useState<DasRecord[]>([]);
  const [accountsState,setAccountsState]=useState<"loading"|"ready"|"error">("loading");
  const [description,setDescription]=useState("");
  const [entryDate,setEntryDate]=useState("");
  const [amount,setAmount]=useState("");
  const [debit,setDebit]=useState("");
  const [credit,setCredit]=useState("");
  const [title,setTitle]=useState("");
  const [start,setStart]=useState("");
  const [end,setEnd]=useState("");
  const [busy,setBusy]=useState(false);
  const [rejectionReasons,setRejectionReasons]=useState<Record<string,string>>({});
  const [actorId,setActorId]=useState<string|null>(null);

  useEffect(()=>{
    let cancelled=false;
    void apiGet<{userId?:string}>("/auth/me",token)
      .then(me=>{if(!cancelled && typeof me.userId==="string")setActorId(me.userId);})
      .catch(()=>{if(!cancelled)setActorId(null);});
    return()=>{cancelled=true;};
  },[token]);

  useEffect(()=>{
    if(tab!=="entries")return;
    let cancelled=false;
    setAccountsState("loading");
    void apiGet<unknown>("/ledger/accounts",token)
      .then(payload=>{const data=readDasRows(payload,"accounts");if(!cancelled){setAccounts(data);setAccountsState("ready");}})
      .catch(()=>{if(!cancelled){setAccounts([]);setAccountsState("error");}});
    return()=>{cancelled=true;};
  },[token,tab]);

  async function action(path:string,body?:unknown):Promise<boolean>{
    if(busy)return false;
    setBusy(true);
    try{
      await apiPost(path,token,body);
      refresh();
      showFeedback({ tone: "success", title: "Alteração registrada", message: "Consulte o histórico para acompanhar o lançamento." });
      return true;
    }catch(err){showFeedback({ tone: "error", title: "Operação não concluída", message: dasError(err) });return false;}
    finally{setBusy(false);}
  }
  function createEntry(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const amountCents=parseAmountCents(amount);
    if(!amountCents||!debit||!credit||debit===credit||!entryDate||description.trim().length<4){
      showFeedback({ tone: "error", title: "Confira o lançamento", message: "Informe descrição, data, contas diferentes e valor positivo com até duas casas decimais." });return;
    }
    void action("/ledger/entries",{
      entryDate,description:description.trim(),
      lines:[{accountId:debit,side:"DEBIT",amountCents},{accountId:credit,side:"CREDIT",amountCents}]
    }).then(ok=>{if(ok){setDescription("");setAmount("");setDebit("");setCredit("");}});
  }
  function createReconciliation(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!title.trim()||!start||!end||start>end){showFeedback({ tone: "error", title: "Confira a competência", message: "Informe um título e um intervalo de datas válido." });return;}
    void action("/ledger/reconciliations",{title:title.trim(),periodStart:start,periodEnd:end})
      .then(ok=>{if(ok){setTitle("");setStart("");setEnd("");}});
  }
  async function transition(kind: "entries" | "reconciliations", recordId: string, operation: "submit" | "approve" | "close" | "reverse") {
    if (busy || !recordId) return;
    const record = rows.find((row) => id(row.id) === recordId);
    const subject = str(record?.description) || str(record?.title) || undefined;
    const details = {
      approve: {
        title: "Registrar aprovação?",
        description: "Sua aprovação será registrada neste item.",
        action: "Registrar aprovação",
      },
      close: {
        title: "Fechar período?",
        description: "A conciliação deste período será marcada como fechada.",
        action: "Fechar período",
        tone: "danger",
      },
      reverse: {
        title: "Solicitar estorno?",
        description: "Será registrada uma solicitação de estorno para este lançamento.",
        action: "Solicitar estorno",
        tone: "danger",
      },
    } as const;
    if (operation !== "submit" && !(await confirm({ ...details[operation], subject }))) return;
    void action("/ledger/" + kind + "/" + encodeURIComponent(recordId) + "/" + operation);
  }

  return <section className={styles.board} aria-labelledby="finance-heading">
    {confirmation}
      <header className={styles.header}>
      <span>Tesouraria · homologação</span>
      <h2 id="finance-heading">Lançamentos e conciliação</h2>
      <p>Os valores vêm da API. Quem lança não aprova a própria peça, e a segunda aprovação é de outra pessoa. Nada aqui movimenta Pix ou banco.</p>
    </header>
    {tab==="accounts"&&<p className={styles.info}>As contas são mantidas na API. O cadastro de novas contas está disponível no formulário desta página. Nenhuma conta é criada automaticamente.</p>}
    {tab==="imports"&&<p className={styles.warning}>
      O contrato da API identifica a importação como <strong>stub</strong>, sem parser OFX real. Esta interface não importa ou concilia extratos bancários automaticamente.
      O upload definitivo dependerá de implementação validada, proveniência, prevenção de duplicidades e revisão humana.
    </p>}
    {tab==="entries"&&<>
      <form className={styles.form} onSubmit={createEntry}>
        <h3>Novo lançamento de teste</h3>
        <p>Escolha duas contas distintas. Débito e crédito terão o mesmo valor em centavos; a API valida a consistência.</p>
        {accountsState==="error"&&<p role="alert" className={styles.warning}>Não foi possível carregar o plano de contas. Não serão usados dados inventados.</p>}
        <label>Data do lançamento<input type="date" required value={entryDate} onChange={e=>setEntryDate(e.target.value)}/></label>
        <label>Valor em reais<input type="text" inputMode="decimal" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="125,50" maxLength={22}/></label>
        <label className={styles.wide}>Descrição<input required value={description} onChange={e=>setDescription(e.target.value)} maxLength={180}/></label>
        <label>Conta de débito<select value={debit} onChange={e=>setDebit(e.target.value)} required>
          <option value="">Selecione</option>{accounts.map((a,i)=><option key={id(a.id)||i} value={id(a.id)||""}>
            {str(a.code)} · {str(a.name)||"Conta"}</option>)}
        </select></label>
        <label>Conta de crédito<select value={credit} onChange={e=>setCredit(e.target.value)} required>
          <option value="">Selecione</option>{accounts.map((a,i)=><option key={id(a.id)||i} value={id(a.id)||""}>
            {str(a.code)} · {str(a.name)||"Conta"}</option>)}
        </select></label>
        <div className={styles.preview}><span>Partidas equilibradas</span>
          <strong>{parseAmountCents(amount)?formatBRL(parseAmountCents(amount)!):"Informe um valor válido"}</strong>
          <small>Não é transferência bancária e não movimenta dinheiro real.</small>
        </div>
        <button type="submit" disabled={busy||accountsState!=="ready"||accounts.length<2}>Registrar lançamento DRAFT</button>
      </form>
      <div className={styles.operations}>
        <h3>Fluxo de lançamentos</h3>
        {rows.length===0&&<p>Sem lançamentos na HML.</p>}
        {rows.map((entry,i)=>{
          const entryId=id(entry.id),status=str(entry.status),approval=financeApproval(actorId,entry);
          const amount=entry.amountCents??entry.totalCents;
          return <article className={styles.row} key={entryId||i}>
            <div><strong>{str(entry.description)||"Lançamento sem descrição"}</strong>
              <small>{approval.text} · Valor: {cents(amount)}</small></div>
            <div className={styles.actions}>
              {entryId&&["DRAFT","REJECTED"].includes(status)&&<button disabled={busy} onClick={()=>transition("entries",entryId,"submit")}>Enviar para aprovação</button>}
              {entryId&&approval.canApprove&&<button disabled={busy} onClick={()=>transition("entries",entryId,"approve")}>Registrar aprovação</button>}
              {entryId&&status==="PENDING_APPROVAL"&&<form className={styles.rejectForm}
                onSubmit={async e=>{e.preventDefault();const reason=(rejectionReasons[entryId]??"").trim();
                  if(reason.length<6){showFeedback({ tone: "error", title: "Informe o motivo", message: "A rejeição exige um motivo com pelo menos seis caracteres." });return;}
                  if (!(await confirm({
                    title: "Rejeitar lançamento?",
                    subject: str(entry.description) || undefined,
                    description: "O lançamento voltará para revisão com o motivo informado.",
                    action: "Rejeitar lançamento",
                    cancel: "Revisar motivo",
                    tone: "danger",
                  }))) return;
                  void action("/ledger/entries/"+encodeURIComponent(entryId)+"/reject",{reason})
                    .then(ok=>{if(ok)setRejectionReasons(prev=>({...prev,[entryId]:""}));});
                }}>
                <label>Motivo da rejeição<input required minLength={6} maxLength={180}
                  value={rejectionReasons[entryId]??""}
                  onChange={e=>setRejectionReasons(prev=>({...prev,[entryId]:e.target.value}))}
                  placeholder="Explique a divergência"/></label>
                <button type="submit" disabled={busy||!(rejectionReasons[entryId]??"").trim()}>Rejeitar</button>
              </form>}

              {entryId&&status==="APPROVED"&&<button disabled={busy} onClick={()=>transition("entries",entryId,"reverse")}>Solicitar estorno</button>}
            </div>
          </article>;
        })}
      </div>
    </>}
    {tab==="reconciliations"&&<>
      <form className={styles.form} onSubmit={createReconciliation}>
        <h3>Abrir conciliação de teste</h3>
        <label className={styles.wide}>Título<input required value={title} onChange={e=>setTitle(e.target.value)} maxLength={140}/></label>
        <label>Início da competência<input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label>
        <label>Fim da competência<input type="date" min={start||undefined} required value={end} onChange={e=>setEnd(e.target.value)}/></label>
        <button type="submit" disabled={busy}>Abrir conciliação</button>
      </form>
      <div className={styles.operations}><h3>Conciliações registradas</h3>
        {rows.length===0&&<p>Sem conciliações no banco de testes.</p>}
        {rows.map((item,i)=>{
          const key=id(item.id),status=str(item.status);
          return <article key={key||i} className={styles.row}>
            <div><strong>{str(item.title)||"Conciliação"}</strong><small>{status==="CLOSED"?"Período fechado":statusLabel(status)}</small>
              <small>{str(item.periodStart)} a {str(item.periodEnd)}</small></div>
            <div className={styles.actions}>
              {key&&status==="OPEN"&&<button disabled={busy} onClick={()=>transition("reconciliations",key,"submit")}>Enviar para revisão</button>}
              {key&&status==="PENDING_APPROVAL"&&<button disabled={busy} onClick={()=>transition("reconciliations",key,"approve")}>Registrar aprovação</button>}
              {key&&status==="APPROVED"&&<button disabled={busy} onClick={()=>transition("reconciliations",key,"close")}>Fechar período</button>}
            </div>
          </article>;
        })}
      </div>
    </>}
  </section>;
}
