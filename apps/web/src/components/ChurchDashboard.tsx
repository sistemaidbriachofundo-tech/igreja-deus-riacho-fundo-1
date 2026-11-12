"use client";

import { AppShell } from "./AppShell";
import s from "./church-dashboard.module.css";

/**
 * Visão local, sem sessão. Não calcula indicadores: números só entram
 * quando a API autorizada responde, na mesa de homologação.
 */
export function ChurchDashboard() {
  return (
    <AppShell active="visao" meta="Início">
      <div className={s.dashboard} data-dashboard="local">
        <header className={s.intro}>
          <p className={s.kicker}>ID Riacho 1</p>
          <h1>Início</h1>
          <p>Pessoas, admissões, ministérios e a agenda ficam em áreas separadas. Esta visão não publica números.</p>
        </header>
        <section className={s.panel} id="avisos" aria-labelledby="avisos-titulo">
          <h2 id="avisos-titulo">Avisos</h2>
          <p>Os indicadores aparecem depois do acesso, com o que a sua conta pode ver.</p>
        </section>
      </div>
    </AppShell>
  );
}
