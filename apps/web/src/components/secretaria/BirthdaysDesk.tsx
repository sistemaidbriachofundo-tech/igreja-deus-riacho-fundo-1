"use client";

import { useEffect, useState } from "react";
import { AppNavLink, AppShell, usePersonaAccess, UIIcon } from "../AppShell";
import { apiGet, loadStoredToken } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { Modal } from "../ui/Modal";
import s from "../connection-desk.module.css";

const periods = { today: "Hoje", week: "Próximos 7 dias", month: "Este mês" } as const;
type Period = keyof typeof periods;
type Birthday = { id: string; name: string; date: string; phone: string | null; contactKind: "PERSON" | "GUARDIAN"; contactBlocked: boolean; daysAway?: number };

function BirthdayList() {
  const access = usePersonaAccess();
  const permitted = access.kind === "ready" && access.roles.some(role => ["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"].includes(role));
  const [period, setPeriod] = useState<Period>("today");
  const [birthdays, setBirthdays] = useState<Birthday[]>();
  const [fault, setFault] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [greeting, setGreeting] = useState<{ name: string; phone: string; text: string; example: boolean } | null>(null);
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
    <header className={s.heading}><h1>Aniversariantes</h1><p>Acompanhe os aniversários e prepare uma mensagem de carinho em nome da igreja.</p></header>
    <Modal open={Boolean(greeting)} appearance="workspace" title={greeting ? "Mensagem para " + greeting.name : "Mensagem de aniversário"} onClose={() => setGreeting(null)}>
      {greeting && <div className={s.birthdayGreeting}>
        <label>Mensagem de aniversário<textarea value={greeting.text} rows={5} maxLength={1200}
          onChange={event => setGreeting({ ...greeting, text: event.target.value })} /></label>
        <p>{greeting.example ? "Teste sem destinatário definido. Escolha seu próprio contato no WhatsApp." : "Revise a mensagem no WhatsApp e envie quando estiver pronta."}</p>
        {greeting.text.trim() && <a className={s.primaryAction} href={"https://wa.me/" + greeting.phone + "?text=" + encodeURIComponent(greeting.text.trim())}
          target="_blank" rel="noopener noreferrer">Abrir WhatsApp <span aria-hidden="true">↗</span></a>}
      </div>}
    </Modal>
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
        const example = person.id.startsWith("qa_birthday_");
        const phone = person.phone && /^\+55\d{10,11}$/.test(person.phone) ? person.phone.slice(1) : "";
        const message = guardian
          ? `Olá! Queremos parabenizar ${firstName} pelo aniversário. Que Deus abençoe sua família e este novo ano de vida! Recebam o carinho da Igreja de Deus do Riacho Fundo I.`
          : `Feliz aniversário, ${firstName}! Que Deus abençoe sua vida e sua família neste novo ano. Receba o carinho da Igreja de Deus do Riacho Fundo I!`;
        return <li key={person.id}>
          <div><strong>{person.name}</strong><time dateTime={person.date}>{person.daysAway === 0 ? "Hoje · " : ""}{person.date.slice(8, 10)}/{person.date.slice(5, 7)}</time></div>
          <div className={s.operationLinks}>
          <AppNavLink className={s.retry} href={"/app/secretaria/?pessoa=" + encodeURIComponent(person.id)}>Abrir ficha<span className={s.srOnly}> de {person.name}</span></AppNavLink>
          {(phone || example) && !person.contactBlocked
            ? <button type="button" className={s.primaryAction} onClick={() => setGreeting({ name: person.name, phone: example ? "" : phone, text: message, example })}>
              <UIIcon name="mail" size={16} /> {example ? "Testar WhatsApp" : guardian ? "Mensagem ao responsável" : "Preparar mensagem"}
            </button>
            : <span>{person.contactBlocked ? "WhatsApp desativado no cadastro" : guardian ? "Sem telefone do responsável cadastrado" : "Sem telefone cadastrado"}</span>}
          </div>
        </li>;
      })}</ul>}
  </div>;
}

export function BirthdaysDesk() {
  return <AppShell active="secretaria" meta="Aniversariantes" secretarySection="aniversariantes"><BirthdayList /></AppShell>;
}
