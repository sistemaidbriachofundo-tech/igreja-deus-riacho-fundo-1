"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppNavLink, AppShell, UIIcon, usePersonaAccess } from "./AppShell";
import { ApiRequestError, apiGet, isForbidden, isUnauthorized, loadStoredToken } from "../lib/api";
import { readPanel } from "../lib/panel-read";
import { areasForRoles, isMemberOnly, type AppNavKey } from "../lib/persona-navigation";
import {
  currentPublishedEvents,
  formatPortalDate,
  parsePublishedHome,
} from "../lib/portal-live-data";
import { usePublishedResource } from "../lib/use-published-resource";
import s from "./persona-home.module.css";

type DeskKey =
  | "PLATFORM_ADMIN"
  | "SECRETARIA"
  | "PASTOR"
  | "TESOURARIA"
  | "LIDER_MINISTERIO"
  | "EDITOR_SITE"
  | "PUBLICADOR_SITE"
  | "MEMBRO";

const DESK_ORDER: readonly DeskKey[] = [
  "PLATFORM_ADMIN",
  "SECRETARIA",
  "PASTOR",
  "TESOURARIA",
  "LIDER_MINISTERIO",
  "EDITOR_SITE",
  "PUBLICADOR_SITE",
  "MEMBRO",
];

const DESK: Record<DeskKey, { title: string; lede: string }> = {
  PLATFORM_ADMIN: {
    title: "Mesa da administração",
    lede: "Pessoas, admissões, ministérios e a agenda da congregação.",
  },
  SECRETARIA: {
    title: "Mesa da secretaria",
    lede: "Admissões, pessoas e credenciais que pedem a sua atenção.",
  },
  PASTOR: {
    title: "Mesa pastoral",
    lede: "Cuidado da congregação, admissões e a vida dos ministérios.",
  },
  TESOURARIA: {
    title: "Mesa da tesouraria",
    lede: "Contas e lançamentos registrados para esta congregação.",
  },
  LIDER_MINISTERIO: {
    title: "Mesa da liderança",
    lede: "Ministérios, escalas e compromissos da sua equipe.",
  },
  EDITOR_SITE: {
    title: "Mesa de edição",
    lede: "Rascunhos e conteúdos da igreja, prontos para revisar.",
  },
  PUBLICADOR_SITE: {
    title: "Mesa de publicação",
    lede: "O que já pode ir ao ar no site da igreja.",
  },
  MEMBRO: {
    title: "Seu espaço",
    lede: "Sua carteirinha, sua escala e a agenda da igreja.",
  },
};

const TASK_LABEL: Partial<Record<AppNavKey, string>> = {
  membros: "Consultar pessoas",
  secretaria: "Ver admissões",
  carteirinha: "Abrir carteirinha",
  ministerios: "Ver ministérios",
  escalas: "Louvor",
  atmosfera: "Atmosfera",
  "meu-espaco": "Minha escala",
  tesouraria: "Abrir tesouraria",
  editorial: "Ver conteúdos",
  site: "Abrir o site",
};

const PRIMARY_TASKS: Record<DeskKey, readonly AppNavKey[]> = {
  PLATFORM_ADMIN: ["membros", "secretaria", "carteirinha", "editorial"],
  SECRETARIA: ["membros", "secretaria", "carteirinha"],
  PASTOR: ["secretaria", "membros", "ministerios"],
  TESOURARIA: ["tesouraria"],
  LIDER_MINISTERIO: ["ministerios"],
  EDITOR_SITE: ["site"],
  PUBLICADOR_SITE: ["site"],
  MEMBRO: ["carteirinha", "meu-espaco"],
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativos",
  INACTIVE: "Inativos",
  PENDING_ADMISSION: "Em admissão",
  TRANSFERRED: "Transferidos",
  DRAFT: "Rascunho",
  AWAITING_DOCUMENTS: "Documentação",
  AWAITING_SECRETARIA: "Com a secretaria",
  AWAITING_PASTOR: "Com o pastor",
  APPROVED: "Aprovado",
  REJECTED: "Recusado",
  CANCELLED: "Cancelado",
  PENDING: "A confirmar",
  CONFIRMED: "Confirmada",
  DECLINED: "Recusada",
  SUBSTITUTED: "Substituída",
  PENDING_APPROVAL: "Aguardando aprovação",
  ASSET: "Ativo",
  LIABILITY: "Passivo",
  EQUITY: "Patrimônio",
  REVENUE: "Receita",
  EXPENSE: "Despesa",
  RASCUNHO: "Rascunho",
  PUBLICADO: "Publicado",
  PUBLISHED: "Publicado",
  BATISMO: "Batismo",
  TRANSFERENCIA: "Transferência",
  RECONCILIACAO: "Reconciliação",
  OUTRO: "Outro",
};

