"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost } from "../lib/api";
import { dasError, formatBRL, parseAmountCents, readDasRows, type DasRecord } from "../lib/das-operations";
import styles from "./finance-board.module.css";

type Props = { tab:string; rows:DasRecord[]; token:string; refresh:()=>void };
const str=(x:unknown)=>typeof x==="string"?x.trim():"";
const id=(x:unknown)=>typeof x==="string"&&x.trim()?x.trim():null;
const cents=(x:unknown)=>typeof x==="number"&&Number.isInteger(x)&&Number.isFinite(x)?formatBRL(x):"Valor não informado";

export function FinanceBoard({tab,rows,token,refresh}:Props){
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
  const [message,setMessage]=useState("");

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
    setBusy(true);setMessage("");
    try{
      await apiPost(path,token,body);
      refresh();
      setMessage("Operação salva no banco de testes. Consulte o histórico e as aprovações.");
      return true;
    }catch(err){setMessage(dasError(err));return false;}
    finally{setBusy(false);}
  }
  function createEntry(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const amountCents=parseAmountCents(amount);
    if(!amountCents||!debit||!credit||debit===credit||!entryDate||description.trim().length<4){
      setMessage("Informe descrição, data, contas diferentes e valor positivo com até duas casas decimais.");return;
    }
    void action("/ledger/entries",{
      entryDate,description:description.trim(),
      lines:[{accountId:debit,side:"DEBIT",amountCents},{accountId:credit,side:"CREDIT",amountCents}]
    }).then(ok=>{if(ok){setDescription("");setAmount("");setDebit("");setCredit("");}});
  }
  function createReconciliation(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!title.trim()||!start||!end||start>end){setMessage("Confira o título e o intervalo de competência.");return;}
    void action("/ledger/reconciliations",{title:title.trim(),periodStart:start,periodEnd:end})
      .then(ok=>{if(ok){setTitle("");setStart("");setEnd("");}});
  }
  function transition(kind:"entries"|"reconciliations",recordId:string,operation:string){
    if(busy||!recordId)return;
    const critical=operation==="approve"||operation==="close"||operation==="reverse";
    if(critical && !window.confirm("Esta operação altera o fluxo de aprovação na HML. Confirmar?"))return;
    void action("/ledger/"+kind+"/"+encodeURIComponent(recordId)+"/"+operation);
  }

  return <section className={styles.board} aria-labelledby="finance-heading">
    <header className={styles.header}>
      <span>RF-016 A RF-019 · TESOURARIA</span>
      <h2 id="finance-heading">Integridade contábil e rastreabilidade</h2>
      <p>Todos os valores e históricos vêm da API de testes. Lançamentos usam partidas dobradas e aprovações são controladas no servidor.</p>
    </header>
    {message&&<p role="status" className={styles.notice}>{message}</p>}
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
          const entryId=id(entry.id),status=str(entry.status);
          return <article className={styles.row} key={entryId||i}>
            <div><strong>{str(entry.description)||"Lançamento sem descrição"}</strong>
              <small>Estado: {status||"não informado"} · Valor: {cents(entry.totalCents)}</small></div>
            <div className={styles.actions}>
              {entryId&&["DRAFT","REJECTED"].includes(status)&&<button disabled={busy} onClick={()=>transition("entries",entryId,"submit")}>Enviar para aprovação</button>}
              {entryId&&status==="PENDING_APPROVAL"&&<button disabled={busy} onClick={()=>transition("entries",entryId,"approve")}>Registrar aprovação</button>}
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
            <div><strong>{str(item.title)||"Conciliação"}</strong><small>{status||"Sem estado"}</small></div>
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
