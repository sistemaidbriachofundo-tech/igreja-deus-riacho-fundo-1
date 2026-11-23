"use client";

import { AppNavLink, AppShell } from "../../../components/AppShell";
import { GroupRequests } from "../../../components/GroupRequests";
import { ConnectionJourney } from "../../../components/serving/ConnectionJourney";
import { PageHeader } from "../../../components/ui/PageHeader";
import ui from "../../../components/ui/ui.module.css";
import { loadStoredToken } from "../../../lib/api";
import styles from "../../../components/connection-desk.module.css";

function GuestHome() {
  const token = loadStoredToken();
  if (!token) return null;

  return <div className={styles.page}>
    <PageHeader appearance="workspace" heading="h1" title="Minha área de convidado"
      actions={<AppNavLink className={ui.workspacePrimary} href="/app/eventos/">Ver eventos e minhas inscrições</AppNavLink>} />
    <ConnectionJourney />
    <GroupRequests token={token} />
  </div>;
}

export default function GuestHomePage() {
  return <AppShell active="convidado" meta="Minha área"><GuestHome /></AppShell>;
}