export type IndicatorCounts = {
  membershipsActive: number | null;
  membershipsPending: number | null;
  visitorsActive: number | null;
  admissionsOpen: number | null;
  transfersOpen: number | null;
  pastoralOpen: number | null;
  ministriesTotal: number | null;
  ministriesPublished: number | null;
  eventsPublished: number | null;
  eventsPublishedUpcoming: number | null;
  rostersDraft: number | null;
  rostersPublished: number | null;
  rosterAssignmentsPending: number | null;
};

export type StatusBar = { status: string; count: number };
export type NamedRow = { id: string; title: string; detail: string; when?: string };
export type OwnCard =
  | { state: "absent" }
  | { state: "active"; name: string };
export type MoneyRow = { id: string; title: string; detail: string; amountCents: number };

const COUNT_KEYS = [
  "membershipsActive",
  "membershipsPending",
  "visitorsActive",
  "admissionsOpen",
  "transfersOpen",
  "pastoralOpen",
  "ministriesTotal",
  "ministriesPublished",
  "eventsPublished",
  "eventsPublishedUpcoming",
  "rostersDraft",
  "rostersPublished",
  "rosterAssignmentsPending",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function labelOf(value: string | null | undefined): string {
  if (!value) return "Registrado";
  return STATUS_LABEL[value] ?? "Registrado";
}

export function deskKeyFor(roles: readonly string[]): DeskKey {
  return DESK_ORDER.find(role => roles.includes(role)) ?? "MEMBRO";
}

export function parseIndicatorCounts(value: unknown): IndicatorCounts | null {
  const counts = asRecord(asRecord(value)?.counts);
  if (!counts) return null;
  const read = (key: (typeof COUNT_KEYS)[number]) => {
    if (!(key in counts)) return null;
    return finite(counts[key]);
  };
  const parsed = {} as IndicatorCounts;
  for (const key of COUNT_KEYS) parsed[key] = read(key);
  return parsed;
}

export function parseMembershipBars(value: unknown): StatusBar[] | null {
  const byStatus = asRecord(asRecord(value)?.byStatus);
  if (!byStatus) return null;
  return Object.entries(byStatus).flatMap(([status, count]) => {
    const n = finite(count);
    return n !== null && n >= 0 ? [{ status, count: n }] : [];
  });
}

function rowsFrom(value: unknown, key: string): unknown[] | null {
  const row = asRecord(value);
  if (!row || !Array.isArray(row[key])) return null;
  return row[key] as unknown[];
}

export function parseAdmissions(value: unknown): NamedRow[] | null {
  const list = rowsFrom(value, "admissions");
  if (!list) return null;
  return list.flatMap(item => {
    const row = asRecord(item);
    const id = text(row?.id);
    if (!id) return [];
    const modality = labelOf(text(row?.modality));
    const status = labelOf(text(row?.status));
    return [{
      id,
      title: modality === "Registrado" ? "Admissão em aberto" : modality,
      detail: status,
      when: text(row?.personId) ?? undefined,
    }];
  });
}

export function parsePeople(value: unknown): NamedRow[] | null {
  const list = rowsFrom(value, "memberships");
  if (!list) return null;
  return list.flatMap(item => {
    const row = asRecord(item);
    const person = asRecord(row?.person);
    const id = text(person?.id) ?? text(row?.id);
    const name = text(person?.displayName);
    if (!id || !name) return [];
    const credential = text(row?.activeCredentialId);
    return [{
      id,
      title: name,
      detail: credential ? "Carteirinha ativa" : labelOf(text(row?.status) ?? text(person?.status)),
    }];
  });
}

export function parseMinistries(value: unknown): NamedRow[] | null {
  const list = rowsFrom(value, "ministries");
  if (!list) return null;
  return list.flatMap(item => {
    const row = asRecord(item);
    const id = text(row?.id);
    const name = text(row?.name);
    if (!id || !name) return [];
    return [{
      id,
      title: name,
      detail: text(row?.scheduleText) ?? labelOf(text(row?.publishStatus)),
      when: text(row?.slug) ?? undefined,
    }];
  });
}

export function parseEvents(value: unknown): NamedRow[] | null {
  const list = rowsFrom(value, "events");
  if (!list) return null;
  return list.flatMap(item => {
    const row = asRecord(item);
    const id = text(row?.id);
    const name = text(row?.name);
    const startsAt = text(row?.startsAt);
    if (!id || !name || !startsAt || !Number.isFinite(Date.parse(startsAt))) return [];
    return [{
      id,
      title: name,
      detail: text(row?.locationText) ?? formatPortalDate(startsAt).dayAndTime,
      when: startsAt,
    }];
  });
}

export function parseAssignments(value: unknown): NamedRow[] | null {
  const list = rowsFrom(value, "assignments");
  if (!list) return null;
  return list.flatMap(item => {
    const row = asRecord(item);
    const id = text(row?.id);
    const title = text(row?.title);
    const serviceAt = text(row?.serviceAt);
    if (!id || !title) return [];
    const ministry = text(row?.ministryName);
    const role = text(row?.roleLabel);
    return [{
      id,
      title,
      detail: [ministry, role, labelOf(text(row?.status))].filter(Boolean).join(" · "),
      when: serviceAt ?? undefined,
    }];
  });
}

/** Lê só nome e situação. O conteúdo do QR não entra no painel. */
export function parseOwnCard(value: unknown): OwnCard | null {
  const row = asRecord(value);
  if (!row || !("card" in row)) return null;
  if (row.card === null) return { state: "absent" };
  const card = asRecord(row.card);
  if (!card) return null;
  return { state: "active", name: text(card.displayName) ?? "Carteirinha ativa" };
}

export function parseAccounts(value: unknown): NamedRow[] | null {
  const list = rowsFrom(value, "accounts");
  if (!list) return null;
  return list.flatMap(item => {
    const row = asRecord(item);
    const id = text(row?.id);
    const name = text(row?.name);
    if (!id || !name) return [];
    const code = text(row?.code);
    return [{
      id,
      title: name,
      detail: [code, labelOf(text(row?.type))].filter(Boolean).join(" · "),
    }];
  });
}

export function parseEntries(value: unknown): MoneyRow[] | null {
  const list = rowsFrom(value, "entries");
  if (!list) return null;
  return list.flatMap(item => {
    const row = asRecord(item);
    const id = text(row?.id);
    const title = text(row?.description);
    const amountCents = finite(row?.amountCents);
    if (!id || !title || amountCents === null) return [];
    return [{
      id,
      title,
      detail: labelOf(text(row?.status)),
      amountCents,
    }];
  });
}

export function parseContents(value: unknown): NamedRow[] | null {
  const list = rowsFrom(value, "contents");
  if (!list) return null;
  return list.flatMap(item => {
    const row = asRecord(item);
    const id = text(row?.id);
    const title = text(row?.title);
    if (!id || !title) return [];
    return [{ id, title, detail: labelOf(text(row?.status)) }];
  });
}

function hasRole(roles: readonly string[], ...need: string[]) {
  return need.some(role => roles.includes(role));
}

function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: "America/Sao_Paulo",
  }).format(now));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function spDayKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(value);
  return parts;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  const letters = (first + last).toLocaleUpperCase("pt-BR");
  return letters || "•";
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function upcoming(rows: NamedRow[], now = Date.now()): NamedRow[] {
  return rows
    .filter(row => !row.when || Date.parse(row.when) >= now - 60 * 60 * 1000)
    .sort((a, b) => Date.parse(a.when ?? "") - Date.parse(b.when ?? ""))
    .slice(0, 4);
}

