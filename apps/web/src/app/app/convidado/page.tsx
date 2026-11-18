"use client";

import { AppNavLink, AppShell } from "../../../components/AppShell";
import { GroupRequests } from "../../../components/GroupRequests";
import { ConnectionJourney } from "../../../components/serving/ConnectionJourney";
import { loadStoredToken } from "../../../lib/api";
import styles from "../../../components/connection-desk.module.css";

function GuestHome() {
  const token = loadStoredToken();
  if (!token) return null;

  return <div className={styles.page}>
    <header className={styles.sectionTitle}>
      <h1>Minha área de convidado</h1>
      <AppNavLink className={styles.primaryAction} href="/app/eventos/">Ver eventos e minhas inscrições</AppNavLink>
    </header>
    <ConnectionJourney />
    <GroupRequests token={token} />
  </div>;
}

export default function GuestHomePage() {
  return <AppShell active="convidado" meta="Minha área"><GuestHome /></AppShell>;
}
