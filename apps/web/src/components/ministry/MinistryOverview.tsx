"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { presentMembership, readMinistries, type FormalMember, type MinistryOption } from "../../lib/ministry-desk";
import { readScopedEscalas, type MinistryEscala } from "../../lib/ministry-presentation";
import { ministryHref, ministryPanelTitle } from "../../lib/ministry-view";
import { ReportBars, ReportDashboard, ReportHeadline, ReportMetric } from "../ReportDashboard";
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
  return (
    <ReportDashboard>
      <div style={{ gridColumn: "1 / -1" }}>
        <PageHeader appearance="workspace" heading="h1" title="Todos os ministérios"
          description="Acompanhe as equipes e as escalas que seu perfil pode consultar." />
      </div>
      {error ? <Alert appearance="workspace" tone="danger" title="Não foi possível consultar os ministérios.">
        <button type="button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button>
      </Alert> : (
        <>
          <ReportHeadline label="Ministérios no seu acesso" value={rows?.length ?? null}>
            <ReportMetric label="Pessoas nas equipes" value={peopleComplete ? new Set(rows.flatMap(row => row.people?.map(person => person.personId) ?? [])).size : null} />
            <ReportMetric label="Escalas publicadas" value={schedulesComplete ? rows.reduce((total, row) => total + (row.schedules?.filter(schedule => schedule.status === "PUBLISHED").length ?? 0), 0) : null} />
          </ReportHeadline>
          {partial && <div style={{ gridColumn: "1 / -1" }}><Alert appearance="workspace" tone="warning" title="Algumas equipes ou escalas estão indisponíveis. As comparações mostram os dados consultados." /></div>}
          <ReportBars title="Integrantes por ministério" description="Selecione um ministério para abrir a equipe." loading={rows === null}
            rows={rows?.flatMap(({ ministry, people }) => people === null ? [] : [{
              label: ministryPanelTitle(ministry), value: people.length, href: ministryHref(ministry.id, "integrantes"),
            }]).sort((a, b) => b.value - a.value) ?? null} />
          <ReportBars title="Escalas por ministério" description="Escalas publicadas e em preparação." loading={rows === null}
            rows={rows?.flatMap(({ ministry, schedules }) => schedules === null ? [] : [{
              label: ministryPanelTitle(ministry),
              value: schedules.filter(row => row.status === "PUBLISHED" || row.status === "DRAFT").length,
              detail: `${schedules.filter(row => row.status === "DRAFT").length} em preparação`,
              href: ministryHref(ministry.id, "escalas"),
            }]).sort((a, b) => b.value - a.value) ?? null} />
        </>
      )}
    </ReportDashboard>
  );
}