type Slot<T> = { state: "skip" | "loading" | "ready" | "empty" | "error" | "unauthorized"; data: T | null };

const skip = <T,>(): Slot<T> => ({ state: "skip", data: null });

/** 403 some com o bloco. 401 encerra a mesa. Outra falha não vira zero. */
export function readFailure(error: unknown): "forbidden" | "unauthorized" | "error" {
  if (isUnauthorized(error) || (error instanceof ApiRequestError && error.status === 401)) return "unauthorized";
  if (isForbidden(error) || (error instanceof ApiRequestError && error.status === 403)) return "forbidden";
  return "error";
}

async function loadSlot<T>(
  token: string,
  path: string,
  parse: (value: unknown) => T | null,
  fresh = false,
): Promise<Slot<T>> {
  try {
    const raw = await readPanel(token, path, () => apiGet<unknown>(path, token), { fresh });
    const data = parse(raw);
    if (data === null) return { state: "error", data: null };
    return { state: "ready", data };
  } catch (error) {
    const failure = readFailure(error);
    if (failure === "forbidden") return skip();
    if (failure === "unauthorized") return { state: "unauthorized", data: null };
    return { state: "error", data: null };
  }
}

/**
 * Leituras da mesa. Antes: resumo, vínculos, admissões, ficha inteira,
 * ministérios (de novo), eventos, escala pessoal e carteirinha, tudo
 * esperando a mais lenta. Agora a ficha e a escala pessoal ficam nas
 * próprias telas, e ministérios é a mesma leitura do menu.
 */
