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
          Buscar
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome do encontro" />
        </label>
        <label>
          Situação
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todas</option>
            <option value="DRAFT">Rascunho</option>
            <option value="PUBLISHED">Publicado</option>
            <option value="CANCELLED">Cancelado</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>
        </label>
        <div className={s.monthNav} role="group" aria-label="Mês da agenda">
          <button type="button" className={s.secondary} onClick={() => setMonth((current) => shiftMonth(current, -1))}>Mês anterior</button>
          <strong>{monthTitle(month)}</strong>
          <button type="button" className={s.secondary} onClick={() => setMonth((current) => shiftMonth(current, 1))}>Próximo mês</button>
        </div>
        <div className={s.viewToggle} role="group" aria-label="Formato da agenda">
          <button type="button" className={mode === "calendario" ? undefined : s.secondary} aria-pressed={mode === "calendario"} onClick={() => setMode("calendario")}>Calendário</button>
          <button type="button" className={mode === "lista" ? undefined : s.secondary} aria-pressed={mode === "lista"} onClick={() => setMode("lista")}>Lista</button>
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
      <div className={s.cards}>
        {visible.map((event) => (
          <article className={s.card} key={event.id}>
            <strong>{event.name || "Evento"}</strong>
            <small>{eventStatusLabel(event.status)} · {formatAgendaWhen(event.startsAt)}</small>
            <button type="button" className={s.secondary} aria-pressed={selectedId === event.id} onClick={() => onChoose(event.id)}>
              {selectedId === event.id ? "Selecionado" : "Abrir"}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
