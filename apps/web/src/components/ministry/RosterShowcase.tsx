"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiGetBlob, apiPost } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { rosterCapacitySummary, rosterModuleContains, rosterPositionSummary, type EscalaModuleRules, type EscalaPanel, type MinistryEscala } from "../../lib/ministry-presentation";
import { escalaStatusLabel, meuEspacoHref, ministryHref } from "../../lib/ministry-view";
import { withBasePath } from "../../lib/paths";
import { churchDayKey } from "../../lib/serving-rosters";
import { UIIcon } from "../AppShell";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import { MonthlyRosterPreview } from "./MonthlyRosterPreview";
import { RosterActions, RosterEditor, type RosterActionsProps } from "./RosterEditor";
import { RosterModuleCatalog } from "./RosterModuleCatalog";
import { RosterRecurringAvailability } from "./RosterRecurringAvailability";
import s from "./roster-showcase.module.css";

const churchZone = "America/Sao_Paulo";
const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, weekday: "short" });
const dayNumber = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, weekday: "long", day: "numeric", month: "long" });
const hourLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, hour: "2-digit", minute: "2-digit" });
const monthLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, month: "long", year: "numeric" });

function teamCoverage(roster: MinistryEscala) {
  const positions = roster.positions ?? [];
  const { confirmed, pending, open } = rosterPositionSummary(positions);
  const total = positions.length;
  const tone = roster.status === "DRAFT" ? "draft" : open > 0 ? "open" : pending > 0 ? "pending" : total ? "ready" : "empty";
  const label = tone === "draft" ? "Rascunho" : tone === "open" ? (open === 1 ? "1 vaga" : open + " vagas") :
    tone === "pending" ? "A confirmar" : tone === "ready" ? "Completa" : "Sem postos";
  return { confirmed, pending, open, total, tone, label };
}

function coverageText({ confirmed, pending, total }: ReturnType<typeof teamCoverage>) {
  return total ? confirmed + " de " + total + " confirmadas" + (pending ? " · " + pending + " a confirmar" : "") : "Sem postos cadastrados";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.trim().slice(0, 2)).toLocaleUpperCase("pt-BR");
}

type Props = {
  ministryId: string;
  ministryName: string;
  panel: EscalaPanel;
  escalaId?: string;
  shortcut: { href: string; label: string } | null;
  volunteerPortal: boolean;
  onOpen: (escalaId?: string) => void;
  actions?: RosterActionsProps;
};

