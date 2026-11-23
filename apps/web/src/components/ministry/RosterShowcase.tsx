"use client";

import { useEffect, useRef, useState } from "react";
import { apiGetBlob, apiPost, ApiRequestError } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { rosterModuleContains, rosterPositionSummary, type EscalaModuleRules, type EscalaPanel, type MinistryEscala } from "../../lib/ministry-presentation";
import { escalaStatusLabel, meuEspacoHref, ministryHref } from "../../lib/ministry-view";
import { withBasePath } from "../../lib/paths";
import { churchDayKey } from "../../lib/serving-rosters";
import { UIIcon } from "../AppShell";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import { MonthlyRosterPreview } from "./MonthlyRosterPreview";
import { RosterActions, RosterEditor, type RosterActionsProps } from "./RosterEditor";
import { RosterModuleCatalog } from "./RosterModuleCatalog";
import { RosterCapacitySettings } from "./RosterCapacitySettings";
import { RepertoireDesk } from "../serving/RepertoireDesk";
import { RosterRecurringAvailability } from "./RosterRecurringAvailability";
import s from "./roster-showcase.module.css";

const churchZone = "America/Sao_Paulo";
const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, weekday: "short" });
const dayNumber = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, day: "2-digit" });
const fullDate = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, weekday: "long", day: "numeric", month: "long" });
const hourLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, hour: "2-digit", minute: "2-digit" });
const monthLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: churchZone, month: "long", year: "numeric" });

function teamCoverage(roster: MinistryEscala) {
  return rosterPositionSummary(roster.positions ?? []);
}

function shiftMonth(month: string, step: number) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1 + step, 1)).toISOString().slice(0, 7);
}

function cultTitle(when: Date) {
  const day = weekday.format(when).toLocaleLowerCase("pt-BR");
  const hour = Number(hourLabel.format(when).split(":")[0]);
  if (day.startsWith("qui")) return "Culto da Família";
  if (day.startsWith("dom")) return hour < 12 ? "Culto da manhã" : "Culto da noite";
  return "Culto";
}

type Props = {
  ministryId: string;
  ministryName: string;
  panel: EscalaPanel;
  escalaId?: string;
  shortcut: { href: string; label: string } | null;
  volunteerPortal: boolean;
  louvor?: boolean;
  onOpen: (escalaId?: string) => void;
  actions?: RosterActionsProps;
};

