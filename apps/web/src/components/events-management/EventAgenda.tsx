"use client";

import { useMemo, useState } from "react";
import {
  WEEKDAYS,
  buildMonthGrid,
  eventStatusLabel,
  eventDayKey,
  filterAgenda,
  formatAgendaWhen,
  initialMonth,
  monthTitle,
  shiftMonth,
  type AgendaItem,
} from "./calendar";
import { UIIcon } from "../ui/UIIcon";
import ui from "../ui/ui.module.css";
import { WorkspaceSearch } from "../ui/WorkspaceSearch";
import s from "./event-management.module.css";

type Mode = "calendario" | "lista";

export function EventAgenda({
  events,
  selectedId,
  onChoose,
}: {
  events: AgendaItem[];
  selectedId: string;
  onChoose: (id: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("lista");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState(() => initialMonth(events));
  const [allMonths, setAllMonths] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showAllCalendar, setShowAllCalendar] = useState(false);
  const monthFilter = mode === "lista" && allMonths ? undefined : month;
  const visible = useMemo(
    () => filterAgenda(events, { query, status, month: monthFilter }),
    [events, query, status, monthFilter],
  );
  const cells = useMemo(() => buildMonthGrid(month, visible), [month, visible]);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const dayResults = mode === "calendario" && selectedDay
    ? visible.filter(event => eventDayKey(event.startsAt) === selectedDay)
    : visible;
  const results = mode === "calendario" && !selectedDay && !showAllCalendar ? dayResults.slice(0, 5) : dayResults;

  return (
    <div className={s.agenda}>
      <div className={s.calendarControls}>
        {monthFilter && <div className={s.monthNav} role="group" aria-label="Mês da agenda">
          <button type="button" className={ui.workspaceQuiet} aria-label="Mês anterior" onClick={() => { setMonth(current => shiftMonth(current, -1)); setSelectedDay(null); setShowAllCalendar(false); }}>
            <span className={s.previousArrow}><UIIcon name="chevron" size={19} /></span>
          </button>
          <strong aria-live="polite">{monthTitle(month)}</strong>
          <button type="button" className={ui.workspaceQuiet} aria-label="Próximo mês" onClick={() => { setMonth(current => shiftMonth(current, 1)); setSelectedDay(null); setShowAllCalendar(false); }}>
            <UIIcon name="chevron" size={19} />
          </button>
        </div>}
        <div className={`${ui.workspaceChoices} ${s.viewToggle}`} role="group" aria-label="Formato da agenda">
          <button type="button" aria-pressed={mode === "calendario"} onClick={() => { setMode("calendario"); setSelectedDay(null); }}>
            <UIIcon name="calendar" size={17} /> Calendário
          </button>
          <button type="button" aria-pressed={mode === "lista"} onClick={() => { setMode("lista"); setSelectedDay(null); }}>
            <UIIcon name="book" size={17} /> Lista
          </button>
        </div>
      </div>
      <div className={s.toolbar}>
        <WorkspaceSearch value={query} onChange={event => { setQuery(event.target.value); setSelectedDay(null); }}
          placeholder="Buscar evento" aria-label="Buscar" />
        <label className={s.agendaStatus}>
          <UIIcon name="filter" size={17} />
          <select aria-label="Situação" value={status} onChange={(event) => { setStatus(event.target.value); setSelectedDay(null); }}>
            <option value="">Todas as situações</option>
            <option value="DRAFT">Rascunho</option>
            <option value="PUBLISHED">Publicado</option>
            <option value="CANCELLED">Cancelado</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>
        </label>
      </div>
      {mode === "lista" && (
        <label className={s.checkline}>
          <input type="checkbox" checked={allMonths} onChange={(event) => setAllMonths(event.target.checked)} />
          <span>Mostrar todos os meses</span>
        </label>
      )}
      {events.length === 0 && <p>Nenhum evento nesta agenda.</p>}
      {events.length > 0 && visible.length === 0 && <p>Nenhum evento com esses filtros.</p>}
      {mode === "calendario" && (
        <table className={s.calendar} aria-label={`Calendário de ${monthTitle(month)}`}>
          <thead>
            <tr>{WEEKDAYS.map((day) => <th className={s.weekday} key={day} scope="col">{day}</th>)}</tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0].date}>
                {week.map((cell) => (
                  <td className={cell.inMonth ? s.day : s.dayOutside} key={cell.date}>
                    <button
                      type="button"
                      className={s.calendarDayButton}
                      disabled={cell.events.length === 0}
                      aria-pressed={selectedDay === cell.date}
                      aria-label={`${cell.day} de ${monthTitle(month)} · ${cell.events.length} ${cell.events.length === 1 ? "evento" : "eventos"}`}
                      onClick={() => { setSelectedDay(current => current === cell.date ? null : cell.date); setShowAllCalendar(false); }}
                    >
                      <time dateTime={cell.date}>{cell.day}</time>
                      {cell.events.length > 0 && <span className={s.eventCount} aria-hidden="true">{cell.events.length}</span>}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {visible.length > 0 && <div className={s.agendaResults}>
        <div className={s.agendaResultsHead}>
          <h3>{selectedDay && mode === "calendario" ? "Eventos do dia" : "Eventos"}</h3>
          <span role="status">{dayResults.length} {dayResults.length === 1 ? "evento encontrado" : "eventos encontrados"}</span>
        </div>
        <ul className={s.agendaList}>
        {results.map((event) => (
          <li className={s.agendaRow} key={event.id} data-selected={selectedId === event.id}>
            <span className={s.agendaIcon}><UIIcon name="calendar" size={19} /></span>
            <div className={s.agendaIdentity}>
              <strong>{event.name || "Evento"}</strong>
              <small><time dateTime={event.startsAt}>{formatAgendaWhen(event.startsAt)}</time></small>
              <span className={s.agendaTag} data-status={event.status}>{eventStatusLabel(event.status)}</span>
            </div>
            <button type="button" className={ui.workspaceQuiet} aria-pressed={selectedId === event.id} aria-label={`${selectedId === event.id ? "Selecionado" : "Abrir"}: ${event.name || "Evento"}`} onClick={() => onChoose(event.id)}>
              {selectedId === event.id ? "Selecionado" : "Abrir"}
              <UIIcon name={selectedId === event.id ? "check" : "chevron"} size={16} />
            </button>
          </li>
        ))}
        </ul>
        {mode === "calendario" && !selectedDay && visible.length > 5 && !showAllCalendar &&
          <button className={s.moreCalendarEvents} type="button" onClick={() => setShowAllCalendar(true)}>Ver todos os {visible.length} eventos deste mês</button>}
        {mode === "calendario" && selectedDay &&
          <button className={s.moreCalendarEvents} type="button" onClick={() => setSelectedDay(null)}>Ver eventos do mês inteiro</button>}
      </div>}
    </div>
  );
}
