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

  return (
    <div className={s.agenda}>
      <div className={s.toolbar}>
        <label>
          <span className={s.fieldLabel}><UIIcon name="search" size={15} /> Buscar</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome do encontro" />
        </label>
        <label>
          <span className={s.fieldLabel}><UIIcon name="filter" size={15} /> Situação</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todas</option>
            <option value="DRAFT">Rascunho</option>
            <option value="PUBLISHED">Publicado</option>
            <option value="CANCELLED">Cancelado</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>
        </label>
      </div>
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
      {mode === "lista" && (
        <label className={s.checkline}>
          <input type="checkbox" checked={allMonths} onChange={(event) => setAllMonths(event.target.checked)} />
          <span>Mostrar todos os meses</span>
        </label>
      )}
      {events.length === 0 && <p>Nenhum evento nesta agenda.</p>}
      {events.length > 0 && visible.length === 0 && <p>Nenhum evento com esses filtros.</p>}
      {mode === "calendario" && (
        <div className={s.calendar} role="grid" aria-label={`Calendário de ${monthTitle(month)}`}>
          {WEEKDAYS.map((day) => <div className={s.weekday} key={day} role="columnheader">{day}</div>)}
          {cells.map((cell) => (
            <div className={cell.inMonth ? s.day : s.dayOutside} key={cell.date} role="gridcell" aria-label={cell.date}>
              <span>{cell.day}</span>
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
          ))}
        </div>
      )}
      {visible.length > 0 && <ul className={s.agendaList}>
        {visible.map((event) => (
          <li className={s.agendaRow} key={event.id} data-selected={selectedId === event.id}>
            <span className={s.agendaIcon}><UIIcon name="calendar" size={19} /></span>
            <div>
              <strong>{event.name || "Evento"}</strong>
              <small>{eventStatusLabel(event.status)} · {formatAgendaWhen(event.startsAt)}</small>
            </div>
            <button type="button" className={ui.workspaceQuiet} aria-pressed={selectedId === event.id} onClick={() => onChoose(event.id)}>
              {selectedId === event.id ? "Selecionado" : "Abrir"}
              <UIIcon name={selectedId === event.id ? "check" : "chevron"} size={16} />
            </button>
          </li>
        ))}
      </ul>}
    </div>
  );
}
