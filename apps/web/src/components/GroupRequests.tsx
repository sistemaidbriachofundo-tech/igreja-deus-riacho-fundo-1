"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { dasError } from "../lib/das-operations";
import s from "./connection-desk.module.css";
import { useActionConfirmation } from "./ui/ActionConfirmation";

type RequestStatus = "PENDING" | "APPROVED" | "DECLINED" | "MEMBER";
type Group = { id: string; name: string; meetsAtHint: string | null; status: RequestStatus | null };
type Request = { id: string; status: RequestStatus; group: { name: string }; person: { displayName: string } };
const statusLabel: Record<RequestStatus, string> = {
  PENDING: "Aguardando resposta", APPROVED: "Pedido aceito", DECLINED: "Pedido recusado", MEMBER: "Você participa",
};

export function GroupRequests({ token, manage = false, hideEmpty = false }: { token: string; manage?: boolean; hideEmpty?: boolean }) {
  const { confirm, confirmation } = useActionConfirmation();
  const [groups, setGroups] = useState<Group[]>();
  const [requests, setRequests] = useState<Request[]>();
  const [busy, setBusy] = useState("");
  const [fault, setFault] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    setFault("");
    const load = manage
      ? apiGet<{ requests: Request[] }>("/group-requests/inbox", token).then(result => {
        if (current) setRequests(result.requests);
      })
      : apiGet<{ groups: Group[] }>("/group-requests/catalog", token).then(result => {
        if (current) setGroups(result.groups);
      });
    void load.catch(() => { if (current) setFault("Não foi possível consultar os Grupos de Amizade."); });
    return () => { current = false; };
  }, [token, manage, revision]);

  useEffect(() => {
    const anchor = window.location.hash.slice(1);
    if (requests && anchor.startsWith("pedido-")) document.getElementById(anchor)?.scrollIntoView({ block: "center" });
  }, [requests]);

  async function request(group: Group) {
    setBusy(group.id);
    setFault("");
    setMessage("");
    try {
      const result = await apiPost<{ status: RequestStatus }>("/group-requests/groups/" + encodeURIComponent(group.id), token);
      setGroups(current => current?.map(item => item.id === group.id ? { ...item, status: result.status } : item));
      setMessage(result.status === "PENDING" ? "Pedido enviado ao responsável pelo grupo." : statusLabel[result.status]);
    } catch (error) {
      setFault(dasError(error));
    } finally {
      setBusy("");
    }
  }

  async function decide(item: Request, approved: boolean) {
    setBusy(item.id);
    setFault("");
    setMessage("");
    try {
      if (!(await confirm({
        title: approved ? "Aceitar o pedido de entrada?" : "Recusar o pedido de entrada?",
        subject: item.person.displayName + " · " + item.group.name,
        description: approved ? "A pessoa será adicionada ao grupo." : "A pessoa poderá consultar a resposta na área logada.",
        action: approved ? "Aceitar pedido" : "Recusar pedido", tone: approved ? "normal" : "danger",
      }))) return;
      const result = await apiPost<{ status: RequestStatus }>("/group-requests/" + encodeURIComponent(item.id) + "/decision", token, { approved });
      setRequests(current => current?.map(row => row.id === item.id ? { ...row, status: result.status } : row));
      setMessage(statusLabel[result.status]);
    } catch (error) {
      setFault(dasError(error));
    } finally {
      setBusy("");
    }
  }

  if (hideEmpty && manage && !fault && !requests?.length) return null;

  return <section className={s.section} aria-label={manage ? "Pedidos de entrada em grupos" : "Grupos de Amizade"}>
    {confirmation}
    <h2>{manage ? "Pedidos de entrada" : "Grupos de Amizade"}</h2>
    {message && <p role="status">{message}</p>}
    {fault && <p className={s.notice} role="alert">{fault} <button className={s.retry} onClick={() => setRevision(value => value + 1)}>Atualizar</button></p>}
    {manage && requests?.length === 0 && <p className={s.notice}>Nenhum pedido nos grupos que você lidera.</p>}
    {!manage && groups?.length === 0 && <p className={s.notice}>Nenhum grupo recebe pedidos neste momento.</p>}
    <div className={s.groups}>
      {manage ? requests?.map(item => <article className={s.group} key={item.id} id={"pedido-" + item.id}>
        <h3>{item.person.displayName}</h3><p>{item.group.name}</p><p>{statusLabel[item.status]}</p>
        {item.status === "PENDING" && <div className={s.requestActions}>
          <button className={s.retry} type="button" disabled={Boolean(busy)} onClick={() => void decide(item, true)}>Aceitar</button>
          <button className={s.retry} type="button" disabled={Boolean(busy)} onClick={() => void decide(item, false)}>Recusar</button>
        </div>}
      </article>) : groups?.map(group => <article className={s.group} key={group.id}>
        <h3>{group.name}</h3>{group.meetsAtHint && <p>{group.meetsAtHint}</p>}
        {group.status ? <p>{statusLabel[group.status]}</p> : <button className={s.retry} type="button" disabled={Boolean(busy)} onClick={() => void request(group)}>Pedir para participar</button>}
      </article>)}
    </div>
  </section>;
}
