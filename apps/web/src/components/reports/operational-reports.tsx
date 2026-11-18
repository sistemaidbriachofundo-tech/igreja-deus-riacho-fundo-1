"use client";

import type { ReactNode } from "react";
import { PageHeader } from "../ui/PageHeader";
import { FilterDisclosure } from "../ui/FilterDisclosure";
import { UIIcon, type GlyphName } from "../ui/UIIcon";
import ui from "../ui/ui.module.css";
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

const sections = {
  people: { label: "Pessoas", icon: "people" },
  ministries: { label: "Ministérios", icon: "layers" },
  events: { label: "Eventos", icon: "calendar" },
  costs: { label: "Custos por ministério", icon: "wallet" },
} satisfies Record<string, { label: string; icon: GlyphName }>;

export function OperationalReports(props: {
  notice?: string;
  membership: Slot<MembershipReport>;
  ministries: Slot<MinistryReport>;
  participation: Slot<ParticipationReport>;
  cost: Slot<MinistryCostReport>;
  from: string;
  to: string;
  ministryId: string;
  status: string;
  appliedFilterCount?: number;
  ministryOptions?: Pick<MinistryReport["ministries"][number], "id" | "name">[];
  busy: boolean;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onMinistry: (value: string) => void;
  onStatus: (value: string) => void;
  onApply: () => void;
  onDownload: (report: "membership" | "ministries" | "participation" | "ministry-cost", format: "csv" | "pdf") => void;
}) {
  const ministryOptions = props.ministryOptions ?? (props.ministries.state === "ready" ? props.ministries.data.ministries : []);
  return (
    <div className={s.page}>
      <PageHeader appearance="workspace" heading="h1" title="Relatórios"
        description="Consulte pessoas, ministérios, inscrições em eventos e despesas por ministério."
      />

      <nav className={s.sectionLinks} aria-label="Relatórios disponíveis">
        {Object.entries(sections).map(([id, section]) => <a href={`#report-${id}`} key={id}>
          <span className={s.sectionIcon}><UIIcon name={section.icon} size={19} /></span>
          <span>{section.label}</span><UIIcon name="chevron" size={14} />
        </a>)}
      </nav>

      <FilterDisclosure mobileOnly closeOnSubmit count={props.appliedFilterCount}>
        <form className={s.filters} aria-label="Filtros dos relatórios" onSubmit={(event) => { event.preventDefault(); props.onApply(); }}>
          <fieldset className={s.period}>
            <legend><UIIcon name="calendar" size={15} /> Período</legend>
            <label>De
              <input type="date" value={props.from} onChange={(event) => props.onFrom(event.target.value)} />
            </label>
            <label>Até
              <input type="date" value={props.to} min={props.from || undefined} onChange={(event) => props.onTo(event.target.value)} />
            </label>
          </fieldset>
          <label><span id="report-ministry-label">Ministério</span>
            <select aria-labelledby="report-ministry-label" value={props.ministryId} onChange={(event) => props.onMinistry(event.target.value)}>
              <option value="">Todos</option>
              {ministryOptions.map((ministry) => (
                <option key={ministry.id} value={ministry.id}>{ministry.name}</option>
              ))}
            </select>
          </label>
          <label><span id="report-status-label">Situação do evento</span>
            <select aria-labelledby="report-status-label" value={props.status} onChange={(event) => props.onStatus(event.target.value)}>
              <option value="">Todas</option>
              <option value="PENDING_PAYMENT">Pagamento pendente</option>
              <option value="CONFIRMED">Confirmado</option>
              <option value="CHECKED_IN">Presente</option>
              <option value="CANCELLED">Cancelado</option>
            </select>
          </label>
          <button className={ui.workspacePrimary} type="submit" disabled={props.busy}>
            <UIIcon name="filter" size={17} /> Aplicar filtros
          </button>
        </form>
      </FilterDisclosure>
      {props.notice && <p className={s.blocked} role="alert">{props.notice}</p>}

      <ReportFrame
        section="people"
        slot={props.membership}
        busy={props.busy}
        onCsv={() => props.onDownload("membership", "csv")}
        onPdf={() => props.onDownload("membership", "pdf")}
        render={(data) => <MembershipBody data={data} />}
      />
      <ReportFrame
        section="ministries"
        slot={props.ministries}
        busy={props.busy}
        onCsv={() => props.onDownload("ministries", "csv")}
        onPdf={() => props.onDownload("ministries", "pdf")}
        render={(data) => <MinistryBody data={data} />}
      />
      <ReportFrame
        section="events"
        slot={props.participation}
        busy={props.busy}
        onCsv={() => props.onDownload("participation", "csv")}
        onPdf={() => props.onDownload("participation", "pdf")}
        render={(data) => <ParticipationBody data={data} />}
      />
      <ReportFrame
        section="costs"
        slot={props.cost}
        busy={props.busy}
        onCsv={() => props.onDownload("ministry-cost", "csv")}
        onPdf={() => props.onDownload("ministry-cost", "pdf")}
        render={(data) => <CostBody data={data} />}
      />
    </div>
  );
}

