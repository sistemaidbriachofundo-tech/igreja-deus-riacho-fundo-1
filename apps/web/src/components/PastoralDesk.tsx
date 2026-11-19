"use client";

import { useEffect, useState } from "react";
import { apiGet, loadStoredToken } from "../lib/api";
import type { DasRecord } from "../lib/das-operations";
import { pastoralSections } from "../lib/pastoral-navigation";
import { AppNavLink, UIIcon, usePersonaAccess } from "./AppShell";
import { PastoralBoard } from "./CareBoards";
import { WorkspacePriorities } from "./WorkspacePriorities";
import { PageHeader } from "./ui/PageHeader";
import s from "./pastoral-desk.module.css";
import ui from "./ui/ui.module.css";

export function PastoralDesk({ care = false }: { care?: boolean }) {
  const access = usePersonaAccess();
  if (access.kind === "preview") return <PageHeader appearance="workspace" heading="h1" title={care ? "Cuidado pastoral" : "Mesa pastoral"}
    description="Disponível na área autenticada para Pastoral e Administração." />;
  if (access.kind !== "ready") return null;
  if (care) return access.roles.includes("PASTOR") ? <PastoralCare roles={access.roles} />
    : <PageHeader appearance="workspace" heading="h1" title="Cuidado pastoral" description="Área reservada ao perfil de Pastor." />;
  if (access.roles.includes("PASTOR")) return <PastoralWorkspace roles={access.roles} />;
  if (access.roles.includes("PLATFORM_ADMIN")) return <AdministrativePastoralOverview />;
  return null;
}

const admissionQueue = "/app/pastoral/admissoes/";
const expenseQueue = "/app/pastoral/despesas/";

function AdministrativePastoralOverview() {
  const [revision, setRevision] = useState(0);
  const [counts, setCounts] = useState<{ admissions: number | null; expenses: number | null }>();

  useEffect(() => {
    const token = loadStoredToken();
    if (!token) return;
    let active = true;
    setCounts(undefined);
    void Promise.allSettled([
      apiGet<{ admissions: unknown[] }>("/admissions?status=AWAITING_PASTOR", token)
        .then(result => result.admissions.length),
      apiGet<{ entries: { approvalFlow: string; firstApprovedByUserId: string | null }[] }>("/ledger/entries?status=PENDING_APPROVAL", token)
        .then(result => result.entries.filter(entry => entry.approvalFlow === "TREASURER_THEN_PASTOR" && entry.firstApprovedByUserId).length),
    ]).then(([admissions, expenses]) => {
      if (active) setCounts({
        admissions: admissions.status === "fulfilled" ? admissions.value : null,
        expenses: expenses.status === "fulfilled" ? expenses.value : null,
      });
    });
    return () => { active = false; };
  }, [revision]);

  return <div className={s.desk}>
    <PageHeader appearance="workspace" heading="h1" title="Mesa pastoral"
      description="Acompanhe as admissões e despesas que aguardam decisão pastoral."
      actions={<button type="button" className={ui.workspaceSecondary} onClick={() => setRevision(value => value + 1)}>Atualizar</button>} />
    <nav className={s.queues} aria-label="Acompanhamento administrativo da Pastoral" aria-busy={!counts}>
      {([
        { key: "admissions", label: "Admissões na etapa pastoral", href: admissionQueue, icon: "layers" },
        { key: "expenses", label: "Despesas com aprovação pastoral pendente", href: expenseQueue, icon: "wallet" },
      ] as const).map(({ key, label, href, icon }) => (
        <AppNavLink key={key} className={`${ui.workspaceSurface} ${s.queue}`} href={href}>
          <UIIcon name={icon} size={21} />
          <div><strong>{label}</strong><span>{!counts ? "Consultando…" : counts[key] === null ? "Consulta indisponível" : `${counts[key].toLocaleString("pt-BR")} ${counts[key] === 1 ? "pendente" : "pendentes"}`}</span></div>
          <UIIcon name="arrow" size={17} />
        </AppNavLink>
      ))}
    </nav>
    <div className={s.actions}><AppNavLink className={ui.workspaceSecondary} href="/app/pastoral/aniversariantes/">
      <UIIcon name="birthday" size={18} /> Aniversariantes
    </AppNavLink></div>
  </div>;
}

function PastoralWorkspace({ roles }: { roles: readonly string[] }) {
  const [revision, setRevision] = useState(0);
  return <div className={s.desk}>
    <PageHeader appearance="workspace" heading="h1" title="Mesa pastoral"
      description="Acompanhe os atendimentos da congregação e revise as decisões que aguardam o pastor."
      actions={<button type="button" className={ui.workspaceSecondary} onClick={() => setRevision(value => value + 1)}>Atualizar</button>} />
    <nav className={s.actions} aria-label="Rotinas pastorais">
      {pastoralSections(roles).map(({ id, title, href, icon }) => <AppNavLink key={id} className={ui.workspaceSecondary} href={href}>
        <UIIcon name={icon} size={18} /> {title}
      </AppNavLink>)}
    </nav>
    <WorkspacePriorities showService={false} showDecisions revision={revision} />
  </div>;
}

function PastoralCare({ roles }: { roles: readonly string[] }) {
  const [revision, setRevision] = useState(0);
  const [token] = useState(() => loadStoredToken());
  const [cases, setCases] = useState<DasRecord[] | null>(null);
  const [failure, setFailure] = useState(false);
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setFailure(false);
    void apiGet<{ cases: DasRecord[] }>("/pastoral-cases", token)
      .then(result => { if (active) setCases(result.cases); })
      .catch(() => { if (active) { setCases(null); setFailure(true); } });
    return () => { active = false; };
  }, [revision, token]);

  return <div className={s.desk}>
    <PageHeader appearance="workspace" heading="h1" title="Cuidado pastoral"
      actions={<button type="button" className={ui.workspaceSecondary} onClick={refresh}>Atualizar</button>} />
    {failure ? <p role="alert">Não foi possível consultar os acompanhamentos. Use Atualizar para tentar novamente.</p>
      : cases && token ? <PastoralBoard rows={cases} token={token} roles={roles} refresh={refresh} />
        : <p role="status">Carregando acompanhamentos…</p>}
  </div>;
}
