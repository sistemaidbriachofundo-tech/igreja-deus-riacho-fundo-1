"use client";

import type { ReactNode } from "react";
import { formatBRL } from "../../lib/das-operations";
import { barsFromCounts, costBars, participationBars, type Bar } from "./report-charts";
import s from "./management-reports.module.css";

export type Slot<T> =
  | { state: "disabled" | "signed-out" | "loading" }
  | { state: "forbidden" | "error"; message: string }
  | { state: "ready"; data: T };

export type MembershipReport = {
  byStatus: Record<string, number>;
  adultsByStatus: Record<string, number>;
  minorsOmitted: number;
  adultVisitorsActive: number;
  totalMemberships: number;
  countsMatch: boolean;
  note: string;
};

export type MinistryReport = {
  note: string;
  unassignedEvents: number | null;
  eventTotalsByStatus: Record<string, number>;
  ministries: Array<{
    id: string;
    name: string;
    slug: string;
    publishStatus: string;
    eventsByStatus: Record<string, number>;
    volunteerInterestsByStatus: Record<string, number>;
    formalMembers: { adultsByStatus: Record<string, number>; minorsOmitted: number };
  }>;
};

export type ParticipationReport = {
  counts: Record<string, number>;
  rows: Array<{
    registrationId: string;
    eventName: string;
    status: string;
    partySize: number;
    syntheticLabel: string | null;
    labelRedacted: boolean;
  }>;
};

export type MinistryCostReport = {
  note: string;
  seriesMatch: boolean;
  series: Array<{ label: string; expenseCents: number }>;
  rows: Array<{
    ministryId: string;
    name: string;
    attributed: boolean;
    expenseCents: number | null;
    approvedEntries: number | null;
    note: string;
  }>;
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativa",
  PENDING_ADMISSION: "Admissão pendente",
  INACTIVE: "Inativa",
  TRANSFERRED: "Transferida",
  PUBLISHED: "Publicado",
  DRAFT: "Rascunho",
  CANCELLED: "Cancelado",
  CHECKED_IN: "Presente",
  CONFIRMED: "Confirmado",
  PENDING_PAYMENT: "Pagamento pendente",
  OPEN: "Aberto",
  CLOSED: "Encerrado",
  ATIVO: "Ativo",
  cancelled: "Canceladas",
  checkedIn: "Presentes",
  pendingPayment: "Pagamento pendente",
  confirmedAwaitingPresence: "Confirmadas sem presença",
  unclassified: "Sem classificação",
};

function labelOf(value: string): string {
  return STATUS_LABEL[value] ?? value;
}

function publicLabel(row: ParticipationReport["rows"][number]): string {
  if (row.labelRedacted || !row.syntheticLabel) return "Rótulo omitido";
  if (/@|\d{3}\.\d{3}\.\d{3}-\d{2}/.test(row.syntheticLabel)) return "Rótulo omitido";
  return row.syntheticLabel;
}

function sumRecord(record: Record<string, number>): number {
  return Object.values(record).reduce((total, value) => total + value, 0);
}

