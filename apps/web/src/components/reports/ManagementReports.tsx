"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../AppShell";
import { ApiRequestError, apiGet, getApiBaseUrl, loadStoredToken } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { withBasePath } from "../../lib/paths";
import {
  OperationalReports,
  type MembershipReport,
  type MinistryCostReport,
  type MinistryReport,
  type ParticipationReport,
  type Slot,
} from "./operational-reports";
import s from "./management-reports.module.css";

type Phase = "disabled" | "signed-out" | "loading" | "forbidden" | "error" | "ready";
type ReportName = "membership" | "ministries" | "participation" | "ministry-cost";

const idle = <T,>(): Slot<T> => ({ state: "loading" });

export function ManagementReports() {
  const enabled = process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ministryId, setMinistryId] = useState("");
  const [status, setStatus] = useState("");
  const [membership, setMembership] = useState<Slot<MembershipReport>>(enabled ? idle() : { state: "disabled" });
  const [ministries, setMinistries] = useState<Slot<MinistryReport>>(enabled ? idle() : { state: "disabled" });
  const [participation, setParticipation] = useState<Slot<ParticipationReport>>(enabled ? idle() : { state: "disabled" });
  const [cost, setCost] = useState<Slot<MinistryCostReport>>(enabled ? idle() : { state: "disabled" });

  const load = useCallback((stored: string, filters: { from: string; to: string; ministryId: string; status: string }) => {
    const period = query({ from: filters.from, to: filters.to });
    const ministry = filters.ministryId ? `ministryId=${encodeURIComponent(filters.ministryId)}` : "";
    const eventQuery = query({
      from: filters.from,
      to: filters.to,
      ministryId: filters.ministryId,
      status: filters.status,
    });
    const jobs: Array<[ReportName, string]> = [
      ["membership", `/reports/membership${period}`],
      ["ministries", `/reports/ministries${joinQuery(period, ministry)}`],
      ["participation", `/reports/participation${eventQuery}`],
      ["ministry-cost", `/reports/ministry-cost${joinQuery(period, ministry)}`],
    ];
    const place = (name: ReportName, slot: { state: "forbidden" | "error"; message: string }) => {
      if (name === "membership") setMembership(slot);
      if (name === "ministries") setMinistries(slot);
      if (name === "participation") setParticipation(slot);
      if (name === "ministry-cost") setCost(slot);
    };
    setMembership(idle());
    setMinistries(idle());
    setParticipation(idle());
    setCost(idle());
    for (const [name, path] of jobs) {
      void apiGet<unknown>(path, stored)
        .then((payload) => {
          const parsed = parseReport(name, payload);
          if (!parsed) {
            place(name, { state: "error", message: "A API devolveu um relatório incompleto." });
            return;
          }
          if (name === "membership") setMembership({ state: "ready", data: parsed as MembershipReport });
          if (name === "ministries") setMinistries({ state: "ready", data: parsed as MinistryReport });
          if (name === "participation") setParticipation({ state: "ready", data: parsed as ParticipationReport });
          if (name === "ministry-cost") setCost({ state: "ready", data: parsed as MinistryCostReport });
        })
        .catch((error: unknown) => {
          const message = error instanceof ApiRequestError && error.status === 403
            ? "Seu perfil não tem autorização para este relatório."
            : dasError(error);
          place(name, {
            state: error instanceof ApiRequestError && error.status === 403 ? "forbidden" : "error",
            message,
          });
        });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const stored = loadStoredToken();
    if (!stored) {
      const signedOut = { state: "signed-out" as const };
      setMembership(signedOut);
      setMinistries(signedOut);
      setParticipation(signedOut);
      setCost(signedOut);
      return;
    }
    setToken(stored);
    load(stored, { from: "", to: "", ministryId: "", status: "" });
  }, [enabled, load]);

  async function download(report: ReportName, format: "csv" | "pdf") {
    if (!token) return;
    setBusy(true);
    setNotice("");
    const period = query({ from, to, ministryId: report === "membership" ? "" : ministryId, status: report === "participation" ? status : "" });
    try {
      const response = await fetch(`${getApiBaseUrl()}/reports/${report}.${format}${period}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`${format.toUpperCase()} falhou (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${report}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  return <AppShell active={null} meta="Relatórios">
    {notice && <p className={s.blocked} role="alert">{notice}</p>}
    <OperationalReports
      membership={membership}
      ministries={ministries}
      participation={participation}
      cost={cost}
      from={from}
      to={to}
      ministryId={ministryId}
      status={status}
      busy={busy}
      onFrom={setFrom}
      onTo={setTo}
      onMinistry={setMinistryId}
      onStatus={setStatus}
      onApply={() => {
        if (from && to && from > to) {
          setNotice("O início do período não pode ser depois do fim.");
          return;
        }
        setNotice("");
        if (token) load(token, { from, to, ministryId, status });
      }}
      onDownload={(report, format) => { void download(report, format); }}
    />
    <p className={s.notice}><a className={s.link} href={withBasePath("/app/tesouraria/")}>Abrir a tesouraria</a></p>
  </AppShell>;
}

function joinQuery(period: string, extra: string): string {
  if (!extra) return period;
  if (!period) return `?${extra}`;
  return `${period}&${extra}`;
}

function query(filters: { from?: string; to?: string; ministryId?: string; status?: string }): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", `${filters.from}T00:00:00.000Z`);
  if (filters.to) params.set("to", `${filters.to}T23:59:59.000Z`);
  if (filters.ministryId) params.set("ministryId", filters.ministryId);
  if (filters.status) params.set("status", filters.status);
  const text = params.toString();
  return text ? `?${text}` : "";
}

function parseReport(name: ReportName, payload: unknown): MembershipReport | MinistryReport | ParticipationReport | MinistryCostReport | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  if (name === "membership") return readMembership(body);
  if (name === "ministries") return readMinistries(body);
  if (name === "participation") return readParticipation(body);
  return readCost(body);
}

function readMembership(body: Record<string, unknown>): MembershipReport | null {
  const byStatus = numberMap(body.byStatus);
  const adultsByStatus = numberMap(body.adultsByStatus);
  if (!byStatus || !adultsByStatus) return null;
  if (typeof body.totalMemberships !== "number" || typeof body.minorsOmitted !== "number" || typeof body.adultVisitorsActive !== "number" || typeof body.countsMatch !== "boolean") return null;
  return {
    byStatus,
    adultsByStatus,
    minorsOmitted: body.minorsOmitted,
    adultVisitorsActive: body.adultVisitorsActive,
    totalMemberships: body.totalMemberships,
    countsMatch: body.countsMatch,
    note: typeof body.note === "string" ? body.note : "",
  };
}

function readMinistries(body: Record<string, unknown>): MinistryReport | null {
  const eventTotalsByStatus = numberMap(body.eventTotalsByStatus);
  if (!eventTotalsByStatus || !Array.isArray(body.ministries)) return null;
  const ministries = body.ministries.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const eventsByStatus = numberMap(row.eventsByStatus);
    const volunteerInterestsByStatus = numberMap(row.volunteerInterestsByStatus);
    const formal = row.formalMembers;
    if (typeof row.id !== "string" || typeof row.name !== "string" || !eventsByStatus || !volunteerInterestsByStatus || !formal || typeof formal !== "object") return [];
    const formalRow = formal as Record<string, unknown>;
    const adultsByStatus = numberMap(formalRow.adultsByStatus);
    if (!adultsByStatus || typeof formalRow.minorsOmitted !== "number") return [];
    return [{
      id: row.id,
      name: row.name,
      slug: typeof row.slug === "string" ? row.slug : row.id,
      publishStatus: typeof row.publishStatus === "string" ? row.publishStatus : "",
      eventsByStatus,
      volunteerInterestsByStatus,
      formalMembers: { adultsByStatus, minorsOmitted: formalRow.minorsOmitted },
    }];
  });
  if (ministries.length !== body.ministries.length) return null;
  const formal = body.formalMembership;
  const note = formal && typeof formal === "object" && typeof (formal as { message?: unknown }).message === "string"
    ? (formal as { message: string }).message
    : "";
  return {
    note,
    unassignedEvents: typeof body.unassignedEvents === "number" ? body.unassignedEvents : null,
    eventTotalsByStatus,
    ministries,
  };
}