export function RosterShowcase({ ministryId, ministryName, panel, escalaId, shortcut, volunteerPortal, louvor, onOpen, actions }: Props) {
  const { confirm, confirmation } = useActionConfirmation();
  const [publishing, setPublishing] = useState("");
  const [notice, setNotice] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState(() => churchDayKey(new Date().toISOString()).slice(0, 7));
  const [statusFilter, setStatusFilter] = useState("");
  const [tool, setTool] = useState<"modules" | "draw" | "availability" | "capacity" | null>(null);
  const [updatedRules, setUpdatedRules] = useState<Record<string, EscalaModuleRules>>({});
  const [download, setDownload] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const details = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const ready = panel.kind === "ready";
  const canEditModules = ready && panel.permissions?.scope !== "modules" && Boolean(actions);
  useEffect(() => {
    if (canEditModules && new URLSearchParams(window.location.search).get("config") === "regras") setTool("modules");
  }, [canEditModules]);
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
  const grouped = new Map<string, MinistryEscala[]>();
  const items = panel.items.filter(roster => {
    if (selectedModule && roster.moduleId !== selectedModule.id) return false;
    if (!churchDayKey(roster.serviceAt).startsWith(monthFilter)) return false;
    if (statusFilter === "OPEN") return roster.status !== "CLOSED" && teamCoverage(roster).open > 0;
    return !statusFilter || roster.status === statusFilter;
  }).sort((left, right) => Date.parse(left.serviceAt) - Date.parse(right.serviceAt));
  for (const roster of items) {
    const key = new Date(roster.serviceAt).toISOString();
    const existing = grouped.get(key);
    if (existing) existing.push(roster);
    else grouped.set(key, [roster]);
  }
  const totals = items.filter(roster => roster.status !== "CLOSED").reduce((sum, roster) => {
    const coverage = teamCoverage(roster);
    return { open: sum.open + coverage.open, pending: sum.pending + (roster.status === "PUBLISHED" ? coverage.pending : 0) };
  }, { open: 0, pending: 0 });
  const selected = panel.items.find(roster => roster.id === escalaId);
  const moduleOnly = panel.permissions?.scope === "modules";
  const canPublishMonth = panel.permissions?.manageRosterMonth === true;
  const canGenerateMonth = !volunteerPortal || (panel.permissions?.manageRosterMonth ?? !moduleOnly);
  const canPublishRoster = canGenerateMonth;
  const monthDrafts = panel.items.filter(roster => roster.status === "DRAFT" && roster.positions?.length &&
    churchDayKey(roster.serviceAt).slice(0, 7) === monthFilter);
  const access = actions && (!moduleOnly || modules.length > 0) && {
    ...actions, modules, moduleId: selectedModule?.id ?? (moduleOnly ? modules[0]?.id : undefined),
    allowGeneral: !moduleOnly,
    allowPublish: canPublishRoster,
    requireModuleMembership: volunteerPortal || moduleOnly,
    managedModuleMemberships: panel.permissions?.manageModuleMemberships,
    onOpen: (id: string, nextModuleId?: string) => {
      if (nextModuleId !== undefined) setModuleFilter(nextModuleId);
      onOpen(id);
    },
  };

  async function publish(roster: MinistryEscala) {
    if (!actions || !canPublishRoster || publishing) return;
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

  async function publishMonth() {
    if (!actions || !canPublishMonth || !monthDrafts.length || publishing) return;
    setPublishing("month");
    setNotice("");
    setDownloadError("");
    const label = monthLabel.format(new Date(monthFilter + "-15T12:00:00Z"));
    const count = monthDrafts.length === 1 ? "1 escala em rascunho" : `${monthDrafts.length} escalas em rascunho`;
    try {
      if (!(await confirm({
        title: "Publicar escala do mês?",
        subject: `${label} · ${count}`,
        description: "A publicação inclui todas as equipes do mês. As pessoas escaladas recebem o aviso no portal e as vagas sem designação ficam abertas.",
        action: "Publicar mês",
      }))) return;
      const result = await apiPost<{ publishedRosters: number }>(
        `/rosters/by-ministry/${encodeURIComponent(ministryId)}/month/${monthFilter}/publish`, actions.token,
      );
      setNotice(result.publishedRosters === 0 ? "Este mês já está em dia, sem rascunhos para publicar." :
        result.publishedRosters === 1 ? "1 escala do mês publicada." : `${result.publishedRosters} escalas do mês publicadas.`);
      actions.onRefresh();
    } catch (error) {
      setDownloadError(error instanceof ApiRequestError && error.status === 409
        ? "Atualize o mês e revise as designações em conflito antes de publicar." : dasError(error));
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
      const when = new Date(roster.serviceAt);
      const team = moduleNames.get(roster.moduleId ?? "") ?? ministryName;
      const text = [
        `*Escala • ${team}*`,
        `${cultTitle(when)} — ${fullDate.format(when)}, às ${hourLabel.format(when)}`,
        "",
        "Abra o Portal do Voluntário para ver sua função e confirmar presença.",
        portal,
      ].join("\n");
      window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
    }}>WhatsApp <span aria-hidden="true">↗</span></button>;
  }

  if (tool === "draw" && access && canGenerateMonth) return <MonthlyRosterPreview token={access.token} ministryId={ministryId}
    modules={modules} initialModuleId={selectedModule?.id} initialMonth={monthFilter}
    onRefresh={access.onRefresh} onClose={() => setTool(null)} />;

  return <div className={s.showcase}>
    {confirmation}
    <header className={s.monthlyHero}>
      <div><p>{volunteerPortal ? "Ministérios / Atmosfera" : ministryName}</p><h2>Escalas</h2></div>
      <div className={s.heroActions}>
        {shortcut && <a className={s.secondary} href={withBasePath(shortcut.href)}>{shortcut.label}</a>}
        {access && <RosterEditor key={access.moduleId ?? "general"} {...access} buttonClass={s.secondary} />}
        {access && canGenerateMonth && <button type="button" className={s.lime} disabled={Boolean(publishing)}
          onClick={() => setTool(modules.length ? "draw" : "modules")}>
          <UIIcon name="spark" size={17} /> {modules.length ? "Gerar escala do mês" : "Configurar e gerar escala"}
        </button>}
        {access && canPublishMonth && <button type="button" className={s.lime} disabled={Boolean(publishing) || !monthDrafts.length}
          title={!monthDrafts.length ? "Este mês não tem rascunhos com vagas para publicar" : undefined}
          onClick={() => void publishMonth()}>
          <UIIcon name="check" size={17} /> {publishing === "month" ? "Publicando mês…" : "Publicar escala do mês"}
        </button>}
      </div>
    </header>
    {louvor && !modules.length && canEditModules && <div className={s.empty} role="status">
      <strong>Primeira escala automática do Louvor</strong>
      <p>Cadastre a equipe em “Módulos e regras”, aplique o modelo editável de posições para os cultos e associe os integrantes às habilitações. Depois use “Gerar escala do mês” para simular, revisar e salvar o rascunho.</p>
      <button type="button" className={s.secondary} onClick={() => setTool("modules")}>Configurar a equipe de Louvor</button>
    </div>}
    <section className={s.monthlyFilters} aria-label="Filtros de escala">
      <div><span id="month-label">Mês</span>
        <div className={s.monthNavigation} role="group" aria-labelledby="month-label">
          <button type="button" aria-label="Mês anterior" onClick={() => setMonthFilter(shiftMonth(monthFilter, -1))}>‹</button>
          <strong aria-live="polite">{monthLabel.format(new Date(monthFilter + "-15T12:00:00Z"))}</strong>
          <button type="button" aria-label="Próximo mês" onClick={() => setMonthFilter(shiftMonth(monthFilter, 1))}>›</button>
        </div>
      </div>
      {modules.length > 0 && <label>Equipe<select value={moduleFilter} onChange={event => setModuleFilter(event.target.value)}>
        {<option value="" disabled={moduleOnly && modules.length === 1}>{moduleOnly && modules.length === 1 ? modules[0].name : "Todas as equipes autorizadas"}</option>}
        {!(moduleOnly && modules.length === 1) && modules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}
      </select></label>}
      <label>Situação<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
        <option value="">Todas as situações</option><option value="OPEN">Com vagas abertas</option>
        <option value="DRAFT">Rascunhos</option><option value="PUBLISHED">Publicadas</option><option value="CLOSED">Encerradas</option>
      </select></label>
    </section>
    <div className={s.monthlyControls}>
      <div><h3>Cultos do mês</h3>
        {totals.open > 0 && <span data-tone="attention">{totals.open} {totals.open === 1 ? "vaga aberta" : "vagas abertas"}</span>}
        {totals.pending > 0 && <span>{totals.pending} {totals.pending === 1 ? "resposta pendente" : "respostas pendentes"}</span>}
      </div>
      {access && <div>
        {!moduleOnly && <button type="button" className={s.secondary} aria-expanded={tool === "modules"}
          onClick={() => setTool(tool === "modules" ? null : "modules")}><UIIcon name="settings" size={16} /> Módulos e regras</button>}
        <details className={s.rowMenu}><summary>Configurar</summary><div>
          {modules.length > 0 && <button type="button" className={s.secondary} aria-expanded={tool === "capacity"}
            onClick={() => setTool(tool === "capacity" ? null : "capacity")}>Vagas por culto</button>}
          <button type="button" className={s.secondary} aria-expanded={tool === "availability"}
            onClick={() => setTool(tool === "availability" ? null : "availability")}>Disponibilidade semanal</button>
        </div></details>
        <button type="button" className={s.secondary} disabled={!items.length || Boolean(download)} onClick={() => void exportFile("xlsx")}>
          <UIIcon name="download" size={16} /> {download === "list-xlsx" ? "Gerando…" : "Exportar Excel"}
        </button>
      </div>}
    </div>
    {access && tool && <section className={s.toolbox} aria-label="Configuração da escala">
      {tool === "capacity" && <RosterCapacitySettings token={access.token} ministryId={ministryId} modules={modules}
        initialModuleId={access.moduleId} onSaved={access.onRefresh} />}
      {tool === "modules" && !moduleOnly && <RosterModuleCatalog key={moduleFilter} actions={access}
        modules={modules} initialId={selectedModule?.id} louvor={louvor}
        onRulesSaved={(id, rules) => setUpdatedRules(previous => ({ ...previous, [id]: rules }))} />}
      {tool === "availability" && <RosterRecurringAvailability actions={access} />}
    </section>}
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
      {louvor && actions && <RepertoireDesk key={selected.id} rosterId={selected.id} />}
      {!access && <p>{selected.functions.join(" · ") || "Sem posições cadastradas."}</p>}
    </section>}
    {notice && <p role="status" className={s.empty}>{notice}</p>}
    {grouped.size === 0 && <p role="status" className={s.empty}>Nenhum culto para os filtros selecionados.</p>}
    <div className={s.monthlyList}>
      {[...grouped].map(([stamp, rosters]) => {
        const date = new Date(stamp);
        const title = rosters.every(roster => roster.title === rosters[0].title) ? rosters[0].title : cultTitle(date);
        return <section className={s.cultGroup} key={stamp} aria-label={fullDate.format(date) + " às " + hourLabel.format(date)}>
          <time className={s.dateTile} dateTime={stamp}><span>{weekday.format(date).replace(".", "")}</span><strong>{dayNumber.format(date)}</strong></time>
          <div>
            <header className={s.cultHeader}><h4>{title}</h4><time dateTime={stamp}>{hourLabel.format(date)}</time></header>
            {rosters.map(roster => {
              const coverage = teamCoverage(roster);
              const summary = roster.status === "DRAFT"
                ? (coverage.confirmed + coverage.pending) + " designadas"
                : coverage.confirmed + " confirmadas" + (coverage.pending ? " · " + coverage.pending + " a confirmar" : "");
              return <div key={roster.id} className={s.teamLine}>
                <strong>{moduleNames.get(roster.moduleId ?? "") ?? roster.title}</strong>
                <span className={s.status} data-status={roster.status}>{escalaStatusLabel(roster.status)}</span>
                <p>{coverage.open > 0 && <b>{coverage.open} {coverage.open === 1 ? "vaga aberta" : "vagas abertas"}</b>} {coverage.open > 0 && "· "}{summary}</p>
                <div className={s.teamActions}>
                  {access && canPublishRoster && roster.status === "DRAFT" && Boolean(roster.positions?.length) &&
                    <button type="button" className={s.secondary} disabled={Boolean(publishing)} onClick={() => void publish(roster)}>Publicar</button>}
                  {openLink(roster, false, undefined, "Abrir")}
                  {access && roster.status === "PUBLISHED" && <details className={s.rowMenu}><summary aria-label={"Compartilhar " + roster.title}>Compartilhar</summary><div>{whatsAppLink(roster)}</div></details>}
                </div>
              </div>;
            })}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
