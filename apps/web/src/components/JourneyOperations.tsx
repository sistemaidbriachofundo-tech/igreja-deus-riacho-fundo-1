"use client";

import { useState, type FormEvent } from "react";
import { ApiRequestError, apiGet, apiPatch, apiPost } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { clearPanelReads } from "../lib/panel-read";
import s from "./connection-desk.module.css";

type Person = { id: string; displayName: string };
type Enrollment = { id: string; personId: string; personName: string | null; mentorPersonId: string | null; mentorName: string | null; status: string };
type Stage = { id: string; title: string; sortOrder: number };
type Progress = { stages: Array<Stage & { completed: boolean; waived?: boolean }>; currentStageId?: string | null; canComplete?: boolean; enforceOrder?: boolean };
const statusLabels: Record<string, string> = { ACTIVE: "Em andamento", PAUSED: "Pausada", COMPLETED: "Concluída", CANCELLED: "Cancelada" };

function PeopleSearch({ token, label, onSelect }: { token: string; label: string; onSelect: (person: Person) => void }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setPeople(undefined);
    try {
      const result = await apiGet<{ people: Person[] }>("/discipleship/people?q=" + encodeURIComponent(query.trim()), token);
      setPeople(result.people);
    } catch (problem) { setError(dasError(problem)); }
    finally { setBusy(false); }
  }
  return <div>
    <form className={s.operationForm} onSubmit={search}>
      <label>{label}<input value={query} onChange={event => { setQuery(event.target.value); setPeople(undefined); }} disabled={busy} maxLength={100} /></label>
      <button type="submit" className={s.retry} disabled={busy || query.trim().length < 2}>Buscar</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {people?.length === 0 && <p>Nenhuma pessoa encontrada.</p>}
    {people && people.length > 0 && <ul className={s.operationList}>{people.map(person => <li key={person.id}>
      <strong>{person.displayName}</strong><button type="button" className={s.retry} onClick={() => { onSelect(person); setPeople(undefined); setQuery(""); }}>Selecionar <span className={s.srOnly}>{person.displayName}</span></button>
    </li>)}</ul>}
  </div>;
}

