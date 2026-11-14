"use client";

import { useEffect, useState } from "react";
import { AppNavLink, AppShell, usePersonaAccess, UIIcon } from "../AppShell";
import { apiGet, loadStoredToken } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { Modal } from "../ui/Modal";
import ui from "../ui/ui.module.css";
import s from "./birthdays-desk.module.css";

const periods = {
  today: { label: "Hoje", icon: "birthday" },
  week: { label: "Próximos 7 dias", icon: "calendar" },
  month: { label: "Este mês", icon: "month" },
} as const;
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
    <header className={s.heading}>
      <span className={s.headingIcon}><UIIcon name="birthday" size={27} /></span>
      <div><h1>Aniversariantes</h1><p>Veja quem faz aniversário e prepare uma mensagem em nome da igreja.</p></div>
    </header>
    <Modal open={Boolean(greeting)} appearance="workspace" title={greeting ? "Mensagem para " + greeting.name : "Mensagem de aniversário"} onClose={() => setGreeting(null)}>
      {greeting && <div className={s.birthdayGreeting}>
        <label>Mensagem de aniversário<textarea value={greeting.text} rows={5} maxLength={1200}
          onChange={event => setGreeting({ ...greeting, text: event.target.value })} /></label>
        <p>{greeting.example ? "Teste sem destinatário definido. Escolha seu próprio contato no WhatsApp." : "Revise a mensagem no WhatsApp e envie quando estiver pronta."}</p>
        {greeting.text.trim() && <a className={ui.workspacePrimary} href={"https://wa.me/" + greeting.phone + "?text=" + encodeURIComponent(greeting.text.trim())}
          target="_blank" rel="noopener noreferrer"><UIIcon name="whatsapp" size={19} />Abrir WhatsApp <span aria-hidden="true">↗</span></a>}
      </div>}
    </Modal>
    <section className={s.directory} aria-label="Agenda de aniversários">
      <div className={s.directoryBar}>
        <div className={ui.workspaceChoices} role="group" aria-label="Período dos aniversários">
          {(Object.keys(periods) as Period[]).map(key => <button type="button" key={key} aria-pressed={period === key}
            onClick={() => setPeriod(key)}><UIIcon name={periods[key].icon} size={16} />{periods[key].label}</button>)}
        </div>
        {birthdays && birthdays.length > 0 && <span className={s.resultCount} role="status">
          {birthdays.length} {birthdays.length === 1 ? "aniversariante" : "aniversariantes"}
        </span>}
      </div>
    {fault ? <p className={s.notice} role="alert">{fault} <button type="button" className={ui.workspaceQuiet} onClick={() => setAttempt(attempt + 1)}>Tentar novamente</button></p> :
      birthdays === undefined ? <p className={s.notice} role="status">Carregando aniversariantes…</p> :
      birthdays.length === 0 ? <div className={s.empty}><UIIcon name="calendar" size={24} /><p>Nenhum aniversário registrado nesse período.</p></div> :
      <ul className={s.people}>{birthdays.map(person => {
        const names = person.name.trim().replace(/\s*\(.*$/, "").split(/\s+/);
        const firstName = names[0];
        const initials = [firstName, ...(names.length > 1 ? [names.at(-1)] : [])]
          .map(name => name?.[0] ?? "").join("").toLocaleUpperCase("pt-BR");
        const guardian = person.contactKind === "GUARDIAN";
        const example = person.id.startsWith("qa_birthday_");
        const phone = person.phone && /^\+55\d{10,11}$/.test(person.phone) ? person.phone.slice(1) : "";
        const message = guardian
          ? `Olá! Queremos parabenizar ${firstName} pelo aniversário. Que Deus abençoe sua família e este novo ano de vida! Recebam o carinho da Igreja de Deus do Riacho Fundo I.`
          : `Feliz aniversário, ${firstName}! Que Deus abençoe sua vida e sua família neste novo ano. Receba o carinho da Igreja de Deus do Riacho Fundo I!`;
        return <li key={person.id} className={s.person}>
          <div className={s.personIdentity}>
            <span className={s.avatar} aria-hidden="true">{initials}</span>
            <div><strong>{person.name}</strong><time dateTime={person.date}>
              <UIIcon name="calendar" size={14} />{person.daysAway === 0 ? "Hoje · " : ""}{person.date.slice(8, 10)}/{person.date.slice(5, 7)}
            </time></div>
          </div>
          <div className={s.personActions}>
          <AppNavLink className={ui.workspaceQuiet} href={"/app/secretaria/?pessoa=" + encodeURIComponent(person.id)}><UIIcon name="badge" size={17} />Abrir ficha<span className={s.srOnly}> de {person.name}</span></AppNavLink>
          {(phone || example) && !person.contactBlocked
            ? <button type="button" className={s.whatsapp} onClick={() => setGreeting({ name: person.name, phone: example ? "" : phone, text: message, example })}>
              <UIIcon name="whatsapp" size={20} /> {example ? "Testar WhatsApp" : guardian ? "WhatsApp do responsável" : "Mensagem no WhatsApp"}
            </button>
            : <span className={s.contactNote}>{person.contactBlocked ? "WhatsApp desativado no cadastro" : guardian ? "Sem telefone do responsável cadastrado" : "Sem telefone cadastrado"}</span>}
          </div>
        </li>;
      })}</ul>}
    </section>
  </div>;
}

export function BirthdaysDesk() {
  return <AppShell active="secretaria" meta="Aniversariantes" secretarySection="aniversariantes"><BirthdayList /></AppShell>;
}
