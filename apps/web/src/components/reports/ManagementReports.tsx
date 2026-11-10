"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../AppShell";
import { apiGet, getApiBaseUrl, loadStoredToken, type LoginResult } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { countLines } from "../../lib/event-management";
import { withBasePath } from "../../lib/paths";
import s from "./management-reports.module.css";

type Phase = "disabled" | "signed-out" | "loading" | "forbidden" | "error" | "ready";
type ReportName = "membership" | "ministries";

export function ManagementReports() {
  const enabled = process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const [phase, setPhase] = useState<Phase>(enabled ? "loading" : "disabled");
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState("");
  const [membership, setMembership] = useState<Record<string, unknown> | null>(null);
  const [ministries, setMinistries] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const stored = loadStoredToken();
    if (!stored) { setPhase("signed-out"); return; }
    let cancelled = false;
    void apiGet<LoginResult["user"]>("/auth/me", stored)
      .then(async () => {
        if (cancelled) return;
        setToken(stored);
        const [membershipResult, ministryResult] = await Promise.allSettled([
          apiGet<Record<string, unknown>>("/reports/membership", stored),
          apiGet<Record<string, unknown>>("/reports/ministries", stored),
        ]);
        if (cancelled) return;
        if (membershipResult.status === "fulfilled") setMembership(membershipResult.value);
        if (ministryResult.status === "fulfilled") setMinistries(ministryResult.value);
        const denied = [membershipResult, ministryResult].every((result) =>
          result.status === "rejected" && /403|autorização/i.test(dasError(result.reason)));
        if (denied) {
          setNotice("Seu perfil não tem autorização para estes relatórios.");
          setPhase("forbidden");
          return;
        }
        const failed = [membershipResult, ministryResult].find((result) => result.status === "rejected");
        if (failed?.status === "rejected" && membershipResult.status === "rejected" && ministryResult.status === "rejected") {
          setNotice(dasError(failed.reason));
          setPhase("error");
          return;
        }
        if (failed?.status === "rejected") setNotice(dasError(failed.reason));
        setPhase("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = dasError(error);
        setNotice(message);
        setPhase(/autorização|403/i.test(message) ? "forbidden" : "error");
      });
    return () => { cancelled = true; };
  }, [enabled]);

  async function download(report: ReportName, format: "csv" | "pdf") {
    if (!token) return;
    setBusy(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/reports/${report}.${format}`, {
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

  return <AppShell active={null} meta="Relatórios de gestão">
    <ReportsView
      phase={phase}
      notice={notice}
      membershipLines={membership ? countLines(asReport(membership)) : []}
      ministryLines={ministries ? countLines(asReport(ministries)) : []}
      membershipNote={typeof membership?.note === "string" ? membership.note : ""}
      ministryNote={noteOf(ministries)}
      busy={busy}
      onDownload={(report, format) => { void download(report, format); }}
    />
  </AppShell>;
}

function asReport(value: Record<string, unknown>) {
  return value as Parameters<typeof countLines>[0];
}

function noteOf(report: Record<string, unknown> | null) {
  const formal = report?.formalMembership;
  if (!formal || typeof formal !== "object") return "";
  const message = (formal as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
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
      <a className={s.link} href={withBasePath("/app/eventos-gestao/")}>Gestão de eventos</a>
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