export function JourneyOperations({ token, trackId, initialPeople: people, initialStages: stages, onPeopleChange, onStagesChange }: {
  token: string; trackId: string; initialPeople: Enrollment[]; initialStages: Stage[];
  onPeopleChange: (people: Enrollment[]) => void;
  onStagesChange: (stages: Stage[]) => void;
}) {
  const [stageTitle, setStageTitle] = useState("");
  const [stageDescription, setStageDescription] = useState("");
  const [person, setPerson] = useState<Person | null>(null);
  const [mentor, setMentor] = useState<Person | null>(null);
  const [selected, setSelected] = useState("");
  const [progress, setProgress] = useState<Progress>();
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState("");
  const [message, setMessage] = useState("");
  const track = encodeURIComponent(trackId);
  const stagePath = "/discipleship/tracks/" + track + "/stages";
  const enrollmentPath = "/discipleship/enrollments/" + encodeURIComponent(selected);
  const current = people.find(item => item.id === selected);
  const progressPath = enrollmentPath + "/progress";

  async function operate(action: () => Promise<void>, success = "") {
    setBusy(true);
    setFault("");
    setMessage("");
    try {
      await action();
      if (success) { clearPanelReads(); setMessage(success); }
    } catch (error) {
      let message = dasError(error);
      if (error instanceof ApiRequestError && error.status === 409) {
        try {
          const details = JSON.parse(error.message);
          if (typeof details.code === "string" && details.code.startsWith("CONNECTION_") && typeof details.message === "string") message = details.message;
        } catch { /* Keep the general conflict message. */ }
      }
      setFault(message);
    }
    finally { setBusy(false); }
  }

  async function reloadPeople() {
    const result = await apiGet<{ enrollments: Enrollment[] }>("/discipleship/enrollments?trackId=" + track, token);
    onPeopleChange(result.enrollments);
  }

  return <section className={s.section} aria-labelledby="journey-operations">
    <h3 id="journey-operations">Acompanhamento da trilha</h3>
    {fault && <p className={s.notice} role="alert">{fault}</p>}
    {message && <p role="status">{message}</p>}
    <details className={s.operationPanel}>
      <summary>Cadastrar etapa</summary>
      <form className={s.operationForm} onSubmit={event => {
        event.preventDefault();
        void operate(async () => {
          await apiPost(stagePath, token, { title: stageTitle.trim(), description: stageDescription.trim() });
          setStageTitle(""); setStageDescription("");
          const updated = await apiGet<{ stages: Stage[] }>(stagePath, token);
          onStagesChange(updated.stages);
          if (selected) setProgress(await apiGet<Progress>(progressPath, token));
        }, "Etapa cadastrada.");
      }}>
        <label>Nome da etapa<input required maxLength={100} value={stageTitle} onChange={event => setStageTitle(event.target.value)} /></label>
        <label>Orientação para o participante<input maxLength={240} value={stageDescription} onChange={event => setStageDescription(event.target.value)} /></label>
        <button className={s.retry} type="submit" disabled={busy || !stageTitle.trim()}>Salvar etapa</button>
      </form>
    </details>
    <details className={s.operationPanel}>
      <summary>Matricular pessoa</summary>
      <PeopleSearch token={token} label="Nome da pessoa" onSelect={setPerson} />
      {person && <div className={s.requestActions}><strong>{person.displayName}</strong><button className={s.retry} type="button" disabled={busy}
        onClick={() => void operate(async () => {
          await apiPost("/discipleship/enrollments", token, { trackId, personId: person.id });
          setPerson(null);
          await reloadPeople();
        }, "Matrícula registrada.")}>Confirmar matrícula</button></div>}
    </details>
    {people.length === 0 ? <p className={s.notice}>Nenhuma pessoa matriculada.</p> :
      <ul className={s.operationList}>{people.map(row => <li key={row.id}>
        <div><strong>{row.personName || "Participante da trilha"}</strong><span>{statusLabels[row.status] || "Situação não informada"} · {row.mentorName || "Mentor a definir"}</span></div>
        <button type="button" className={s.retry} aria-pressed={selected === row.id} disabled={busy} onClick={() => {
          setSelected(row.id); setMentor(null); setProgress(undefined);
          void operate(async () => {
            setProgress(await apiGet<Progress>("/discipleship/enrollments/" + encodeURIComponent(row.id) + "/progress", token));
          });
        }}>Acompanhar <span className={s.srOnly}>{row.personName}</span></button>
      </li>)}</ul>}
    {current && <div className={s.operationPanel}>
      <h4>{current.personName || "Acompanhamento individual"}</h4>
      <PeopleSearch token={token} label="Nome do mentor" onSelect={setMentor} />
      {mentor && <div className={s.requestActions}>
        <strong>{mentor.displayName}</strong>
        <button type="button" className={s.retry} disabled={busy || mentor.id === current.personId} onClick={() => void operate(async () => {
          await apiPatch(enrollmentPath + "/mentor", token, { mentorPersonId: mentor.id });
          setMentor(null);
          await reloadPeople();
        }, "Mentor atualizado.")}>Salvar mentor</button>
      </div>}
      {stages.length > 0 && progress && <ul className={s.operationList}>{progress.stages.map(stage => <li key={stage.id}>
        <div><strong>{stage.title}</strong><span>{stage.completed ? "Concluída" : stage.waived ? "Não se aplica à modalidade de ingresso" : stage.id === progress.currentStageId ? "Próxima etapa" : "Em aberto"}</span></div>
        {!stage.waived && <button type="button" className={s.retry} disabled={busy || current.status !== "ACTIVE" ||
          (progress.enforceOrder && !stage.completed && stage.id !== progress.currentStageId)}
          onClick={() => void operate(async () => {
            await apiPost(progressPath, token, { stageId: stage.id, kind: stage.completed ? "REOPENED" : "COMPLETED" });
            setProgress(await apiGet<Progress>(progressPath, token));
          }, "Progresso atualizado.")}>{stage.completed ? "Reabrir etapa" : "Concluir etapa"}<span className={s.srOnly}> {stage.title}</span></button>}
      </li>)}</ul>}
      <form className={s.operationForm} onSubmit={event => {
        event.preventDefault();
        const status = new FormData(event.currentTarget).get("status");
        void operate(async () => {
          await apiPatch(enrollmentPath, token, { status });
          await reloadPeople();
        }, "Situação atualizada.");
      }}>
        <label>Situação da matrícula<select name="status" key={current.id + current.status} defaultValue={current.status}>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}
            disabled={value === "COMPLETED" && current.status !== "COMPLETED" && progress?.canComplete === false}>{label}</option>)}
        </select></label>
        <button type="submit" className={s.retry} disabled={busy}>Salvar situação</button>
      </form>
    </div>}
  </section>;
}