export function OperationalReports(props: {
  membership: Slot<MembershipReport>;
  ministries: Slot<MinistryReport>;
  participation: Slot<ParticipationReport>;
  cost: Slot<MinistryCostReport>;
  from: string;
  to: string;
  ministryId: string;
  status: string;
  busy: boolean;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onMinistry: (value: string) => void;
  onStatus: (value: string) => void;
  onApply: () => void;
  onDownload: (report: "membership" | "ministries" | "participation" | "ministry-cost", format: "csv" | "pdf") => void;
}) {
  const ministryOptions = props.ministries.state === "ready" ? props.ministries.data.ministries : [];
  return (
    <main className={s.page}>
      <header className={s.header}>
        <div>
          <p className={s.kicker}>Relatórios · homologação</p>
          <h1>Pessoas, ministérios e eventos</h1>
          <p>Contagens e custos saem da API no período escolhido. Menores não são listados. Nada aqui é Pix ou banco.</p>
        </div>
      </header>

      <form className={s.filters} onSubmit={(event) => { event.preventDefault(); props.onApply(); }}>
        <label>De
          <input type="date" value={props.from} onChange={(event) => props.onFrom(event.target.value)} />
        </label>
        <label>Até
          <input type="date" value={props.to} min={props.from || undefined} onChange={(event) => props.onTo(event.target.value)} />
        </label>
        <label>Ministério
          <select value={props.ministryId} onChange={(event) => props.onMinistry(event.target.value)}>
            <option value="">Escopo autorizado</option>
            {ministryOptions.map((ministry) => (
              <option key={ministry.id} value={ministry.id}>{ministry.name}</option>
            ))}
          </select>
        </label>
        <label>Situação do evento
          <select value={props.status} onChange={(event) => props.onStatus(event.target.value)}>
            <option value="">Todas</option>
            <option value="PENDING_PAYMENT">Pagamento pendente</option>
            <option value="CONFIRMED">Confirmado</option>
            <option value="CHECKED_IN">Presente</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </label>
        <button type="submit" disabled={props.busy}>Atualizar consulta</button>
      </form>

      <ReportFrame
        title="Pessoas"
        slot={props.membership}
        busy={props.busy}
        onCsv={() => props.onDownload("membership", "csv")}
        onPdf={() => props.onDownload("membership", "pdf")}
        render={(data) => <MembershipBody data={data} />}
      />
      <ReportFrame
        title="Ministérios"
        slot={props.ministries}
        busy={props.busy}
        onCsv={() => props.onDownload("ministries", "csv")}
        onPdf={() => props.onDownload("ministries", "pdf")}
        render={(data) => <MinistryBody data={data} />}
      />
      <ReportFrame
        title="Eventos"
        slot={props.participation}
        busy={props.busy}
        onCsv={() => props.onDownload("participation", "csv")}
        onPdf={() => props.onDownload("participation", "pdf")}
        render={(data) => <ParticipationBody data={data} />}
      />
      <ReportFrame
        title="Custo do ministério"
        slot={props.cost}
        busy={props.busy}
        onCsv={() => props.onDownload("ministry-cost", "csv")}
        onPdf={() => props.onDownload("ministry-cost", "pdf")}
        render={(data) => <CostBody data={data} />}
      />
    </main>
  );
}

function ReportFrame<T>(props: {
  title: string;
  slot: Slot<T>;
  busy: boolean;
  onCsv: () => void;
  onPdf: () => void;
  render: (data: T) => ReactNode;
}) {
  const ready = props.slot.state === "ready";
  return (
    <section className={s.panel} aria-label={props.title}>
      <h2>{props.title}</h2>
      {props.slot.state === "disabled" && <p className={s.blocked} role="status">Homologação desabilitada. Nenhum total foi inventado.</p>}
      {props.slot.state === "signed-out" && <p className={s.notice} role="status">Entre para consultar este relatório.</p>}
      {props.slot.state === "loading" && <p className={s.notice} role="status">Consultando…</p>}
      {props.slot.state === "forbidden" && <p className={s.blocked} role="alert">{props.slot.message}</p>}
      {props.slot.state === "error" && <p className={s.blocked} role="alert">{props.slot.message} Nenhum número foi colocado no lugar da consulta.</p>}
      {props.slot.state === "ready" && props.render(props.slot.data)}
      <div className={s.actions}>
        <button type="button" disabled={props.busy || !ready} onClick={props.onCsv}>Exportar CSV</button>
        <button type="button" disabled={props.busy || !ready} onClick={props.onPdf}>Exportar PDF</button>
      </div>
    </section>
  );
}

