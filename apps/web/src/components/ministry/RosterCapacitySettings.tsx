"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPatch, ApiRequestError } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { ROSTER_SERVICE_TYPES, type EscalaModule, type RosterServiceType } from "../../lib/ministry-presentation";
import s from "./roster-showcase.module.css";

type Capacity = { capacities: Record<RosterServiceType, number> };

export function RosterCapacitySettings({ token, ministryId, modules, initialModuleId, onSaved }: {
  token: string;
  ministryId: string;
  modules: EscalaModule[];
  initialModuleId?: string;
  onSaved: () => void;
}) {
  const [moduleId, setModuleId] = useState(initialModuleId ?? modules[0]?.id);
  const [loaded, setLoaded] = useState<{ path: string; data: Capacity }>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [cultType, setCultType] = useState<RosterServiceType>("sunday_morning");
  const team = modules.find(item => item.id === moduleId);
  const path = team ? `/ministries/${encodeURIComponent(ministryId)}/roster-modules/${encodeURIComponent(team.id)}/capacity` : "";
  const data = loaded?.path === path ? loaded.data : undefined;
  const count = data?.capacities?.[cultType];

  useEffect(() => {
    if (!path) return;
    let active = true;
    void apiGet<Capacity>(path, token).then(data => {
      if (active) setLoaded({ path, data });
    }).catch(error => {
      if (!active) return;
      setNotice(error instanceof ApiRequestError && [404, 405].includes(error.status ?? 0)
        ? "O ajuste de vagas ainda está indisponível neste ambiente." : dasError(error));
    });
    return () => { active = false; };
  }, [path, token]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(new FormData(event.currentTarget).get("count"));
    if (busy || !data || !Number.isInteger(value) || value < 0 || value > 30) return;
    setBusy(true);
    setNotice("");
    try {
      const next = await apiPatch<Capacity>(path, token, { cultType, count: value });
      setLoaded({ path, data: next });
      setNotice("Quantidade de vagas salva.");
      onSaved();
    } catch (error) {
      setNotice(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  return <section className={s.capacity} aria-label="Vagas por culto">
    <h3>Vagas por culto</h3>
    <p>O ajuste vale para as próximas simulações da equipe.</p>
    {modules.length > 1 && <label>Equipe
      <select value={team?.id ?? ""} disabled={busy} onChange={event => {
        setNotice("");
        setModuleId(event.target.value);
      }}>
        {modules.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>}
    {modules.length === 1 && <p><strong>{team?.name}</strong></p>}
    {data && <form onSubmit={save}>
      <label>Tipo de culto
        <select value={cultType} disabled={busy} onChange={event => {
          setNotice("");
          setCultType(event.target.value as RosterServiceType);
        }}>
          {Object.entries(ROSTER_SERVICE_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      {typeof count === "number" && <label>Quantidade de vagas
        <input key={`${path}:${cultType}:${count}`} name="count" type="number" min={0} max={30} required defaultValue={count} disabled={busy} />
      </label>}
      <button type="submit" className={s.primary} disabled={busy || typeof count !== "number"}>{busy ? "Salvando…" : "Salvar vagas"}</button>
    </form>}
    {!data && !notice && <p role="status">Carregando quantidade de vagas…</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