export function RosterShowcase({ ministryId, ministryName, panel, escalaId, shortcut, volunteerPortal, onOpen, actions }: Props) {
  const { confirm, confirmation } = useActionConfirmation();
  const [publishing, setPublishing] = useState("");
  const [notice, setNotice] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [tool, setTool] = useState<"modules" | "draw" | "availability" | null>(null);
  const [updatedRules, setUpdatedRules] = useState<Record<string, EscalaModuleRules>>({});
  const [download, setDownload] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const details = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const ready = panel.kind === "ready";
  const visibleRoster = ready && panel.items.some(item => item.id === escalaId);
  useEffect(() => {
    if (escalaId && details.current) {
      const hash = window.location.hash.slice(1);
      const target = /^(posto|trocar)-/.test(hash) ? document.getElementById(hash) : null;
      if (target instanceof HTMLDetailsElement && details.current.contains(target)) target.open = true;
      const fallback = hash.startsWith("trocar-") ? document.getElementById("posto-" + hash.slice(7)) : null;
      const anchor = target ?? fallback;
      const focus = anchor && details.current.contains(anchor) ? anchor : details.current;
      focus.focus({ preventScroll: true });
      focus.scrollIntoView({ block: "start" });
    } else if (returnFocus.current) {
      returnFocus.current.focus();
      returnFocus.current = null;
    }
  }, [escalaId, visibleRoster]);

  if (panel.kind !== "ready") return <p className={s.empty} role="status">{panel.kind === "hidden"
    ? "As escalas deste ministério não foram consultadas." : panel.message}</p>;

  const modules = (panel.modules ?? []).map(module => updatedRules[module.id] ? { ...module, rules: updatedRules[module.id] } : module);
  const selectedModule = modules.find(module => module.id === moduleFilter);
  const moduleNames = new Map(modules.map(module => [module.id, module.name]));
  const months = [...new Map(panel.items.map(roster => [churchDayKey(roster.serviceAt).slice(0, 7), monthLabel.format(new Date(roster.serviceAt))]))];
  const items = panel.items.filter(roster =>
    (!selectedModule || roster.moduleId === selectedModule.id) && (!monthFilter || churchDayKey(roster.serviceAt).startsWith(monthFilter)),
  );
  const now = Date.now();
  const upcoming = items.filter(roster => roster.status !== "CLOSED" && Date.parse(roster.serviceAt) >= now);
  const upcomingIds = new Set(upcoming.map(roster => roster.id));
  const previous = items.filter(roster => !upcomingIds.has(roster.id)).slice().reverse();
  const featured = upcoming[0] ?? previous[0];
  const selected = panel.items.find(roster => roster.id === escalaId);
  const moduleOnly = panel.permissions?.scope === "modules";
  const access = actions && (!moduleOnly || modules.length > 0) && {
    ...actions, modules, moduleId: selectedModule?.id ?? (moduleOnly ? modules[0]?.id : undefined),
    allowGeneral: !moduleOnly,
    requireModuleMembership: volunteerPortal || moduleOnly,
    managedModuleMemberships: panel.permissions?.manageModuleMemberships,
    onOpen: (id: string, nextModuleId?: string) => {
      if (nextModuleId !== undefined) setModuleFilter(nextModuleId);
      onOpen(id);
    },
  };

  async function publish(roster: MinistryEscala) {
    if (!actions || publishing) return;
    setPublishing(roster.id);
    setNotice("");
    setDownloadError("");
    try {
      if (!(await confirm({ title: "Publicar escala?", subject: roster.title,
        description: "A escala ficará disponível para as pessoas escaladas consultarem.", action: "Publicar escala" }))) return;
      await apiPost("/rosters/" + encodeURIComponent(roster.id) + "/publish", actions.token);
      setNotice("Escala publicada.");
      actions.onRefresh();
    } catch (error) {
      setDownloadError(dasError(error));
    } finally {
      setPublishing("");
    }
  }

  async function exportFile(format: "pdf" | "xlsx", roster?: MinistryEscala) {
    if (!actions || download || (format === "pdf" && !roster)) return;
    setDownload(`${roster?.id ?? "list"}-${format}`);
    setDownloadError("");
    try {
      const file = format === "pdf" && roster
        ? await apiGetBlob("/rosters/" + encodeURIComponent(roster.id) + "/pdf", actions.token)
        : await (await import("../../lib/roster-xlsx")).rosterXlsx(roster ? [roster] : items, ministryName, moduleNames,
          new Map(actions.members.map(member => [member.personId, member.displayName])));
      const title = (roster?.title ?? selectedModule?.name ?? ministryName).replace(/[\\/:*?"<>|]/g, "-");
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${roster ? "Escala" : "Escalas"} - ${title}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      setDownloadError(dasError(error));
    } finally {
      setDownload("");
    }
  }

  function exportsFor(roster: MinistryEscala) {
    return actions && <>
      <button type="button" className={s.secondary} disabled={Boolean(download)} onClick={() => void exportFile("pdf", roster)}
        aria-label={`Baixar PDF da escala ${roster.title}`}><UIIcon name="download" size={15} /> {download === roster.id + "-pdf" ? "Gerando…" : "PDF"}</button>
      <button type="button" className={s.secondary} disabled={Boolean(download)} onClick={() => void exportFile("xlsx", roster)}
        aria-label={`Baixar Excel da escala ${roster.title}`}><UIIcon name="grid" size={14} /> {download === roster.id + "-xlsx" ? "Gerando…" : "Excel"}</button>
    </>;
  }

  function openLink(roster: MinistryEscala, lead = false, position?: string, label?: string) {
    const expanded = escalaId === roster.id;
    const expandedPosition = expanded && Boolean(position);
    const id = expanded && !position ? undefined : roster.id;
    const anchor = label === "Trocar" ? "trocar-" : "posto-";
    const path = withBasePath(ministryHref(ministryId, "escalas", id) + (id && position ? `#${anchor}${encodeURIComponent(position)}` : ""));
    return <a href={path}
      aria-expanded={position ? undefined : expanded} aria-controls={expanded ? "roster-selected" : undefined}
      className={lead ? s.primary : s.openCard} onClick={event => {
        if ((id && position && !expandedPosition) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (expandedPosition && position) {
          const focus = document.getElementById(anchor + position) ?? document.getElementById("posto-" + position);
          if (focus instanceof HTMLDetailsElement) focus.open = true;
          history.replaceState(null, "", path);
          focus?.focus({ preventScroll: true });
          focus?.scrollIntoView({ block: "start" });
          return;
        }
        if (id) returnFocus.current = event.currentTarget;
        onOpen(id);
      }}>
      {expanded && !position ? "Fechar detalhes" : label ?? "Abrir escala"} <UIIcon name="arrow" size={15} />
    </a>;
  }

  function whatsAppLink(roster: MinistryEscala) {
    return <button type="button" className={s.openCard} onClick={() => {
      const portal = new URL(withBasePath(meuEspacoHref()), window.location.origin).href;
      const text = `${roster.title} · ${fullDate.format(new Date(roster.serviceAt))} às ${hourLabel.format(new Date(roster.serviceAt))}. Consulte sua escala no Portal do Voluntário: ${portal}`;
      window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
    }}>WhatsApp <span aria-hidden="true">↗</span></button>;
  }

  function card(roster: MinistryEscala) {
    const date = new Date(roster.serviceAt);
    const moduleName = moduleNames.get(roster.moduleId ?? "") ?? "Geral";
    const coverage = teamCoverage(roster);
    return <article className={s.card} key={roster.id} aria-label={roster.title}>
      <div className={s.cardArt}>
        <time dateTime={roster.serviceAt}>{dayLabel.format(date)} · {hourLabel.format(date)}</time>
        <span className={s.status} data-status={roster.status}>{escalaStatusLabel(roster.status)}</span>
        <div><p>{moduleName}</p><h3>{roster.title}</h3></div>
      </div>
      <div className={s.cardBody}>
        <p>{coverageText(coverage)}{coverage.open > 0 ? " · " + coverage.label : ""}</p>
        <div className={s.cardActions}>{openLink(roster)}<div>{exportsFor(roster)}</div></div>
      </div>
    </article>;
  }

  const featuredDate = featured && new Date(featured.serviceAt);
  const featuredModule = moduleNames.get(featured?.moduleId ?? "");
  const nextTeams = featured && upcoming.length ? upcoming.filter(roster => Date.parse(roster.serviceAt) === Date.parse(featured.serviceAt)) : [];
  const featuredPriority = nextTeams.find(roster => teamCoverage(roster).open > 0) ??
    nextTeams.find(roster => teamCoverage(roster).pending > 0) ?? featured;
  const featuredOpen = featuredPriority?.positions?.find(position => !position.assignments.some(item => item.status === "PENDING" || item.status === "CONFIRMED"));
  const priority = featuredPriority && teamCoverage(featuredPriority);
  const priorityTeam = featuredPriority && (moduleNames.get(featuredPriority.moduleId ?? "") ?? "Equipe geral");
  const grouped = new Map<string, MinistryEscala[]>();
  for (const roster of weekOffset === 0 ? upcoming : items) {
    const day = churchDayKey(roster.serviceAt);
    const sameDay = grouped.get(day) ?? [];
    sameDay.push(roster);
    grouped.set(day, sameDay);
  }
  const today = new Date(churchDayKey(new Date(now).toISOString()) + "T00:00:00Z");
  today.setUTCDate(today.getUTCDate() + weekOffset * 7);
  const start = today.toISOString().slice(0, 10);
  today.setUTCDate(today.getUTCDate() + 7);
  const end = today.toISOString().slice(0, 10);
  const nextDays = [...grouped].filter(([day]) => day >= start && day < end);
  const later = weekOffset === 0 ? upcoming.filter(roster => churchDayKey(roster.serviceAt) >= end) : [];
  const periodStart = dayLabel.format(new Date(start + "T12:00:00Z"));
  today.setUTCDate(today.getUTCDate() - 1);
  const periodEnd = dayLabel.format(new Date(today.toISOString().slice(0, 10) + "T12:00:00Z"));
  const heroCapacity = featuredPriority && rosterCapacitySummary(featuredPriority.positions ?? []);
  const unfinishedTeams = nextTeams.filter(roster => roster.id !== featuredPriority?.id && teamCoverage(roster).tone !== "ready").length;
  const previousCards = previous.filter(roster => roster.id !== featured?.id);

  return <div className={s.showcase}>
    {confirmation}
    <div className={s.heroTop}>
      <h2>{moduleOnly && modules.length === 1 ? `Escalas · ${modules[0].name}` : volunteerPortal ? "Escalas do Atmosfera" : "Escalas do ministério"}</h2>
      <div className={s.heroActions}>
        {volunteerPortal && <a className={s.secondary} href={withBasePath(meuEspacoHref())}>Portal do Voluntário <UIIcon name="arrow" size={15} /></a>}
        {shortcut && <a className={s.secondary} href={withBasePath(shortcut.href)}>{shortcut.label}</a>}
        {access && <RosterEditor key={access.moduleId ?? "general"} {...access} buttonClass={s.primary} />}
      </div>
    </div>
    <section className={s.hero} aria-label="Escalas do ministério" data-teams={nextTeams.length > 0}>
      {featured && featuredDate ? <div className={s.heroCopy}>
        <div className={s.heroMeta}><span>{upcoming.length ? "Próximo culto" : "Último culto"}</span><span className={s.status} data-status={featured.status}>{escalaStatusLabel(featured.status)}</span></div>
        <h3>{featured.title}</h3>
        <p><UIIcon name="calendar" size={16} /> <time dateTime={featured.serviceAt}>{fullDate.format(featuredDate)} · {hourLabel.format(featuredDate)}</time>{featuredModule && <span>· {featuredModule}</span>}</p>
        {upcoming.length > 0 && priority && <div className={s.priority}>
          {heroCapacity && <CapacityLine {...heroCapacity} />}
          <p>
          {priority.open ? <><strong>{priority.open} {priority.open === 1 ? "vaga aberta" : "vagas abertas"}</strong><span>· {priorityTeam}</span></> :
            priority.pending ? <><strong>{priority.pending} a confirmar</strong><span>· {priorityTeam}</span></> :
              priority.total ? "Equipe confirmada" : "Postos a definir"}
          </p>
          {unfinishedTeams > 0 && <p>{unfinishedTeams === 1 ? "Outra equipe precisa de atenção." : `${unfinishedTeams} outras equipes precisam de atenção.`}</p>}
        </div>}
        <div className={s.featureActions}>
          {access && featuredPriority && featuredOpen && openLink(featuredPriority, true, featuredOpen.id, featuredPriority.status === "DRAFT" ? "Completar escala" : "Preencher vaga")}
          {openLink(featured, !featuredOpen || !access)}
          {exportsFor(featured)}
        </div>
      </div> : <div className={s.heroCopy}>
        <h3>Nenhuma escala encontrada</h3>
        <p>{panel.items.length ? "Ajuste os filtros para consultar outras escalas." : "Use Nova escala para organizar o próximo culto."}</p>
      </div>}
      {nextTeams.length > 0 && <aside className={s.teamBoard} aria-labelledby="roster-team-heading">
        <h3 id="roster-team-heading">Equipes do culto</h3>
        <ul>{nextTeams.map(roster => {
          const coverage = teamCoverage(roster);
          const names = [...new Set((roster.positions ?? []).flatMap(position => position.assignments
            .filter(item => item.status === "CONFIRMED").flatMap(item => [item.personName, item.partnerName].filter(Boolean))))];
          const name = moduleNames.get(roster.moduleId ?? "") ?? "Equipe geral";
          return <li key={roster.id} data-tone={coverage.tone}>
            <div className={s.teamName}><strong>{name}</strong><span className={s.teamBadge} data-tone={coverage.tone}>{coverage.label}</span></div>
            <CapacityLine {...rosterCapacitySummary(roster.positions ?? [])} />
            <p>{coverageText(coverage)}</p>
            {names.length > 0 && <div className={s.avatars} aria-label={"Confirmaram: " + names.join(", ")} role="img">
              {names.slice(0, 4).map(person => <span key={person} title={person}>{initials(person)}</span>)}
              {names.length > 4 && <span>+{names.length - 4}</span>}
            </div>}
          </li>;
        })}</ul>
      </aside>}
    </section>
    <section className={s.navigation} aria-label="Filtros e ferramentas de escalas">
      <div className={s.filters}>
        <h2 id="roster-week-heading">{weekOffset === 0 ? "Semana à frente" : "Cultos da semana"}</h2>
        <div className={s.weekControls} role="group" aria-label="Navegar por semana">
          <button type="button" className={s.secondary} onClick={() => setWeekOffset(value => value - 1)}>Semana anterior</button>
          <span role="status">{periodStart} a {periodEnd}</span>
          <button type="button" className={s.secondary} onClick={() => setWeekOffset(value => value + 1)}>Próxima semana</button>
        </div>
        {modules.length > 0 && <div className={s.moduleFilters} role="group" aria-label="Módulo da escala">
          <button type="button" aria-pressed={!moduleFilter} onClick={() => setModuleFilter("")}>Todos os módulos</button>
          {modules.map(module => <button type="button" key={module.id} aria-pressed={moduleFilter === module.id}
            onClick={() => setModuleFilter(module.id)}>{module.name}</button>)}
        </div>}
        {!access && months.length > 0 && <label className={s.month}>Mês <select value={monthFilter} onChange={event => setMonthFilter(event.target.value)}>
          <option value="">Todos os meses</option>
          {months.map(([value, name]) => <option value={value} key={value}>{name}</option>)}
        </select></label>}
      </div>
      {access && <div className={s.tools}>
        <div role="group" aria-label="Ferramentas de escala">
          <button type="button" aria-expanded={more} onClick={() => { setMore(!more); if (more) setTool(null); }}><UIIcon name="more" size={16} /> Mais{monthFilter ? " · " + months.find(([value]) => value === monthFilter)?.[1] : ""}</button>
        </div>
        {more && <div className={s.moreActions}>
          {months.length > 0 && <label className={s.month}>Mês <select value={monthFilter} onChange={event => setMonthFilter(event.target.value)}>
            <option value="">Todos os meses</option>
            {months.map(([value, name]) => <option value={value} key={value}>{name}</option>)}
          </select></label>}
          {!moduleOnly && <button type="button" aria-expanded={tool === "modules"} onClick={() => setTool(tool === "modules" ? null : "modules")}><UIIcon name="settings" size={16} /> Módulos e regras</button>}
          {modules.length > 0 && <button type="button" aria-expanded={tool === "draw"} onClick={() => setTool(tool === "draw" ? null : "draw")}><UIIcon name="spark" size={16} /> Sorteio mensal</button>}
          <button type="button" aria-expanded={tool === "availability"} onClick={() => setTool(tool === "availability" ? null : "availability")}><UIIcon name="clock" size={16} /> Disponibilidade semanal</button>
        </div>}
        <button type="button" className={s.listExport} disabled={!items.length || Boolean(download)} onClick={() => void exportFile("xlsx")}>
          <UIIcon name="download" size={16} /> {download === "list-xlsx" ? "Gerando…" : "Excel da lista"}
        </button>
      </div>}
      {access && tool && <div className={s.toolbox} aria-label="Configuração da escala">
        {tool === "modules" && !moduleOnly && <>
          <label className={s.month}>Módulo <select value={moduleFilter} onChange={event => setModuleFilter(event.target.value)}>
            <option value="">Selecionar módulo</option>{modules.map(module => <option value={module.id} key={module.id}>{module.name}</option>)}
          </select></label>
          <RosterModuleCatalog actions={{ ...access, onRulesSaved: rules => {
            if (selectedModule) setUpdatedRules(previousRules => ({ ...previousRules, [selectedModule.id]: rules }));
          } }} modules={modules} selectedId={selectedModule?.id ?? ""} />
        </>}
        {tool === "draw" && <MonthlyRosterPreview token={access.token} ministryId={ministryId} onRefresh={access.onRefresh} />}
        {tool === "availability" && <RosterRecurringAvailability actions={access} />}
      </div>}
    </section>
    {downloadError && <p role="alert" className={s.error}>{downloadError}</p>}
    {selected && <section ref={details} tabIndex={-1} id="roster-selected" className={s.detail} aria-label="Detalhes da escala">
      <header><div><p>{moduleNames.get(selected.moduleId ?? "") ?? "Geral"}</p><h3>{selected.title}</h3></div>
        <div>{exportsFor(selected)}<button type="button" className={s.secondary} onClick={() => onOpen(undefined)}><UIIcon name="close" size={15} /> Fechar</button></div>
      </header>
      {access && <RosterActions key={selected.id} {...access} roster={selected} members={access.members.filter(member => {
        const rosterModule = modules.find(item => item.id === selected.moduleId);
        if (!selected.moduleId) return !moduleOnly;
        return Boolean(rosterModule && rosterModuleContains(rosterModule, member.personId)) ||
          (!access.requireModuleMembership && !rosterModule?.rules?.volunteerIds);
      })} />}
      {!access && <p>{selected.functions.join(" · ") || "Sem posições cadastradas."}</p>}
    </section>}
    {notice && <p role="status" className={s.empty}>{notice}</p>}
    {nextDays.length > 0 ? <section className={s.timeline} aria-label="Próximos cultos">
      {nextDays.map(([day, rosters]) => {
        const date = new Date(rosters[0].serviceAt);
        return <section key={day} className={s.timelineDay} aria-label={fullDate.format(date)}>
          <h3 className={s.timelineDate}><time dateTime={day}><span>{weekday.format(date).replace(".", "")}</span><strong>{dayNumber.format(date)}</strong></time></h3>
          <ul className={s.timelineList}>{rosters.map(roster => {
            const coverage = teamCoverage(roster);
            const vacant = roster.positions?.find(position => !position.assignments.some(item => item.status === "PENDING" || item.status === "CONFIRMED"));
            const staffed = roster.positions?.find(position => position.assignments.some(item =>
              item.status === "PENDING" || item.status === "CONFIRMED",
            ));
            const moduleName = moduleNames.get(roster.moduleId ?? "");
            const firstAction = roster.status === "DRAFT" ? "Completar escala" : "Preencher vaga";
            return <li key={roster.id} data-tone={coverage.tone}>
              <header className={s.timelineHeader}>
                <div><h4>{roster.title} <span>· <time dateTime={roster.serviceAt}>{hourLabel.format(new Date(roster.serviceAt))}</time></span></h4>
                  <p>{moduleName && moduleName + " · "}{coverageText(coverage)}</p>
                  <CapacityLine {...rosterCapacitySummary(roster.positions ?? [])} /></div>
                <span className={s.teamBadge} data-tone={coverage.tone}>{coverage.label}</span>
              </header>
              {coverage.total > 0 && <progress className={s.progress} value={coverage.confirmed} max={coverage.total}
                aria-label={roster.title + " · postos confirmados"} />}
              <div className={s.timelineActions}>
                {access && vacant && openLink(roster, true, vacant.id, firstAction)}
                {access && roster.status === "DRAFT" && !vacant && openLink(roster, true, undefined, firstAction)}
                {access && roster.status === "DRAFT" && coverage.total > 0 &&
                  <button type="button" className={s.secondary} disabled={Boolean(publishing)} onClick={() => void publish(roster)}>Publicar</button>}
                {(roster.status !== "DRAFT" || vacant || !access) && openLink(roster)}
                {access && <details className={s.rowMenu}>
                  <summary aria-label={`Mais ações · ${roster.title}`}>Mais <UIIcon name="more" size={15} /></summary>
                  <div>
                    {roster.status === "PUBLISHED" && staffed && openLink(roster, false, staffed.id, "Trocar")}
                    {roster.status === "PUBLISHED" && whatsAppLink(roster)}
                    {exportsFor(roster)}
                  </div>
                </details>}
              </div>
            </li>;
          })}</ul>
        </section>;
      })}
    </section> : <p role="status" className={s.empty}>Nenhum culto neste período{selectedModule ? " para " + selectedModule.name : ""}.</p>}
    {later.length > 0 && <RosterRail title="Mais datas">{later.map(card)}</RosterRail>}
    {previousCards.length > 0 && <RosterRail title="Escalas anteriores">{previousCards.map(card)}</RosterRail>}
  </div>;
}

function CapacityLine({ single, singleFilled, couples, couplesFilled }: ReturnType<typeof rosterCapacitySummary>) {
  if (!single && !couples) return null;
  const missing = (couples - couplesFilled) * 2 + single - singleFilled;
  const parts = [
    couples > 0 ? `${couplesFilled} de ${couples} ${couples === 1 ? "casal" : "casais"}` : "",
    single > 0 ? `${singleFilled} de ${single} ${single === 1 ? "vaga individual" : "vagas individuais"}` : "",
    missing === 1 ? "falta 1 pessoa" : missing > 1 ? `faltam ${missing} pessoas` : "",
  ];
  return <p className={s.capacityLine}>{parts.filter(Boolean).join(" · ")}</p>;
}

function RosterRail({ title, children }: { title: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  useEffect(() => {
    const row = track.current;
    if (!row) return;
    function measure() {
      if (row) setEdges({ start: row.scrollLeft < 2, end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 2 });
    }
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    return () => { observer.disconnect(); row.removeEventListener("scroll", measure); };
  }, [children]);

  function scroll(direction: number) {
    const row = track.current;
    if (row) row.scrollBy({ left: direction * (row.clientWidth * .82),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  return <section className={s.rail} aria-label={title}>
    <header><h2>{title}</h2>{!(edges.start && edges.end) && <div>
      <button type="button" className={s.previous} disabled={edges.start} onClick={() => scroll(-1)} aria-label={`Voltar em ${title.toLowerCase()}`}><UIIcon name="chevron" size={17} /></button>
      <button type="button" disabled={edges.end} onClick={() => scroll(1)} aria-label={`Avançar em ${title.toLowerCase()}`}><UIIcon name="chevron" size={17} /></button>
    </div>}</header>
    <div className={s.track} ref={track} tabIndex={0} aria-label={`Lista de ${title.toLowerCase()}`}>{children}</div>
  </section>;
}
