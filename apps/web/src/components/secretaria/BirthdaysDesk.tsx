"use client";

import { useEffect, useState } from "react";
import { AppNavLink, AppShell, usePersonaAccess } from "../AppShell";
import { apiGet, loadStoredToken } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import s from "../connection-desk.module.css";

const periods = { today: "Hoje", week: "Próximos 7 dias", month: "Este mês" } as const;
type Period = keyof typeof periods;
type Birthday = { id: string; name: string; date: string; phone: string | null; contactKind: "PERSON" | "GUARDIAN"; contactBlocked: boolean };

function BirthdayList() {
  const access = usePersonaAccess();
  const permitted = access.kind === "ready" && access.roles.some(role => ["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"].includes(role));
  const [period, setPeriod] = useState<Period>("today");
  const [birthdays, setBirthdays] = useState<Birthday[]>();
  const [fault, setFault] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!permitted) return;
    const token = loadStoredToken();
    if (!token) return;
    let active = true;
    setBirthdays(undefined);
    setFault("");
    void apiGet<{ birthdays: Birthday[] }>("/reports/birthdays?period=" + period, token)
      .then(result => { if (active) setBirthdays(result.birthdays); })
      .catch(error => { if (active) setFault(dasError(error)); });
    return () => { active = false; };
  }, [period, permitted, attempt]);
  if (!permitted) return null;

  return <div className={s.page}>
    <header className={s.heading}><h1>Aniversariantes</h1><p>Encontre quem faz aniversário e abra a conversa com uma mensagem pronta para editar.</p></header>
    <div className={s.requestActions} role="group" aria-label="Período dos aniversários">
      {(Object.keys(periods) as Period[]).map(key => <button type="button" key={key} className={s.retry} aria-pressed={period === key}
        onClick={() => { setPeriod(key); }}>{periods[key]}</button>)}
    </div>
    {fault ? <p className={s.notice} role="alert">{fault} <button type="button" className={s.retry} onClick={() => setAttempt(attempt + 1)}>Tentar novamente</button></p> :
      birthdays === undefined ? <p role="status">Carregando aniversariantes…</p> :
      birthdays.length === 0 ? <p className={s.notice}>Nenhum aniversário registrado nesse período.</p> :
      <ul className={s.operationList}>{birthdays.map(person => {
        const firstName = person.name.split(/\s+/)[0];
        const guardian = person.contactKind === "GUARDIAN";
        const message = guardian
          ? `Olá! Queremos parabenizar ${firstName} pelo aniversário. Que Deus abençoe sua família e este novo ano de vida! Recebam o carinho da Igreja de Deus do Riacho Fundo I.`
          : `Feliz aniversário, ${firstName}! Que Deus abençoe sua vida e sua família neste novo ano. Receba o carinho da Igreja de Deus do Riacho Fundo I!`;
        return <li key={person.id}>
          <div><strong>{person.name}</strong><time dateTime={person.date}>{person.date.slice(8, 10)}/{person.date.slice(5, 7)}</time></div>
          <div className={s.operationLinks}>
          <AppNavLink className={s.retry} href={"/app/secretaria/?pessoa=" + encodeURIComponent(person.id)}>Abrir ficha<span className={s.srOnly}> de {person.name}</span></AppNavLink>
          {person.phone && /^\+55\d{10,11}$/.test(person.phone)
            ? <a className={s.retry} href={`https://wa.me/${person.phone.slice(1)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"
              aria-label={`Abrir WhatsApp ${guardian ? "do responsável por" : "de"} ${person.name}`}>{guardian ? "WhatsApp do responsável" : "Abrir WhatsApp"}</a>
            : <span>{person.contactBlocked ? "WhatsApp desativado no cadastro" : guardian ? "Sem telefone do responsável cadastrado" : "Sem telefone cadastrado"}</span>}
          </div>
        </li>;
      })}</ul>}
  </div>;
}

export function BirthdaysDesk() {
  return <AppShell active="secretaria" meta="Aniversariantes" secretarySection="aniversariantes"><BirthdayList /></AppShell>;
}