function readParticipation(body: Record<string, unknown>): ParticipationReport | null {
  const counts = numberMap(body.counts);
  if (!counts || !Array.isArray(body.rows)) return null;
  const rows = body.rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.registrationId !== "string") return [];
    return [{
      registrationId: row.registrationId,
      eventName: typeof row.eventName === "string" ? row.eventName : "",
      status: typeof row.status === "string" ? row.status : "",
      partySize: typeof row.partySize === "number" ? row.partySize : 0,
      syntheticLabel: typeof row.syntheticLabel === "string" ? row.syntheticLabel : null,
      labelRedacted: row.labelRedacted === true,
    }];
  });
  return { counts, rows };
}

function readCost(body: Record<string, unknown>): MinistryCostReport | null {
  if (typeof body.seriesMatch !== "boolean" || !Array.isArray(body.rows) || !Array.isArray(body.series)) return null;
  const rows = body.rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.ministryId !== "string" || typeof row.name !== "string" || typeof row.attributed !== "boolean") return [];
    const expense = row.expenseCents;
    if (expense !== null && typeof expense !== "number") return [];
    const entries = row.approvedEntries;
    if (entries !== null && typeof entries !== "number") return [];
    return [{
      ministryId: row.ministryId,
      name: row.name,
      attributed: row.attributed,
      expenseCents: expense,
      approvedEntries: entries,
      note: typeof row.note === "string" ? row.note : "",
    }];
  });
  if (rows.length !== body.rows.length) return null;
  const series = body.series.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.label !== "string" || typeof row.expenseCents !== "number") return [];
    return [{ label: row.label, expenseCents: row.expenseCents }];
  });
  if (series.length !== body.series.length) return null;
  return {
    note: typeof body.note === "string" ? body.note : "",
    seriesMatch: body.seriesMatch,
    series,
    rows,
  };
}

function numberMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "number" || !Number.isFinite(item)) return null;
    out[key] = item;
  }
  return out;
}

export function ReportsView(props: {
  phase: Phase;
  notice: string;
  membershipLines: Array<{ label: string; value: string }>;
  ministryLines: Array<{ label: string; value: string }>;
  membershipNote: string;
  ministryNote: string;
  busy: boolean;
  onDownload: (report: ReportName, format: "csv" | "pdf") => void;
}) {
  return <main className={s.page}>
    <header className={s.header}>
      <div>
        <div className={s.kicker}>FRENTE E · RELATÓRIOS</div>
        <h1>Membresia e ministérios</h1>
        <p>As contagens vêm da API. Registros de menores não são listados. Integrante formal continua bloqueado enquanto não houver tabela.</p>
      </div>
      <div className={s.reportLinks}><a className={s.link} href={withBasePath("/app/secretaria/indicadores/")}>Painel completo de membresia</a>
      <a className={s.link} href={withBasePath("/app/eventos-gestao/")}>Gestão de eventos</a></div>
    </header>
    {props.phase === "disabled" && <p className={s.blocked} role="status">Homologação desabilitada. Nenhum total foi inventado.</p>}
    {props.phase === "signed-out" && <p className={s.notice} role="status">Entre na área administrativa para consultar os relatórios.</p>}
    {props.phase === "loading" && <p className={s.notice} role="status">Consultando relatórios autorizados…</p>}
    {props.phase === "forbidden" && <p className={s.blocked} role="alert">{props.notice}</p>}
    {props.phase === "error" && <p className={s.blocked} role="alert">{props.notice}</p>}
    {props.notice && props.phase === "ready" && <p className={s.notice} role="status">{props.notice}</p>}
    {props.phase === "ready" && <>
      <ReportCard
        title="Membresia"
        note={props.membershipNote}
        lines={props.membershipLines}
        busy={props.busy}
        onCsv={() => props.onDownload("membership", "csv")}
        onPdf={() => props.onDownload("membership", "pdf")}
      />
      <ReportCard
        title="Ministérios"
        note={props.ministryNote}
        lines={props.ministryLines}
        busy={props.busy}
        onCsv={() => props.onDownload("ministries", "csv")}
        onPdf={() => props.onDownload("ministries", "pdf")}
      />
    </>}
  </main>;
}

function ReportCard(props: {
  title: string;
  note: string;
  lines: Array<{ label: string; value: string }>;
  busy: boolean;
  onCsv: () => void;
  onPdf: () => void;
}) {
  const ready = props.lines.length > 0;
  return <section className={s.panel}>
    <h2>{props.title}</h2>
    {props.note && <p className={ready ? s.notice : s.blocked}>{props.note}</p>}
    {!ready && <p>A API não devolveu contagens para este relatório.</p>}
    {ready && <ul className={s.lines}>{props.lines.map((line) => <li key={line.label}><span>{line.label}</span><strong>{line.value}</strong></li>)}</ul>}
    <div className={s.actions}>
      <button type="button" disabled={props.busy || !ready} onClick={props.onCsv}>Exportar CSV</button>
      <button type="button" disabled={props.busy || !ready} onClick={props.onPdf}>Exportar PDF</button>
    </div>
  </section>;
}