export function dashboardPaths(roles: readonly string[]): string[] {
  const staff = hasRole(roles, "SECRETARIA", "PASTOR", "PLATFORM_ADMIN");
  const leader = hasRole(roles, "LIDER_MINISTERIO");
  const treasury = hasRole(roles, "TESOURARIA");
  const editor = hasRole(roles, "EDITOR_SITE", "PUBLICADOR_SITE");
  const paths: string[] = [];
  if (staff || leader) paths.push("/indicators/summary");
  if (staff) paths.push("/indicators/membership", "/admissions");
  if (staff || leader) paths.push("/ministries", "/events");
  if (isMemberOnly(roles)) paths.push("/rosters/me", "/credentials/me");
  if (treasury) paths.push("/ledger/accounts", "/ledger/entries");
  if (editor && !staff) paths.push("/cms/contents");
  return paths;
}

type Mesa = {
  phase: "idle" | "loading" | "ready" | "signed-out";
  partial: boolean;
  counts: IndicatorCounts | null;
  bars: StatusBar[] | null;
  admissions: NamedRow[] | null;
  people: NamedRow[] | null;
  ministries: NamedRow[] | null;
  events: NamedRow[] | null;
  assignments: NamedRow[] | null;
  card: OwnCard | null;
  accounts: NamedRow[] | null;
  entries: MoneyRow[] | null;
  contents: NamedRow[] | null;
};

const IDLE: Mesa = {
  phase: "idle",
  partial: false,
  counts: null,
  bars: null,
  admissions: null,
  people: null,
  ministries: null,
  events: null,
  assignments: null,
  card: null,
  accounts: null,
  entries: null,
  contents: null,
};

