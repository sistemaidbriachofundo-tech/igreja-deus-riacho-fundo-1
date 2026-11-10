"use client";

import { AppNavLink, AppShell, usePersonaAccess } from "./AppShell";
import { areasForRoles } from "../lib/persona-navigation";
import s from "./persona-home.module.css";

export function PersonaHome() {
  return (
    <AppShell active="visao" meta="Início">
      <PersonaBoard />
    </AppShell>
  );
}

export function PersonaBoard() {
  const access = usePersonaAccess();
  if (access.kind !== "ready") return null;
  const areas = areasForRoles(access.roles).filter(area => area.key !== "visao");
  const limits = areas.filter(area => area.limitation);
  return (
    <div className={s.board} data-persona-home={access.roles.join(",")}>
      <header className={s.intro}>
        <span className={s.kicker}>CHURCH OS · SEU PERFIL</span>
        <h1>O que você acompanha</h1>
        <p>
          Conta {access.email}. Perfil: {access.label}. O menu lista só áreas cujo acesso a API já concede a este papel.
          Cada consulta continua sendo autorizada no servidor.
        </p>
      </header>
      <ul className={s.grid}>
        {areas.map(area => (
          <li key={area.key}>
            <AppNavLink className={s.card} href={area.href}>
              <strong>{area.label}</strong>
              <small>{area.hint}</small>
            </AppNavLink>
          </li>
        ))}
      </ul>
      <section className={s.limits} id="avisos" aria-labelledby="avisos-titulo">
        <h2 id="avisos-titulo">Limites deste perfil</h2>
        {limits.length === 0
          ? <p>Nenhum módulo desta lista declara uma pendência de contrato.</p>
          : <ul>{limits.map(area => <li key={area.key}><strong>{area.label}.</strong> {area.limitation}</li>)}</ul>}
        <p>Áreas de outro papel não aparecem aqui. Abrir o endereço direto não carrega o módulo.</p>
      </section>
    </div>
  );
}
