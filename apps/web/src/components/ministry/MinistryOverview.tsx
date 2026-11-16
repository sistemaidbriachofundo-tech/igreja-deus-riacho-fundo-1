"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { presentMembership, readMinistries, type FormalMember, type MinistryOption } from "../../lib/ministry-desk";
import { readScopedEscalas, type MinistryEscala } from "../../lib/ministry-presentation";
import { ministryHref, ministryPanelTitle } from "../../lib/ministry-view";
import { ReportBars, ReportDashboard } from "../ReportDashboard";
import { AppNavLink } from "../AppShell";
import { UIIcon } from "../ui/UIIcon";
import ui from "../ui/ui.module.css";
import s from "./ministry-home.module.css";
import { Alert } from "../ui/Alert";
import { PageHeader } from "../ui/PageHeader";

type TeamRow = {
  ministry: MinistryOption;
  people: FormalMember[] | null;
  schedules: MinistryEscala[] | null;
};

async function loadOverview(token: string, signal: AbortSignal): Promise<TeamRow[]> {
  const ministries = readMinistries(await apiGet("/ministries", token));
  const rows: TeamRow[] = [];
  for (let index = 0; index < ministries.length && !signal.aborted; index += 4) {
    const batch = await Promise.all(ministries.slice(index, index + 4).map(async (ministry) => {
      const id = encodeURIComponent(ministry.id);
      const [people, schedules] = await Promise.allSettled([
        apiGet(`/ministry-scope/${id}/formal-memberships`, token),
        apiGet(`/rosters/by-ministry/${id}`, token),
      ]);
      const membership = people.status === "fulfilled" ? presentMembership(200, people.value) : null;
      return {
        ministry,
        people: membership?.kind === "ready" ? membership.members.filter(member => member.status !== "ENCERRADO") : null,
        schedules: schedules.status === "fulfilled" ? readScopedEscalas(schedules.value, ministry.id) : null,
      };
    }));
    rows.push(...batch);
  }
  return rows;
}

export function MinistryOverview({ token }: { token: string }) {
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setError(false);
    void loadOverview(token, controller.signal).then(result => {
      if (!controller.signal.aborted) setRows(result);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [token, attempt]);

  const peopleComplete = rows !== null && rows.every(row => row.people !== null);
  const schedulesComplete = rows !== null && rows.every(row => row.schedules !== null);
  const partial = rows !== null && (!peopleComplete || !schedulesComplete);
  const totals = [
    { label: "Ministérios", value: rows?.length, icon: "layers" },
    { label: "Pessoas nas equipes", value: peopleComplete ? new Set(rows.flatMap(row => row.people?.map(person => person.personId) ?? [])).size : null, icon: "people" },
    { label: "Escalas publicadas", value: schedulesComplete ? rows.reduce((total, row) => total + (row.schedules?.filter(schedule => schedule.status === "PUBLISHED").length ?? 0), 0) : null, icon: "calendar" },
  ] as const;
  return (
    <div className={s.directory}>
      <PageHeader appearance="workspace" heading="h1" title="Todos os ministérios"
        description="Encontre as equipes e escalas da congregação." />
      {error ? <Alert appearance="workspace" tone="danger" title="Não foi possível consultar os ministérios.">
        <button type="button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button>
      </Alert> : (
        <>
          <dl className={s.directoryTotals} aria-label="Indicadores dos ministérios">
            {totals.map(metric => <div key={metric.label}>
              <dt><UIIcon name={metric.icon} size={16} />{metric.label}</dt>
              <dd>{metric.value ?? "—"}</dd>
            </div>)}
          </dl>
          {partial && <Alert appearance="workspace" tone="warning" title="Alguns dados de equipes ou escalas estão indisponíveis." />}
          {rows === null && <p className={s.note} role="status">Consultando ministérios…</p>}
          {rows?.length === 0 && <p className={s.note}>Nenhum ministério disponível.</p>}
          {rows && rows.length > 0 && <>
            <ul className={s.directoryList} aria-label="Ministérios da congregação">
              {rows.map(({ ministry, people, schedules }) => {
                const title = ministryPanelTitle(ministry);
                const count = schedules?.filter(row => row.status === "PUBLISHED" || row.status === "DRAFT").length;
                return <li key={ministry.id} className={s.directoryRow}>
                  <AppNavLink className={s.directoryName} href={ministryHref(ministry.id, "visao")}>
                    <span className={s.directoryIcon}><UIIcon name="layers" size={19} /></span>
                    <strong>{title}</strong><UIIcon name="chevron" size={16} />
                  </AppNavLink>
                  <div className={s.directoryActions}>
                    <AppNavLink className={ui.workspaceQuiet} href={ministryHref(ministry.id, "integrantes")} aria-label={`Equipe ${people?.length ?? "—"} · ${title}`}>
                      <UIIcon name="people" size={16} /> Equipe <span>{people?.length ?? "—"}</span>
                    </AppNavLink>
                    <AppNavLink className={ui.workspaceQuiet} href={ministryHref(ministry.id, "escalas")} aria-label={`Escalas ${count ?? "—"} · ${title}`}>
                      <UIIcon name="calendar" size={16} /> Escalas <span>{count ?? "—"}</span>
                    </AppNavLink>
                  </div>
                </li>;
              })}
            </ul>
            <details className={s.directoryCompare}>
              <summary><UIIcon name="activity" size={17} /> Comparar os ministérios <UIIcon name="chevron" size={17} /></summary>
              <ReportDashboard>
                <ReportBars title="Integrantes por ministério" description="Selecione um ministério para abrir a equipe."
                  rows={rows.flatMap(({ ministry, people }) => people === null ? [] : [{
                    label: ministryPanelTitle(ministry), value: people.length, href: ministryHref(ministry.id, "integrantes"),
                  }]).sort((a, b) => b.value - a.value)} />
                <ReportBars title="Escalas por ministério" description="Escalas publicadas e em preparação."
                  rows={rows.flatMap(({ ministry, schedules }) => schedules === null ? [] : [{
                    label: ministryPanelTitle(ministry),
                    value: schedules.filter(row => row.status === "PUBLISHED" || row.status === "DRAFT").length,
                    detail: `${schedules.filter(row => row.status === "DRAFT").length} em preparação`,
                    href: ministryHref(ministry.id, "escalas"),
                  }]).sort((a, b) => b.value - a.value)} />
              </ReportDashboard>
            </details>
          </>}
        </>
      )}
    </div>
  );
}