function WeekStrip({ marks }: { marks: ReadonlySet<string> }) {
  const todayKey = spDayKey(new Date());
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
  }).formatToParts(new Date());
  const get = (key: string) => Number(parts.find(part => part.type === key)?.value ?? 0);
  const today = new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 15));
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86400000);
  const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  return (
    <div className={s.week} aria-label="Semana atual">
      {labels.map((label, index) => {
        const date = new Date(monday.getTime() + index * 86400000);
        const key = spDayKey(date);
        const isToday = key === todayKey;
        return (
          <div key={label} className={isToday ? s.weekToday : s.weekDay} aria-current={isToday ? "date" : undefined} data-marked={marks.has(key) ? "true" : undefined}>
            <span>{label}</span>
            <strong>{String(date.getUTCDate()).padStart(2, "0")}</strong>
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label, value, href, hint }: { label: string; value: number | null; href?: string; hint: string }) {
  const body = (
    <>
      <span>{label}</span>
      {value === null ? <em className={s.skeleton} aria-hidden="true" /> : <strong>{value}</strong>}
      <small>{hint}</small>
    </>
  );
  if (!href || value === null) {
    return <article className={s.metric} aria-busy={value === null}>{body}</article>;
  }
  return <AppNavLink className={s.metric} href={href}>{body}</AppNavLink>;
}

function RowList({ rows, hrefFor, empty }: {
  rows: NamedRow[];
  hrefFor: (row: NamedRow) => string;
  empty: string;
}) {
  if (rows.length === 0) return <p className={s.empty}>{empty}</p>;
  return (
    <ul className={s.list}>
      {rows.slice(0, 5).map(row => (
        <li key={row.id}>
          <AppNavLink href={hrefFor(row)}>
            <span className={s.avatar} aria-hidden="true">{initials(row.title)}</span>
            <span className={s.rowText}><strong>{row.title}</strong><small>{row.detail}</small></span>
            <UIIcon name="chevron" size={16} />
          </AppNavLink>
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, action, children, id }: { title: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className={s.panel} id={id} aria-labelledby={id ? `${id}-titulo` : undefined}>
      <header className={s.panelHead}>
        <h2 id={id ? `${id}-titulo` : undefined}>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

const PARSERS = {
  "/indicators/summary": parseIndicatorCounts,
  "/indicators/membership": parseMembershipBars,
  "/admissions": parseAdmissions,
  "/ministries": parseMinistries,
  "/events": parseEvents,
  "/rosters/me": parseAssignments,
  "/credentials/me": parseOwnCard,
  "/ledger/accounts": parseAccounts,
  "/ledger/entries": parseEntries,
  "/cms/contents": parseContents,
} as const;

type MesaPath = keyof typeof PARSERS;

function applyPath(current: Mesa, path: MesaPath, slot: Slot<unknown>): Mesa {
  if (slot.state === "unauthorized") return { ...current, phase: "signed-out", partial: false };
  const next: Mesa = { ...current };
  if (slot.state === "error") next.partial = true;
  if (slot.state !== "ready") return next;
  if (path === "/indicators/summary") next.counts = slot.data as IndicatorCounts;
  if (path === "/indicators/membership") next.bars = slot.data as StatusBar[];
  if (path === "/admissions") next.admissions = slot.data as NamedRow[];
  if (path === "/ministries") next.ministries = slot.data as NamedRow[];
  if (path === "/events") next.events = slot.data as NamedRow[];
  if (path === "/rosters/me") next.assignments = slot.data as NamedRow[];
  if (path === "/credentials/me") next.card = slot.data as OwnCard;
  if (path === "/ledger/accounts") next.accounts = slot.data as NamedRow[];
  if (path === "/ledger/entries") next.entries = slot.data as MoneyRow[];
  if (path === "/cms/contents") next.contents = slot.data as NamedRow[];
  return next;
}

function useMesa(roles: readonly string[], reload: number): Mesa {
  const [mesa, setMesa] = useState<Mesa>(IDLE);
  const signature = roles.join(",");
  useEffect(() => {
    const token = loadStoredToken();
    if (!token) {
      setMesa({ ...IDLE, phase: "signed-out" });
      return;
    }
    const roleList = signature ? signature.split(",") : [];
    const paths = dashboardPaths(roleList).filter((path): path is MesaPath => path in PARSERS);
    let cancelled = false;
    let left = paths.length;
    setMesa({ ...IDLE, phase: paths.length === 0 ? "ready" : "loading" });
    for (const path of paths) {
      const parse = PARSERS[path] as (value: unknown) => unknown;
      void loadSlot(token, path, parse, reload > 0).then(slot => {
        if (cancelled) return;
        left -= 1;
        setMesa(current => {
          if (current.phase === "signed-out" && slot.state !== "unauthorized") return current;
          const next = applyPath(current, path, slot);
          if (next.phase !== "signed-out" && left === 0) next.phase = "ready";
          return next;
        });
      });
    }
    return () => { cancelled = true; };
  }, [signature, reload]);
  return mesa;
}

function PublicAgendaSource({ onRows }: { onRows: (rows: NamedRow[] | null) => void }) {
  const published = usePublishedResource("/public/home", parsePublishedHome);
  useEffect(() => {
    if (published.status === "loading") {
      onRows(null);
      return;
    }
    if (published.status === "ready" && published.data) {
      onRows(currentPublishedEvents(published.data.featuredEvents).map(event => ({
        id: event.id,
        title: event.name,
        detail: event.locationText ?? formatPortalDate(event.startsAt).dayAndTime,
        when: event.startsAt,
      })));
      return;
    }
    onRows([]);
  }, [onRows, published.data, published.status]);
  return null;
}

export function PersonaHome() {
  return (
    <AppShell active="visao" meta="Início">
      <PersonaBoard />
    </AppShell>
  );
}

export function PersonaBoard() {
  const access = usePersonaAccess();
  const [reload, setReload] = useState(0);
  const [publicRows, setPublicRows] = useState<NamedRow[] | null>(null);
  const onPublicRows = useCallback((rows: NamedRow[] | null) => setPublicRows(rows), []);
  const roles = access.kind === "ready" ? access.roles : [];
  const mesa = useMesa(roles, access.kind === "ready" ? reload : 0);
  const showPublicAgenda = access.kind === "ready" && !dashboardPaths(roles).includes("/events");
  if (access.kind !== "ready") return null;

  const deskKey = deskKeyFor(access.roles);
  const desk = DESK[deskKey];
  const memberView = isMemberOnly(access.roles);
  const areas = areasForRoles(access.roles);
  const tasks = PRIMARY_TASKS[deskKey].flatMap(key => {
    const area = areas.find(item => item.key === key);
    return area && TASK_LABEL[key] ? [area] : [];
  });
  const staff = hasRole(access.roles, "SECRETARIA", "PASTOR", "PLATFORM_ADMIN");
  const leader = hasRole(access.roles, "LIDER_MINISTERIO");
  const treasury = hasRole(access.roles, "TESOURARIA");
  const loading = mesa.phase === "idle" || mesa.phase === "loading";
  const counts = mesa.counts;
  const summaryReady = counts !== null;
  const admissions = (mesa.admissions ?? []).filter(row => !["Aprovado", "Recusado", "Cancelado"].includes(row.detail));
  const agenda = mesa.events ?? (showPublicAgenda ? publicRows : null);
  const agendaRows = agenda ? upcoming(agenda) : [];
  const marks = new Set(agendaRows.flatMap(row => row.when ? [spDayKey(new Date(row.when))] : []));
  const showChart = staff && (mesa.bars !== null || loading);
  const pendingAssignments = (mesa.assignments ?? []).filter(row => row.detail.includes("A confirmar"));

  const metrics: Array<{ label: string; value: number | null; href?: string; hint: string }> = [];
  if (staff || leader) {
    if (staff && (summaryReady || loading)) {
      metrics.push(
        { label: "Membros ativos", value: summaryReady ? counts.membershipsActive : null, href: "/app/membros/", hint: "Vínculos ativos" },
        { label: "Admissões em aberto", value: summaryReady ? counts.admissionsOpen : null, href: "/app/secretaria/", hint: "Protocolos em andamento" },
      );
      if (summaryReady && counts.pastoralOpen !== null && counts.pastoralOpen !== undefined) {
        metrics.push({ label: "Cuidado pastoral", value: counts.pastoralOpen, hint: "Acompanhamentos abertos" });
      }
    }
    if (summaryReady || loading) {
      metrics.push(
        { label: "Ministérios", value: summaryReady ? counts.ministriesTotal : null, href: "/app/ministerios/", hint: "Equipes da congregação" },
        { label: "Próximos eventos", value: summaryReady ? counts.eventsPublishedUpcoming : null, href: "/eventos/", hint: "Agenda publicada" },
      );
    }
    if (leader && !staff && (summaryReady || loading)) {
      metrics.push({ label: "Confirmações pendentes", value: summaryReady ? counts.rosterAssignmentsPending : null, href: "/app/ministerios/", hint: "Escalas aguardando resposta" });
    }
  }
  if (treasury) {
    metrics.push(
      { label: "Contas", value: mesa.accounts ? mesa.accounts.length : loading ? null : null, href: "/app/tesouraria/", hint: "Plano registrado" },
      { label: "Lançamentos", value: mesa.entries ? mesa.entries.length : loading ? null : null, href: "/app/tesouraria/", hint: "Movimentos registrados" },
    );
  }
  const visibleMetrics = metrics.filter(item => item.value !== null || loading);

  return (
    <div className={s.board} data-persona-home={access.roles.join(",")} data-desk={deskKey} data-layout={memberView ? "membro" : "admin"}>
      {showPublicAgenda ? <PublicAgendaSource onRows={onPublicRows} /> : null}
      <header className={s.intro}>
        <div>
          <p className={s.greeting}>{greeting()}</p>
          <h1>{desk.title}</h1>
          <p className={s.lede}>{desk.lede}</p>
        </div>
        <div className={s.introAside}>
          <button type="button" className={s.refresh} onClick={() => setReload(value => value + 1)} disabled={mesa.phase === "loading"}>
            <UIIcon name="refresh" size={16} /> Atualizar
          </button>
        </div>
      </header>

      {mesa.partial && <p className={s.note} role="status">Parte da mesa não carregou. O restante continua disponível.</p>}
      {mesa.phase === "signed-out" && <p className={s.note} role="status">Entre novamente para ver os registros da sua conta.</p>}

      <nav className={s.actions} aria-label="Ações rápidas">
        {tasks.map(task => (
          <AppNavLink key={task.key} href={task.href}>{TASK_LABEL[task.key]}</AppNavLink>
        ))}
      </nav>

      {visibleMetrics.length > 0 && (
        <section className={s.metrics} aria-label="Indicadores" aria-busy={loading}>
          {visibleMetrics.map(item => <Metric key={item.label} {...item} />)}
        </section>
      )}

      <div className={s.columns}>
        <Panel
          id="avisos"
          title="Pendências"
          action={staff ? <AppNavLink href="/app/secretaria/">Ver admissões</AppNavLink> : undefined}
        >
          {staff && mesa.admissions === null && loading ? <p className={s.empty}>Carregando pendências…</p> : null}
          {staff && mesa.admissions !== null && (
            <RowList
              rows={admissions}
              hrefFor={() => "/app/secretaria/"}
              empty="Nenhuma admissão em aberto."
            />
          )}
          {memberView && mesa.assignments && (
            pendingAssignments.length > 0
              ? <RowList rows={pendingAssignments} hrefFor={() => "/app/servir/meu-espaco/"} empty="" />
              : <p className={s.empty}>Nenhuma confirmação pendente na sua escala.</p>
          )}
          {memberView && !loading && !mesa.assignments && mesa.card?.state === "absent" && (
            <AppNavLink className={s.inlineLink} href="/app/membros/carteirinha/">Sua carteirinha ainda não foi emitida</AppNavLink>
          )}
          {!staff && !memberView && !treasury && !loading && <p className={s.empty}>Nada pendente nesta mesa.</p>}
          {treasury && !staff && !loading && mesa.entries && mesa.entries.length === 0 && (
            <p className={s.empty}>Nenhum lançamento registrado.</p>
          )}
        </Panel>

        <Panel title="Agenda" action={<AppNavLink href="/eventos/">Ver agenda</AppNavLink>}>
          <WeekStrip marks={marks} />
          {agenda === null ? <p className={s.empty}>Carregando a agenda…</p> : null}
          {agendaRows.length > 0 ? (
            <ul className={s.agenda}>
              {agendaRows.map(event => (
                <li key={event.id}>
                  <AppNavLink href="/eventos/">
                    <span className={s.dateMark}>
                      <strong>{event.when ? formatPortalDate(event.when).day : "—"}</strong>
                      {event.when ? formatPortalDate(event.when).month : ""}
                    </span>
                    <span><strong>{event.title}</strong><small>{event.detail}</small></span>
                  </AppNavLink>
                </li>
              ))}
            </ul>
          ) : agenda !== null ? (
            <p className={s.empty}>Nenhum evento próximo publicado.</p>
          ) : null}
        </Panel>
      </div>

      <div className={s.columns}>
        {showChart && (
          <Panel title="Situação dos vínculos">
            {mesa.bars === null ? <p className={s.empty}>Carregando a distribuição…</p> : mesa.bars.length === 0 ? (
              <p className={s.empty}>Nenhum vínculo registrado.</p>
            ) : (
              <ul className={s.bars} aria-label="Quantidade por situação">
                {mesa.bars.map(bar => (
                  <li key={bar.status}>
                    <span>{labelOf(bar.status)}</span>
                    <span className={s.track}><span style={{ flexGrow: bar.count }} /></span>
                    <strong>{bar.count}</strong>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {(staff || leader) && (
          <Panel title="Ministérios" action={<AppNavLink href="/app/ministerios/">Abrir</AppNavLink>}>
            {mesa.ministries === null ? <p className={s.empty}>Carregando ministérios…</p> : (
              <RowList
                rows={mesa.ministries ?? []}
                hrefFor={row => row.when && /^[a-z0-9-]+$/.test(row.when) ? `/ministerios/${row.when}/` : "/app/ministerios/"}
                empty="Nenhum ministério disponível para este perfil."
              />
            )}
          </Panel>
        )}

        {memberView && mesa.card && (
          <Panel title="Sua carteirinha" action={<AppNavLink href="/app/membros/carteirinha/">Abrir</AppNavLink>}>
            {mesa.card.state === "active" ? (
              <p className={s.cardLine}><span className={s.avatar} aria-hidden="true">{initials(mesa.card.name)}</span><span className={s.rowText}><strong>{mesa.card.name}</strong><small>Carteirinha ativa</small></span></p>
            ) : <p className={s.empty}>Ainda não há carteirinha emitida para você.</p>}
          </Panel>
        )}

        {memberView && mesa.assignments && (
          <Panel title="Minha escala" action={<AppNavLink href="/app/servir/meu-espaco/">Abrir</AppNavLink>}>
            <RowList rows={upcoming(mesa.assignments).length ? upcoming(mesa.assignments) : mesa.assignments.slice(0, 5)} hrefFor={() => "/app/servir/meu-espaco/"} empty="Nenhum compromisso na sua escala." />
          </Panel>
        )}

        {treasury && (
          <Panel title="Lançamentos" action={<AppNavLink href="/app/tesouraria/">Abrir tesouraria</AppNavLink>}>
            {mesa.entries === null ? <p className={s.empty}>Carregando lançamentos…</p> : mesa.entries.length > 0 ? (
              <ul className={s.list}>
                {mesa.entries.slice(0, 5).map(entry => (
                  <li key={entry.id}>
                    <AppNavLink href="/app/tesouraria/">
                      <span className={s.rowText}><strong>{entry.title}</strong><small>{entry.detail}</small></span>
                      <span className={s.money}>{formatCents(entry.amountCents)}</span>
                    </AppNavLink>
                  </li>
                ))}
              </ul>
            ) : <p className={s.empty}>Nenhum lançamento registrado.</p>}
          </Panel>
        )}

        {mesa.contents && (
          <Panel title="Conteúdos" action={<AppNavLink href="/app/site/">Abrir o site</AppNavLink>}>
            <RowList rows={mesa.contents} hrefFor={() => "/app/site/"} empty="Nenhum conteúdo registrado." />
          </Panel>
        )}
      </div>
    </div>
  );
}
