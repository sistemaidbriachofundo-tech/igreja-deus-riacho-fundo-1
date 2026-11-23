"use client";

import { sortByName } from "@idbrf/shared";
import { useEffect, useState } from "react";
import { AppShell, usePersonaAccess } from "../AppShell";
import { apiGet, loadStoredToken } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { PageHeader } from "../ui/PageHeader";
import ui from "../ui/ui.module.css";
import s from "./birthdays-desk.module.css";

export type CareBirthday = { id: string; name: string; date: string };

export function CareBirthdayList({ birthdays }: { birthdays: CareBirthday[] }) {
  const people = sortByName(birthdays, person => person.name);
  if (people.length === 0) {
    return <div className={s.empty}><p>Nenhum aniversário hoje no seu ministério, grupo ou mentoria.</p></div>;
  }
  return <ul className={s.people}>{people.map(person => {
    const day = person.date.slice(8, 10);
    const month = person.date.slice(5, 7);
    return <li key={person.id} className={s.person}>
      <div className={s.personIdentity}>
        <strong>{person.name}</strong>
        <time dateTime={person.date}>{day && month ? `${day}/${month}` : "Hoje"}</time>
      </div>
    </li>;
  })}</ul>;
}

function CareBirthdayDesk() {
  const access = usePersonaAccess();
  const [birthdays, setBirthdays] = useState<CareBirthday[]>();
  const [fault, setFault] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (access.kind !== "ready") return;
    const token = loadStoredToken();
    if (!token) return;
    let active = true;
    setBirthdays(undefined);
    setFault("");
    void apiGet<{ birthdays: CareBirthday[] }>("/reports/birthday-care", token)
      .then(result => { if (active) setBirthdays(result.birthdays); })
      .catch(error => { if (active) setFault(dasError(error)); });
    return () => { active = false; };
  }, [access.kind, attempt]);
  if (access.kind !== "ready") return null;
  return <div className={s.page}>
    <PageHeader appearance="workspace" heading="h1" title="Aniversariantes do seu cuidado"
      description="Somente pessoas do seu ministério, grupo de amizade ou mentoria. Sem telefone e sem a lista da congregação." />
    {fault ? <p className={s.notice} role="alert">{fault} <button type="button" className={ui.workspaceQuiet} onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></p> :
      birthdays === undefined ? <p className={s.notice} role="status">Carregando aniversariantes…</p> :
      <CareBirthdayList birthdays={birthdays} />}
  </div>;
}

export function CareBirthdays() {
  return <AppShell active="meu-espaco" meta="Aniversariantes"><CareBirthdayDesk /></AppShell>;
}
