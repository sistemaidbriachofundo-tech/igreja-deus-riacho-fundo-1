"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiDelete, apiGet, apiPost } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import ui from "../ui/ui.module.css";
import type { RosterActionsProps } from "./RosterEditor";
import s from "./roster-editor.module.css";

type Segment = { weekday: number; startMinute: number; endMinute: number };
type Window = { id: string; segments: Segment[] };
const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function timeLabel(minute: number) {
  return [Math.floor(minute / 60), minute % 60].map(part => String(part).padStart(2, "0")).join(":");
}

function timeMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function RosterRecurringAvailability({ actions }: { actions: RosterActionsProps }) {
  const [personId, setPersonId] = useState("");
  const [windows, setWindows] = useState<Window[]>();
  const [editing, setEditing] = useState<Window>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const path = "/ministries/" + encodeURIComponent(actions.ministryId) + "/roster-availability";
  const token = actions.token;
  const query = "?personId=" + encodeURIComponent(personId);
  useEffect(() => {
    if (!personId) return;
    let current = true;
    void apiGet<{ windows: Window[] }>(path + query, token)
      .then(result => { if (current) setWindows(result.windows); })
      .catch(error => { if (current) setNotice(dasError(error)); });
    return () => { current = false; };
  }, [path, personId, query, revision, token]);

  async function change(request: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await request();
      setEditing(undefined);
      setRevision(value => value + 1);
      setNotice(success);
    } catch (error) {
      setNotice(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const startMinute = timeMinutes(String(fields.get("starts")));
    const endMinute = fields.has("untilMidnight") ? 1440 : timeMinutes(String(fields.get("ends")));
    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute) {
      setNotice("Informe um horário final posterior ao horário inicial.");
      return;
    }
    void change(() => apiPost(path, token, {
      personId, weekday: Number(fields.get("weekday")), startMinute, endMinute, replaceId: editing?.id,
    }), "Disponibilidade salva.");
    if (!editing) event.currentTarget.reset();
  }

  const segment = editing?.segments[0];
  return <section aria-label="Disponibilidade semanal dos voluntários">
    <div className={s.form}>
      <label>Voluntário<select value={personId} disabled={busy} onChange={event => {
        setPersonId(event.target.value);
        setWindows(undefined);
        setEditing(undefined);
        setNotice("");
      }}>
        <option value="">Selecionar integrante</option>
        {actions.members.map(member => <option key={member.personId} value={member.personId}>{member.displayName}</option>)}
      </select></label>
    </div>
    {personId && <>
      <p>Horário de Brasília. As janelas são consideradas nas escalas do voluntário.</p>
      {windows ? (windows.length ? <ul className={s.availabilityWindows}>{windows.map(window => <li key={window.id}>
        <span>{window.segments.map(item => `${weekdays[item.weekday]}, ${timeLabel(item.startMinute)}–${timeLabel(item.endMinute)}`).join(" / ")}</span>
        {window.segments.length === 1 && <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => setEditing(window)}>Editar</button>}
        <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => void change(
          () => apiDelete(path + "/" + encodeURIComponent(window.id) + query, token), "Disponibilidade removida.",
        )}>Remover</button>
      </li>)}</ul> : <p>Nenhuma janela semanal cadastrada.</p>) : !notice && <p>Carregando disponibilidade…</p>}
      <form className={s.form} key={editing?.id ?? personId} onSubmit={save}>
        <label>Dia da semana<select name="weekday" defaultValue={segment?.weekday ?? 0}>
          {weekdays.map((weekday, index) => <option key={weekday} value={index}>{weekday}</option>)}
        </select></label>
        <label>Das<input type="time" name="starts" required defaultValue={segment ? timeLabel(segment.startMinute) : "09:00"} /></label>
        <label>Até<input type="time" name="ends" required defaultValue={segment && segment.endMinute < 1440 ? timeLabel(segment.endMinute) : "12:00"} /></label>
        <label className={s.checkbox}><input type="checkbox" name="untilMidnight" defaultChecked={segment?.endMinute === 1440} /> Até meia-noite</label>
        <button type="submit" className={ui.workspacePrimary} disabled={busy}>{editing ? "Salvar alterações" : "Adicionar disponibilidade"}</button>
        {editing && <button type="button" className={ui.workspaceSecondary} onClick={() => setEditing(undefined)}>Cancelar edição</button>}
      </form>
    </>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