function ReportFrame<T>(props: {
  section: keyof typeof sections;
  slot: Slot<T>;
  busy: boolean;
  onCsv: () => void;
  onPdf: () => void;
  render: (data: T) => ReactNode;
}) {
  const ready = props.slot.state === "ready";
  const { label, icon } = sections[props.section];
  const id = `report-${props.section}`;
  return (
    <section id={id} tabIndex={-1} className={s.panel} aria-labelledby={id + "-title"}>
      <header className={s.panelHeader}>
        <div className={s.panelTitle}>
          <span className={s.panelIcon}><UIIcon name={icon} size={21} /></span>
          <h2 id={id + "-title"}>{label}</h2>
        </div>
        <div className={s.exports} role="group" aria-label={`Exportar: ${label}`}>
          <button className={ui.workspaceQuiet} type="button" aria-label="Exportar CSV" disabled={props.busy || !ready} onClick={props.onCsv}>
            <UIIcon name="grid" size={16} /> CSV
          </button>
          <button className={ui.workspaceQuiet} type="button" aria-label="Exportar PDF" disabled={props.busy || !ready} onClick={props.onPdf}>
            <UIIcon name="download" size={16} /> PDF
          </button>
        </div>
      </header>
      {props.slot.state === "disabled" && <p className={s.notice} role="status">Relatório indisponível neste endereço.</p>}
      {props.slot.state === "signed-out" && <p className={s.notice} role="status">Entre para consultar este relatório.</p>}
      {props.slot.state === "loading" && <p className={s.notice} role="status">Consultando…</p>}
      {props.slot.state === "forbidden" && <p className={s.blocked} role="alert">{props.slot.message}</p>}
      {props.slot.state === "error" && <p className={s.blocked} role="alert">{props.slot.message}</p>}
      {props.slot.state === "ready" && props.render(props.slot.data)}
    </section>
  );
}

function Chart(props: { bars: Bar[] | null; caption: string; format: (value: number) => string }) {
  if (!props.bars) return <p className={s.notice}>{props.caption}</p>;
  if (props.bars.length === 0) return <p className={s.notice}>Nenhum dado para este gráfico no período.</p>;
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
      <dl className={s.highlights}>
        <div><dt>Total de membresias</dt><dd>{data.totalMemberships}</dd></div>
        <div><dt>Visitantes adultos ativos</dt><dd>{data.adultVisitorsActive}</dd></div>
        <div><dt>Menores omitidos</dt><dd>{data.minorsOmitted}</dd></div>
      </dl>
      <Chart bars={bars} caption="Membresia por situação" format={(value) => String(value)} />
      <ul className={s.lines}>
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
        {data.ministries.length === 0 && <p>Nenhum ministério disponível nesta consulta.</p>}
      </div>
    </>
  );
}

function ParticipationBody({ data }: { data: ParticipationReport }) {
  const bars = participationBars(data.counts);
  return (
    <>
      <Chart
        bars={bars}
        caption={bars ? "Inscrições por situação" : "O gráfico ficou de fora porque a soma das situações não confere com o total."}
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
