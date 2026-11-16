"use client";

import { useMemo, useState } from "react";
import {
  WEEKDAYS,
  buildMonthGrid,
  eventStatusLabel,
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
  const [mode, setMode] = useState<Mode>("calendario");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState(() => initialMonth(events));
  const [allMonths, setAllMonths] = useState(false);
  const monthFilter = mode === "lista" && allMonths ? undefined : month;
  const visible = useMemo(
    () => filterAgenda(events, { query, status, month: monthFilter }),
    [events, query, status, monthFilter],
  );
  const cells = useMemo(() => buildMonthGrid(month, visible), [month, visible]);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));

  return (
    <div className={s.agenda}>
      <div className={s.calendarControls}>
        {monthFilter && <div className={s.monthNav} role="group" aria-label="Mês da agenda">
          <button type="button" className={ui.workspaceQuiet} aria-label="Mês anterior" onClick={() => setMonth((current) => shiftMonth(current, -1))}>
            <span className={s.previousArrow}><UIIcon name="chevron" size={19} /></span>
          </button>
          <strong aria-live="polite">{monthTitle(month)}</strong>
          <button type="button" className={ui.workspaceQuiet} aria-label="Próximo mês" onClick={() => setMonth((current) => shiftMonth(current, 1))}>
            <UIIcon name="chevron" size={19} />
          </button>
        </div>}
        <div className={`${ui.workspaceChoices} ${s.viewToggle}`} role="group" aria-label="Formato da agenda">
          <button type="button" aria-pressed={mode === "calendario"} onClick={() => setMode("calendario")}>
            <UIIcon name="calendar" size={17} /> Calendário
          </button>
          <button type="button" aria-pressed={mode === "lista"} onClick={() => setMode("lista")}>
            <UIIcon name="book" size={17} /> Lista
          </button>
        </div>
      </div>
      <div className={s.toolbar}>
        <WorkspaceSearch value={query} onChange={event => setQuery(event.target.value)}
          placeholder="Buscar evento" aria-label="Buscar" />
        <label className={s.agendaStatus}>
          <UIIcon name="filter" size={17} />
          <select aria-label="Situação" value={status} onChange={(event) => setStatus(event.target.value)}>
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
                    <div className={s.dayContent}>
                      <time dateTime={cell.date}>{cell.day}</time>
                      {cell.events.length > 0 && (
                        <span className={s.eventCount}>
                          <span aria-hidden="true">{cell.events.length}</span>
                          <span className={s.srOnly}>{cell.events.length === 1 ? "1 evento" : `${cell.events.length} eventos`}</span>
                        </span>
                      )}
                      {cell.events.map((event) => (
                        <button
                          type="button"
                          key={event.id}
                          className={selectedId === event.id ? s.chipOn : s.chip}
                          aria-pressed={selectedId === event.id}
                          onClick={() => onChoose(event.id)}
                        >
                          <span>{event.name || "Evento"}</span>
                          <small>{eventStatusLabel(event.status)}</small>
                        </button>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {visible.length > 0 && <div className={s.agendaResults}>
        <div className={s.agendaResultsHead}>
          <h3>Eventos</h3>
          <span role="status">{visible.length} {visible.length === 1 ? "evento encontrado" : "eventos encontrados"}</span>
        </div>
        <ul className={s.agendaList}>
        {visible.map((event) => (
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
      </div>}
    </div>
  );
}
