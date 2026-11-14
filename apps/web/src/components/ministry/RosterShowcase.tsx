"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { apiGetBlob } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { rosterPositionSummary, type EscalaModuleRules, type EscalaPanel, type MinistryEscala } from "../../lib/ministry-presentation";
import { escalaStatusLabel, meuEspacoHref, ministryHref } from "../../lib/ministry-view";
import { withBasePath } from "../../lib/paths";
import { churchDayKey } from "../../lib/serving-rosters";
import { UIIcon } from "../AppShell";
import { MonthlyRosterPreview } from "./MonthlyRosterPreview";
import { RosterActions, RosterEditor, type RosterActionsProps } from "./RosterEditor";
import { RosterModuleCatalog } from "./RosterModuleCatalog";
import { RosterRecurringAvailability } from "./RosterRecurringAvailability";
import s from "./roster-showcase.module.css";

const churchZone = "America/Sao_Paulo";
const dayLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, weekday: "long", day: "numeric", month: "long" });
const hourLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, hour: "2-digit", minute: "2-digit" });
const monthLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, month: "long", year: "numeric" });

function poster(module?: string) {
  const name = module?.toLocaleLowerCase("pt-BR") ?? "";
  const image = name.includes("recep") ? "comunidade" : name.includes("apoio") ? "intercessao" :
    name.includes("conex") ? "comunidade" : name.includes("oferta") ? "adoracao" :
    name.includes("ceia") || name.includes("diacon") ? "ceia" : "templo";
  return { "--roster-poster": `url("${withBasePath(`/images/riacho/${image}.webp`)}")` } as CSSProperties;
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
  const [moduleFilter, setModuleFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [more, setMore] = useState(false);
  const [tool, setTool] = useState<"modules" | "draw" | "availability" | null>(null);
  const [updatedRules, setUpdatedRules] = useState<Record<string, EscalaModuleRules>>({});
  const [download, setDownload] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const details = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const ready = panel.kind === "ready";
  useEffect(() => {
    if (escalaId && details.current) {
      const hash = window.location.hash.slice(1);
      const target = hash.startsWith("posto-") ? document.getElementById(hash) : null;
      const focus = target && details.current.contains(target) ? target : details.current;
      focus.focus({ preventScroll: true });
      focus.scrollIntoView({ block: "start" });
    } else if (returnFocus.current) {
      returnFocus.current.focus();
      returnFocus.current = null;
    }
  }, [escalaId, ready]);

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
  const access = actions && {
    ...actions, modules, moduleId: selectedModule?.id,
    onOpen: (id: string, nextModuleId?: string) => {
      setModuleFilter(nextModuleId ?? "");
      setMonthFilter("");
      onOpen(id);
    },
  };

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
    const id = expanded ? undefined : roster.id;
    return <a href={withBasePath(ministryHref(ministryId, "escalas", id) + (id && position ? `#posto-${encodeURIComponent(position)}` : ""))}
      aria-expanded={expanded} aria-controls={expanded ? "roster-selected" : undefined}
      className={lead ? s.primary : s.openCard} onClick={event => {
        if ((id && position) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (id) returnFocus.current = event.currentTarget;
        onOpen(id);
      }}>
      {expanded ? "Fechar detalhes" : label ?? "Abrir escala"} <UIIcon name="arrow" size={15} />
    </a>;
  }

  function card(roster: MinistryEscala) {
    const date = new Date(roster.serviceAt);
    const moduleName = moduleNames.get(roster.moduleId ?? "") ?? "Geral";
    const coverage = rosterPositionSummary(roster.positions ?? []);
    return <article className={s.card} style={poster(moduleName)} key={roster.id} aria-label={roster.title}>
      <div className={s.cardArt}>
        <time dateTime={roster.serviceAt}>{dayLabel.format(date)} · {hourLabel.format(date)}</time>
        <span className={s.status} data-status={roster.status}>{escalaStatusLabel(roster.status)}</span>
        <div><p>{moduleName}</p><h3>{roster.title}</h3></div>
      </div>
      <div className={s.cardBody}>
        <p>{roster.positions?.length ? `${coverage.confirmed} de ${roster.positions.length} confirmadas · ${coverage.open} em aberto` : "Sem posições cadastradas"}</p>
        <div className={s.cardActions}>{openLink(roster)}<div>{exportsFor(roster)}</div></div>
      </div>
    </article>;
  }

  const featuredDate = featured && new Date(featured.serviceAt);
  const featuredModule = moduleNames.get(featured?.moduleId ?? "") ?? "Geral";
  const featuredCoverage = rosterPositionSummary(featured?.positions ?? []);
  const nextTeams = featured && upcoming.length ? upcoming.filter(roster => roster.serviceAt === featured.serviceAt) : [];
  const featuredPriority = nextTeams.find(roster => rosterPositionSummary(roster.positions ?? []).open > 0) ??
    nextTeams.find(roster => rosterPositionSummary(roster.positions ?? []).pending > 0) ?? featured;
  const featuredOpen = featuredPriority?.positions?.find(position => !position.assignments.some(item => item.status === "PENDING" || item.status === "CONFIRMED"));
  const priorityCoverage = rosterPositionSummary(featuredPriority?.positions ?? []);
  const priorityTeam = moduleNames.get(featuredPriority?.moduleId ?? "") ?? "Equipe geral";
  const nextDays = [...new Map(upcoming.map(roster => [churchDayKey(roster.serviceAt), new Date(roster.serviceAt)]))].slice(0, 7);
  const previousCards = previous.filter(roster => roster.id !== featured?.id);

  return <div className={s.showcase}>
    <section className={s.hero} style={poster(featuredModule)} aria-label="Escalas do ministério">
      <div className={s.heroTop}>
        <h2>{volunteerPortal ? "Escalas do Atmosfera" : "Escalas do ministério"}</h2>
        <div className={s.heroActions}>
          {volunteerPortal && <a className={s.secondary} href={withBasePath(meuEspacoHref())}>Portal do Voluntário <UIIcon name="arrow" size={15} /></a>}
          {shortcut && <a className={s.secondary} href={withBasePath(shortcut.href)}>{shortcut.label}</a>}
          {access && <RosterEditor key={selectedModule?.id ?? "general"} {...access} buttonClass={s.primary} />}
        </div>
      </div>
      {featured && featuredDate && <div className={s.heroFeature}>
        <div className={s.heroCopy}>
          <div className={s.heroMeta}><span>{upcoming.length ? "Próximo culto" : "Último culto"}</span><span className={s.status} data-status={featured.status}>{escalaStatusLabel(featured.status)}</span></div>
          <h3>{featured.title}</h3>
          <p><UIIcon name="calendar" size={16} /> <time dateTime={featured.serviceAt}>{fullDate.format(featuredDate)} · {hourLabel.format(featuredDate)}</time> <span>· {featuredModule}</span></p>
          {upcoming.length > 0 && featuredPriority && <p className={s.priority}>
            {priorityCoverage.open ? `${priorityTeam} · ${priorityCoverage.open} ${priorityCoverage.open === 1 ? "vaga aberta" : "vagas abertas"}` :
              priorityCoverage.pending ? `${priorityTeam} · ${priorityCoverage.pending} a confirmar` :
                featuredPriority.positions?.length ? "Equipe confirmada" : "Postos a definir"}
          </p>}
          <div className={s.featureActions}>
            {featuredPriority && openLink(featuredPriority, true, upcoming.length ? featuredOpen?.id : undefined,
              upcoming.length && featuredOpen ? "Preencher vaga" : upcoming.length && priorityCoverage.pending ? "Ver confirmações" : undefined)}
            {exportsFor(featured)}
          </div>
        </div>
        {Boolean(featured.positions?.length) && <dl className={s.heroCoverage} aria-label="Cobertura do culto em destaque">
          <div><dt>Confirmadas</dt><dd>{featuredCoverage.confirmed}</dd></div>
          <div><dt>A confirmar</dt><dd>{featuredCoverage.pending}</dd></div>
          <div><dt>Em aberto</dt><dd>{featuredCoverage.open}</dd></div>
        </dl>}
      </div>}
    </section>
    <section className={s.navigation} aria-label="Filtros e ferramentas de escalas">
      <div className={s.filters}>
        {modules.length > 0 && <div className={s.moduleFilters} role="group" aria-label="Módulo da escala">
          <button type="button" aria-pressed={!moduleFilter} onClick={() => setModuleFilter("")}>Todos</button>
          {modules.map(module => <button type="button" key={module.id} aria-pressed={moduleFilter === module.id}
            onClick={() => setModuleFilter(module.id)}>{module.name}</button>)}
        </div>}
        {months.length > 0 && <label className={s.month}>Mês <select value={monthFilter} onChange={event => setMonthFilter(event.target.value)}>
          <option value="">Todos os meses</option>
          {months.map(([value, name]) => <option value={value} key={value}>{name}</option>)}
        </select></label>}
      </div>
      {access && <div className={s.tools}>
        <div role="group" aria-label="Ferramentas de escala">
          <button type="button" aria-expanded={more} onClick={() => { setMore(!more); if (more) setTool(null); }}><UIIcon name="more" size={16} /> Mais</button>
        </div>
        {more && <div className={s.moreActions}>
          <button type="button" aria-expanded={tool === "modules"} onClick={() => setTool(tool === "modules" ? null : "modules")}><UIIcon name="settings" size={16} /> Módulos e regras</button>
          {modules.length > 0 && <button type="button" aria-expanded={tool === "draw"} onClick={() => setTool(tool === "draw" ? null : "draw")}><UIIcon name="spark" size={16} /> Sorteio mensal</button>}
          <button type="button" aria-expanded={tool === "availability"} onClick={() => setTool(tool === "availability" ? null : "availability")}><UIIcon name="clock" size={16} /> Disponibilidade semanal</button>
        </div>}
        <button type="button" className={s.listExport} disabled={!items.length || Boolean(download)} onClick={() => void exportFile("xlsx")}>
          <UIIcon name="download" size={16} /> {download === "list-xlsx" ? "Gerando…" : "Excel da lista"}
        </button>
      </div>}
      {access && tool && <div className={s.toolbox} aria-label="Configuração da escala">
        {tool === "modules" && <>
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
      {access && <RosterActions key={selected.id} {...access} roster={selected} members={access.members.filter(member =>
        modules.find(module => module.id === selected.moduleId)?.rules?.volunteerIds?.includes(member.personId) ?? true,
      )} />}
      {!access && <p>{selected.functions.join(" · ") || "Sem posições cadastradas."}</p>}
    </section>}
    {!items.length && <p role="status" className={s.empty}>Nenhuma escala encontrada para os filtros selecionados.</p>}
    {nextDays.length > 0 && <section className={s.timeline} aria-label="Próximos cultos">
      <h2>Próximos cultos</h2>
      {nextDays.map(([day, date]) => {
        const times = [...new Set(upcoming.filter(roster => churchDayKey(roster.serviceAt) === day).map(roster => roster.serviceAt))];
        return <section key={day} className={s.timelineDay}>
          <h3>{fullDate.format(date)}</h3>
          {times.map(time => <div key={time} className={s.timelineTime}>
            <time dateTime={time}>{hourLabel.format(new Date(time))}</time>
            <ul>{upcoming.filter(roster => roster.serviceAt === time).map(roster => {
              const coverage = rosterPositionSummary(roster.positions ?? []);
              const vacant = roster.positions?.find(position => !position.assignments.some(item => item.status === "PENDING" || item.status === "CONFIRMED"));
              const confirmed = new Set(roster.positions?.flatMap(position => position.assignments.filter(item => item.status === "CONFIRMED")
                .flatMap(item => [item.personName, item.partnerName].filter(Boolean))) ?? []);
              return <li key={roster.id} data-state={coverage.open ? "open" : coverage.pending ? "pending" : "ready"}>
                <div><h4>{moduleNames.get(roster.moduleId ?? "") ?? roster.title}</h4>
                  <p>{coverage.open > 0 && `${coverage.open} em aberto · `}{coverage.pending > 0 && `${coverage.pending} a confirmar · `}{coverage.confirmed} confirmadas</p>
                  {confirmed.size > 0 && <p title={[...confirmed].join(", ")}>{[...confirmed].slice(0, 3).join(" · ")}{confirmed.size > 3 ? ` +${confirmed.size - 3}` : ""}</p>}
                </div>
                <div className={s.timelineActions}>{openLink(roster, false, vacant?.id, vacant ? "Preencher vaga" : coverage.pending ? "Ver confirmações" : "Ver equipe")}{exportsFor(roster)}</div>
              </li>;
            })}</ul>
          </div>)}
        </section>;
      })}
      {new Set(upcoming.map(roster => churchDayKey(roster.serviceAt))).size > nextDays.length &&
        <RosterRail title="Mais datas">{upcoming.filter(roster => !nextDays.some(([day]) => day === churchDayKey(roster.serviceAt))).map(card)}</RosterRail>}
    </section>}
    {previousCards.length > 0 && <RosterRail title="Escalas anteriores">{previousCards.map(card)}</RosterRail>}
  </div>;
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
