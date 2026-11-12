"use client";

import { useState, type ReactNode } from "react";
import { AppNavLink, UIIcon } from "./AppShell";
import { formatBRL } from "../lib/das-operations";
import type { IndicatorCounts, NamedRow, StatusBar } from "./PersonaHome";
import type { TreasuryPosition } from "./TreasuryPanel";
import { PageHeader } from "./ui/PageHeader";
import ui from "./ui/ui.module.css";
import s from "./administrative-overview.module.css";

type Props = {
  counts: IndicatorCounts | null;
  distribution: StatusBar[] | null;
  admissions: NamedRow[] | null;
  events: NamedRow[] | null;
  treasuryPosition?: TreasuryPosition | null;
  loading: boolean;
  partial: boolean;
  signedOut: boolean;
  onRefresh: () => void;
};

const MEMBER_STATES = [
  { status: "ACTIVE", label: "Ativos", color: "#346f61" },
  { status: "INACTIVE", label: "Inativos", color: "#b7c5c3" },
  { status: "PENDING_ADMISSION", label: "Em admissão", color: "#d8ac62" },
  { status: "TRANSFERRED", label: "Transferidos", color: "#7389ad" },
];

function dayKey(value: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

function countLabel(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : value.toLocaleString("pt-BR");
}

function Section({
  title,
  action,
  children,
  id,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section className={`${s.section} ${className}`} id={id}>
      <header className={s.sectionHead}>
        <div>
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Congregation({
  rows,
  loading,
}: {
  rows: StatusBar[] | null;
  loading: boolean;
}) {
  const [highlight, setHighlight] = useState<string | null>(null);
  if (!rows)
    return (
      <p className={s.empty}>
        {loading ? "Carregando vínculos…" : "Distribuição indisponível."}
      </p>
    );
  const parts = MEMBER_STATES.map((item) => ({
    ...item,
    value: rows.find((row) => row.status === item.status)?.count ?? 0,
  }));
  const total = parts.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  const arcs = parts.map((item) => {
    const fraction = total > 0 ? (item.value / total) * 100 : 0;
    const arc = { ...item, fraction, offset };
    offset += fraction;
    return arc;
  });
  const selected = parts.find((item) => item.status === highlight);
  return (
    <div className={s.congregation}>
      <div className={s.ring} aria-hidden="true">
        <svg viewBox="0 0 200 200">
          <circle
            cx="100"
            cy="100"
            r="84"
            fill="none"
            stroke="#edf2ef"
            strokeWidth="14"
          />
          {arcs
            .filter((item) => item.value > 0)
            .map((item) => (
              <circle
                key={item.status}
                cx="100"
                cy="100"
                r="84"
                fill="none"
                stroke={item.color}
                strokeWidth={highlight === item.status ? "18" : "14"}
                pathLength="100"
                strokeDasharray={`${Math.max(0, item.fraction - (arcs.filter((arc) => arc.value > 0).length > 1 ? 1.2 : 0))} 100`}
                strokeDashoffset={-item.offset}
                transform="rotate(-90 100 100)"
                opacity={highlight && highlight !== item.status ? 0.3 : 1}
              />
            ))}
        </svg>
        <div>
          <small>{selected ? selected.label : "Pessoas cadastradas"}</small>
          <strong>{countLabel(selected?.value ?? total)}</strong>
        </div>
      </div>
      <ul className={s.memberLegend} aria-label="Distribuição dos vínculos">
        {parts
          .filter((item) => item.status !== "TRANSFERRED" || item.value > 0)
          .map((item) => (
            <li key={item.status}>
              <AppNavLink
                href={`/app/secretaria/pessoas/?situacao=${item.status}`}
                onMouseEnter={() => setHighlight(item.status)}
                onMouseLeave={() => setHighlight(null)}
                onFocus={() => setHighlight(item.status)}
                onBlur={() => setHighlight(null)}
              >
                <i style={{ background: item.color }} aria-hidden="true" />
                <span>{item.label}</span>
                <strong>{countLabel(item.value)}</strong>
                <small>
                  {total > 0
                    ? ((item.value / total) * 100).toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })
                    : "0"}
                  %
                </small>
              </AppNavLink>
            </li>
          ))}
      </ul>
    </div>
  );
}

function Calendar({
  events,
  loading,
}: {
  events: NamedRow[] | null;
  loading: boolean;
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const today = dayKey(new Date());
  const [year, month] = today.split("-").map(Number);
  const monthDate = new Date(Date.UTC(year, month - 1 + monthOffset, 1, 15));
  const firstDay = (monthDate.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(
    Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const datedEvents = (events ?? []).filter(
    (row) => row.when && Number.isFinite(Date.parse(row.when)),
  );
  const eventDays = new Set(
    datedEvents.map((row) => dayKey(new Date(row.when!))),
  );
  const visibleEvents = datedEvents
    .filter((row) =>
      selectedDay
        ? dayKey(new Date(row.when!)) === selectedDay
        : Date.parse(row.when!) >= Date.now() - 3_600_000,
    )
    .sort((a, b) => Date.parse(a.when!) - Date.parse(b.when!))
    .slice(0, 3);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthDate);
  function moveMonth(direction: number) {
    setMonthOffset((value) => value + direction);
    setSelectedDay(null);
  }
  return (
    <Section title="Agenda da igreja" className={s.calendarSection}>
      <div className={s.monthHead}>
        <strong>{monthLabel}</strong>
        <div>
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => moveMonth(-1)}
          >
            <span className={s.chevronBack}>
              <UIIcon name="chevron" size={16} />
            </span>
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => moveMonth(1)}
          >
            <UIIcon name="chevron" size={16} />
          </button>
        </div>
      </div>
      <div className={s.calendar} aria-label={monthLabel}>
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day, i) => (
          <span className={s.weekday} key={i} aria-hidden="true">
            {day}
          </span>
        ))}
        {Array.from({ length: firstDay }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = new Date(
            Date.UTC(
              monthDate.getUTCFullYear(),
              monthDate.getUTCMonth(),
              i + 1,
              15,
            ),
          );
          const key = dayKey(date);
          const marked = eventDays.has(key);
          return (
            <button
              key={key}
              type="button"
              aria-label={`${i + 1} de ${monthLabel}${marked ? ", com evento" : ""}`}
              aria-current={key === today ? "date" : undefined}
              aria-pressed={selectedDay === key}
              data-event={marked || undefined}
              onClick={() => setSelectedDay(selectedDay === key ? null : key)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className={s.agendaHeading}>
        <span>
          {selectedDay ? "Encontros nesta data" : "A seguir na agenda"}
        </span>
        {selectedDay && (
          <button type="button" onClick={() => setSelectedDay(null)}>
            Ver próximos
          </button>
        )}
      </div>
      {events === null ? (
        <p className={s.empty}>
          {loading ? "Carregando a agenda…" : "Agenda indisponível."}
        </p>
      ) : visibleEvents.length === 0 ? (
        <p className={s.empty}>
          {selectedDay
            ? "Nenhum encontro publicado nesta data."
            : "Nenhum encontro próximo publicado."}
        </p>
      ) : (
        <ul className={s.agendaList}>
          {visibleEvents.map((event) => {
            const date = new Date(event.when!);
            const day = new Intl.DateTimeFormat("pt-BR", {
              day: "2-digit",
              timeZone: "America/Sao_Paulo",
            }).format(date);
            const month = new Intl.DateTimeFormat("pt-BR", {
              month: "short",
              timeZone: "America/Sao_Paulo",
            })
              .format(date)
              .replace(".", "");
            const time = new Intl.DateTimeFormat("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Sao_Paulo",
            }).format(date);
            return (
              <li key={event.id}>
                <AppNavLink href="/app/eventos-gestao/">
                  <span className={s.eventDate}>
                    <strong>{day}</strong>
                    <small>{month}</small>
                  </span>
                  <span className={s.eventText}>
                    <strong>{event.title}</strong>
                    <small>
                      <UIIcon name="clock" size={12} />
                      {time} · {event.detail}
                    </small>
                  </span>
                </AppNavLink>
              </li>
            );
          })}
        </ul>
      )}
      <AppNavLink className={s.calendarLink} href="/app/eventos-gestao/">
        Abrir agenda completa <UIIcon name="arrow" size={16} />
      </AppNavLink>
    </Section>
  );
}

export function AdministrativeOverview({
  counts,
  distribution,
  admissions,
  events,
  treasuryPosition,
  loading,
  partial,
  signedOut,
  onRefresh,
}: Props) {
  const valueFor = (status: string) =>
    distribution === null
      ? null
      : (distribution.find((row) => row.status === status)?.count ?? 0);
  const cards = [
    {
      title: "Membros ativos",
      value: counts?.membershipsActive ?? valueFor("ACTIVE"),
      icon: "people" as const,
      href: "/app/secretaria/pessoas/?situacao=ACTIVE",
      color: "green",
    },
    {
      title: "Membros inativos",
      value: valueFor("INACTIVE"),
      icon: "family" as const,
      href: "/app/secretaria/pessoas/?situacao=INACTIVE",
      color: "slate",
    },
    {
      title: "Em admissão",
      value: counts?.membershipsPending ?? valueFor("PENDING_ADMISSION"),
      icon: "layers" as const,
      href: "/app/secretaria/admissoes/",
      color: "gold",
    },
    {
      title: "Escalas publicadas",
      value: counts?.rostersPublished,
      icon: "calendar" as const,
      href: "/app/ministerios/",
      color: "blue",
    },
  ];
  const pendingAdmissions = (admissions ?? []).filter(
    (row) => !["Aprovado", "Recusado", "Cancelado"].includes(row.detail),
  );
  const stages = [
    "Rascunho",
    "Documentação",
    "Com a secretaria",
    "Com o pastor",
  ];
  return (
    <div
      className={s.dashboard}
      data-desk="PLATFORM_ADMIN"
      data-layout="admin"
      data-dashboard="administrative-overview"
    >
      <PageHeader
        appearance="workspace"
        heading="h1"
        title="Painel administrativo"
        actions={
            <button
              type="button"
              aria-label="Atualizar painel"
              className={ui.workspaceQuiet}
              disabled={loading}
              onClick={onRefresh}
            >
              <UIIcon name="refresh" size={16} />{" "}
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
        }
      />
      {partial && (
        <p className={s.notice} role="status">
          Parte dos dados está indisponível. Selecione Atualizar para tentar de novo.
        </p>
      )}
      {signedOut && (
        <p className={s.notice} role="status">
          Entre novamente para consultar os registros.
        </p>
      )}
      <section
        className={s.metrics}
        aria-label="Indicadores"
        aria-busy={loading}
      >
        {cards.map((card) => (
          <AppNavLink href={card.href} key={card.title} className={s.metric}>
            <span className={s.metricTop}>
              <span className={s.metricIcon} data-tone={card.color}>
                <UIIcon name={card.icon} size={19} />
              </span>
              <span>{card.title}</span>
              <UIIcon name="chevron" size={15} />
            </span>
            <strong className={s.metricValue}>{countLabel(card.value)}</strong>
          </AppNavLink>
        ))}
      </section>
      <section
        className={s.priorities}
        id="avisos"
        aria-labelledby="operations-title"
      >
        <header className={s.priorityHeader}>
          <h2 id="operations-title">Pendências de escala</h2>
        </header>
        <div className={s.priorityList}>
          {[
            {
              title: "Convites aguardando confirmação",
              value: counts?.rosterAssignmentsPending,
              href: "/app/ministerios/",
              icon: "clock" as const,
            },
            {
              title: "Escalas em preparação",
              value: counts?.rostersDraft,
              href: "/app/ministerios/",
              icon: "calendar" as const,
            },
          ].map((item) => (
            <AppNavLink key={item.title} href={item.href}>
              <span className={s.priorityIcon}>
                <UIIcon name={item.icon} size={21} />
              </span>
              <span className={s.priorityText}>{item.title}</span>
              <strong className={s.priorityValue}>
                {countLabel(item.value)}
              </strong>
              <UIIcon name="arrow" size={16} />
            </AppNavLink>
          ))}
        </div>
      </section>
      <div className={s.layout}>
        <div className={s.main}>
          {treasuryPosition !== undefined && (
            <Section title="Posição financeira" className={s.finance}>
              {treasuryPosition === null ? (
                <p className={s.empty} role="status">
                  {loading ? "Consultando a Tesouraria…" : "Posição financeira indisponível."}
                </p>
              ) : (
                <>
                  <dl className={s.financeValues}>
                    <div><dt>Disponível</dt><dd>{formatBRL(treasuryPosition.availableCents)}</dd></div>
                    <div><dt>Caixa liquidado</dt><dd>{formatBRL(treasuryPosition.settledCashCents)}</dd></div>
                    <div><dt>Compromissos</dt><dd>{formatBRL(treasuryPosition.committedExpenseCents)}</dd></div>
                  </dl>
                  <p className={s.financeSource}>Consolidado dos lançamentos da Tesouraria.</p>
                </>
              )}
            </Section>
          )}
          <Section
            title="Pessoas da congregação"
            action={
              <AppNavLink className={s.textLink} href="/app/secretaria/indicadores/">
                Ver indicadores <UIIcon name="arrow" size={15} />
              </AppNavLink>
            }
          >
            <Congregation rows={distribution} loading={loading} />
          </Section>
          <Section
            title="Admissões por etapa"
            action={
              <AppNavLink
                className={s.textLink}
                href="/app/secretaria/admissoes/"
              >
                Ver admissões <UIIcon name="arrow" size={15} />
              </AppNavLink>
            }
          >
            {admissions === null ? (
              <p className={s.empty}>
                {loading
                  ? "Carregando os protocolos…"
                  : "Etapas indisponíveis."}
              </p>
            ) : pendingAdmissions.length === 0 ? (
              <p className={s.empty}>Nenhum protocolo em andamento.</p>
            ) : (
              <>
                <p className={s.flowSummary}>
                  <strong>{countLabel(pendingAdmissions.length)}</strong>
                  <span>protocolos em andamento</span>
                </p>
                <div
                  className={s.admissionFlow}
                  aria-label="Etapas de admissão"
                >
                  {stages.map((stage) => {
                    const count = pendingAdmissions.filter(
                      (row) => row.detail === stage,
                    ).length;
                    return (
                      <div className={s.stage} key={stage}>
                        <span className={s.stageLabel}>
                          {stage}
                          <strong>{countLabel(count)}</strong>
                        </span>
                        <span className={s.stageTrack}>
                          <span
                            style={{
                              width: `${(count / pendingAdmissions.length) * 100}%`,
                            }}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Section>
        </div>
        <aside className={s.side} aria-label="Agenda da igreja">
          <Calendar events={events} loading={loading} />
        </aside>
      </div>
    </div>
  );
}