function Chart(props: { bars: Bar[] | null; caption: string; format: (value: number) => string }) {
  if (!props.bars) return <p className={s.notice}>{props.caption}</p>;
  if (props.bars.length === 0) return <p className={s.notice}>A API não devolveu agregação para o gráfico.</p>;
  const max = Math.max(...props.bars.map((bar) => Math.abs(bar.value)), 1);
  return (
    <div className={s.chart} aria-label={props.caption}>
      <p>{props.caption}</p>
      <ul>
        {props.bars.map((bar) => (
          <li key={bar.label}>
            <span>{labelOf(bar.label)}</span>
            <span className={s.track} aria-hidden="true">
              <span style={{ width: `${(Math.abs(bar.value) / max) * 100}%` }} />
            </span>
            <strong>{props.format(bar.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MembershipBody({ data }: { data: MembershipReport }) {
  const bars = data.countsMatch ? barsFromCounts(data.byStatus) : null;
  return (
    <>
      {data.note && <p className={s.notice}>{data.note}</p>}
      {!data.countsMatch && <p className={s.blocked} role="alert">As contagens não fecham. O gráfico ficou de fora.</p>}
      <Chart bars={bars} caption="Membresia por situação, como a API agregou." format={(value) => String(value)} />
      <ul className={s.lines}>
        <li><span>Total de membresias</span><strong>{data.totalMemberships}</strong></li>
        <li><span>Menores omitidos</span><strong>{data.minorsOmitted}</strong></li>
        <li><span>Visitantes adultos ativos</span><strong>{data.adultVisitorsActive}</strong></li>
        {Object.entries(data.adultsByStatus).map(([status, value]) => (
          <li key={status}><span>Adultos · {labelOf(status)}</span><strong>{value}</strong></li>
        ))}
      </ul>
    </>
  );
}

function MinistryBody({ data }: { data: MinistryReport }) {
  const bars = barsFromCounts(data.eventTotalsByStatus);
  return (
    <>
      {data.note && <p className={s.notice}>{data.note}</p>}
      <Chart
        bars={bars}
        caption="Eventos com ministério, por situação. Eventos sem ministério ficam fora do gráfico."
        format={(value) => String(value)}
      />
      {data.unassignedEvents !== null && (
        <p className={s.notice}>Eventos sem ministério: {data.unassignedEvents}</p>
      )}
      <div className={s.table}>
        {data.ministries.map((ministry) => (
          <article key={ministry.id}>
            <h3>{ministry.name}</h3>
            <p>Publicação: {labelOf(ministry.publishStatus)}</p>
            <p>Eventos: {sumRecord(ministry.eventsByStatus)} · Interesses: {sumRecord(ministry.volunteerInterestsByStatus)}</p>
            <p>Integrantes adultos: {sumRecord(ministry.formalMembers.adultsByStatus)} · Menores omitidos: {ministry.formalMembers.minorsOmitted}</p>
          </article>
        ))}
        {data.ministries.length === 0 && <p>A API não devolveu ministérios neste escopo.</p>}
      </div>
    </>
  );
}

function ParticipationBody({ data }: { data: ParticipationReport }) {
  return (
    <>
      <Chart
        bars={participationBars(data.counts)}
        caption={participationBars(data.counts) ? "Situações das inscrições. A soma confere com o total." : "O gráfico ficou de fora porque a soma das situações não confere com o total."}
        format={(value) => String(value)}
      />
      <p className={s.notice}>Inscrições: {data.counts.registrations ?? "—"} · Menores omitidos: {data.counts.minorsOmitted ?? "—"}</p>
      <div className={s.table}>
        {data.rows.map((row) => (
          <article key={row.registrationId}>
            <h3>{row.eventName || "Evento"}</h3>
            <p>{publicLabel(row)} · {labelOf(row.status)} · {row.partySize} pessoa(s)</p>
          </article>
        ))}
        {data.rows.length === 0 && <p>Nenhuma inscrição adulta neste filtro.</p>}
      </div>
    </>
  );
}

function CostBody({ data }: { data: MinistryCostReport }) {
  const bars = costBars(data.series, data.seriesMatch);
  return (
    <>
      <p className={s.notice}>{data.note}</p>
      {!data.seriesMatch && <p className={s.blocked} role="alert">A série não confere com as linhas. O gráfico ficou de fora.</p>}
      <Chart
        bars={bars}
        caption={bars ? "Custo dos ministérios com centro de custo vinculado. Os demais não entram como zero." : "Sem gráfico: nenhum ministério deste escopo tem centro de custo vinculado, ou a série não conferiu."}
        format={(value) => formatBRL(value)}
      />
      <div className={s.table}>
        {data.rows.map((row) => (
          <article key={row.ministryId}>
            <h3>{row.name}</h3>
            <p>{row.note}</p>
            <p>
              {row.attributed && row.expenseCents !== null
                ? <>Custo consultado: <strong>{formatBRL(row.expenseCents)}</strong> · Lançamentos aprovados: {row.approvedEntries}</>
                : "Custo não calculado"}
            </p>
          </article>
        ))}
        {data.rows.length === 0 && <p>Nenhum ministério autorizado nesta consulta.</p>}
      </div>
    </>
  );
}
