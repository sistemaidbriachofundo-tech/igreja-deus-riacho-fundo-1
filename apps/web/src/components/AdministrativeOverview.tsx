"use client";

import { useState, type ReactNode } from "react";
import { AppNavLink, UIIcon } from "./AppShell";
import { ministryContextHref } from "../lib/persona-navigation";
import type { IndicatorCounts, NamedRow, StatusBar } from "./PersonaHome";
import s from "./administrative-overview.module.css";

type Props = {
  counts: IndicatorCounts | null;
  distribution: StatusBar[] | null;
  admissions: NamedRow[] | null;
  ministries: NamedRow[] | null;
  events: NamedRow[] | null;
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
  eyebrow,
  action,
  children,
  id,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section className={`${s.section} ${className}`} id={id}>
      <header className={s.sectionHead}>
        <div>
          {eyebrow && <span className={s.eyebrow}>{eyebrow}</span>}
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
          <small>{selected ? selected.label : "TOTAL DE PESSOAS"}</small>
          <strong>{countLabel(selected?.value ?? total)}</strong>
          <span>{selected ? "na congregação" : "em nossa comunidade"}</span>
        </div>
      </div>
      <ul className={s.memberLegend} aria-label="Distribuição dos vínculos">
        {parts
          .filter((item) => item.status !== "TRANSFERRED" || item.value > 0)
          .map((item) => (
            <li key={item.status}>
              <AppNavLink
                href={`/app/membros/?situacao=${item.status}`}
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
      <p className={s.totalNote}>
        Pessoas e histórias que fazem parte da igreja.{" "}
        <UIIcon name="people" size={16} />
      </p>
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
    <Section
      title="Agenda da igreja"
      eyebrow="PRÓXIMOS ENCONTROS"
      className={s.calendarSection}
    >
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
        {["S", "T", "Q", "Q", "S", "S", "D"].map((day, i) => (
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
  ministries,
  events,
  loading,
  partial,
  signedOut,
  onRefresh,
}: Props) {
  const valueFor = (status: string) =>
    distribution === null
      ? null
      : (distribution.find((row) => row.status === status)?.count ?? 0);
  const total = distribution?.reduce((sum, row) => sum + row.count, 0) ?? null;
  const cards = [
    {
      title: "Membros ativos",
      value: counts?.membershipsActive ?? valueFor("ACTIVE"),
      hint: "Pessoas com vínculo ativo",
      icon: "people" as const,
      href: "/app/membros/?situacao=ACTIVE",
      color: "green",
    },
    {
      title: "Membros inativos",
      value: valueFor("INACTIVE"),
      hint: "Histórico de membresia",
      icon: "family" as const,
      href: "/app/membros/?situacao=INACTIVE",
      color: "slate",
    },
    {
      title: "Em admissão",
      value: counts?.membershipsPending ?? valueFor("PENDING_ADMISSION"),
      hint: "Acompanhar os protocolos",
      icon: "layers" as const,
      href: "/app/secretaria/",
      color: "gold",
    },
    {
      title: "Escalas publicadas",
      value: counts?.rostersPublished,
      hint: `${countLabel(counts?.ministriesTotal)} ministérios na congregação`,
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
      <header className={s.heading}>
        <div>
          <p className={s.eyebrow}>VISÃO GERAL · RIACHO FUNDO I</p>
          <h1>Painel administrativo</h1>
          <p className={s.lede}>
            Pessoas, equipes e os próximos passos da igreja.
          </p>
        </div>
        <div className={s.headingActions}>
          <span className={s.today}>
            <UIIcon name="calendar" size={16} />
            <time>
              {new Intl.DateTimeFormat("pt-BR", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "America/Sao_Paulo",
              }).format(new Date())}
            </time>
          </span>
          <AppNavLink className={s.primaryAction} href="/app/secretaria/">
            <UIIcon name="layers" size={17} />
            <span>Abrir secretaria</span>
            <UIIcon name="arrow" size={16} />
          </AppNavLink>
          <button
            type="button"
            aria-label="Atualizar painel"
            title="Atualizar painel"
            className={s.refresh}
            disabled={loading}
            onClick={onRefresh}
          >
            <UIIcon name="refresh" size={16} />
            <span>Atualizar</span>
          </button>
        </div>
      </header>
      {partial && (
        <p className={s.notice} role="status">
          Algumas informações não carregaram. Use Atualizar para tentar
          novamente.
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
            <span className={s.metricBottom}>
              <span className={s.metricHint}>{card.hint}</span>
              <UIIcon name="arrow" size={15} />
            </span>
          </AppNavLink>
        ))}
      </section>
      <section
        className={s.priorities}
        id="avisos"
        aria-label="Prioridades de trabalho"
      >
        {[
          {
            title: "Admissões em aberto",
            hint: "Conferir protocolos",
            value: counts?.admissionsOpen,
            href: "/app/secretaria/",
            icon: "layers" as const,
          },
          {
            title: "Convites de escala",
            hint: "Aguardando confirmação",
            value: counts?.rosterAssignmentsPending,
            href: "/app/ministerios/",
            icon: "clock" as const,
          },
          {
            title: "Escalas em preparação",
            hint: "Revisar e publicar",
            value: counts?.rostersDraft,
            href: "/app/ministerios/",
            icon: "calendar" as const,
          },
        ].map((item) => (
          <AppNavLink key={item.title} href={item.href}>
            <span className={s.priorityIcon}>
              <UIIcon name={item.icon} size={19} />
            </span>
            <span className={s.priorityText}>
              <strong>{item.title}</strong>
              <small>{item.hint}</small>
            </span>
            <strong className={s.priorityValue}>
              {countLabel(item.value)}
            </strong>
            <UIIcon name="chevron" size={16} />
          </AppNavLink>
        ))}
      </section>
      <div className={s.layout}>
        <div className={s.main}>
          <Section
            title="Nossa comunidade"
            eyebrow="CADA PESSOA IMPORTA"
            action={
              <AppNavLink className={s.textLink} href="/app/membros/">
                Ver cadastros <UIIcon name="arrow" size={15} />
              </AppNavLink>
            }
          >
            <Congregation rows={distribution} loading={loading} />
          </Section>
          <Section
            title="Caminho da admissão"
            eyebrow="ACOLHER E ACOMPANHAR"
            action={
              <AppNavLink className={s.textLink} href="/app/secretaria/">
                Abrir secretaria <UIIcon name="arrow" size={15} />
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
                  <span>
                    protocolos em andamento
                    <br />
                    <small>Distribuição por etapa</small>
                  </span>
                </p>
                <div
                  className={s.admissionFlow}
                  aria-label="Etapas de admissão"
                >
                  {stages.map((stage, index) => {
                    const count = pendingAdmissions.filter(
                      (row) => row.detail === stage,
                    ).length;
                    return (
                      <div className={s.stage} key={stage}>
                        <span className={s.stageLabel}>
                          <i aria-hidden="true">
                            {String(index + 1).padStart(2, "0")}
                          </i>
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
      <Section
        className={s.ministriesSection}
        title="A vida acontece em equipe"
        eyebrow="MINISTÉRIOS DA IGREJA"
        action={
          <AppNavLink className={s.textLink} href="/app/ministerios/">
            Ver todos <UIIcon name="arrow" size={15} />
          </AppNavLink>
        }
      >
        {ministries === null ? (
          <p className={s.empty}>
            {loading ? "Carregando ministérios…" : "Ministérios indisponíveis."}
          </p>
        ) : (
          <ul className={s.ministryList}>
            {ministries.slice(0, 6).map((row, index) => (
              <li key={row.id}>
                <AppNavLink
                  href={ministryContextHref({ id: row.id })}
                  data-tone={index % 4}
                >
                  <span className={s.ministryIcon} aria-hidden="true">
                    {row.title
                      .replace(/^Ministério de /i, "")
                      .slice(0, 2)
                      .toLocaleUpperCase("pt-BR")}
                  </span>
                  <span className={s.ministryText}>
                    <strong>{row.title}</strong>
                    <small>Equipe, escalas e caixa</small>
                  </span>
                  <UIIcon name="arrow" size={17} />
                </AppNavLink>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <footer className={s.footer}>
        <span>ID Riacho 1 · Gestão da igreja</span>
        <span>
          {total === null
            ? "Consultando os registros"
            : `${countLabel(total)} vínculos cadastrados`}
        </span>
      </footer>
    </div>
  );
}
