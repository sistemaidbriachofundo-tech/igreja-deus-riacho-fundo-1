"use client";

import { useEffect, useState } from "react";
import { AppShell, AppNavLink, usePersonaAccess, UIIcon } from "./AppShell";
import { GroupRequests } from "./GroupRequests";
import { apiGet, loadStoredToken } from "../lib/api";
import { readPanel } from "../lib/panel-read";
import s from "./connection-desk.module.css";

type Track = { id: string; name: string; description: string | null };
type Group = { id: string; name: string; meetsAtHint: string | null; memberCount: number; leaderAssigned: boolean };
type Stage = { id: string; title: string; sortOrder: number };
type Walk = { id: string; mentorPersonId: string | null; status: string };
type Read<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };
type Journey = { track: Track; stages: Stage[] | null; enrollments: Walk[] | null };
export const CONNECTION_ROLES = ["PLATFORM_ADMIN", "SECRETARIA", "PASTOR", "LIDER_MINISTERIO"] as const;

/**
 * Exibe somente dados retornados pela API autenticada; não fabrica responsável,
 * matrícula, progresso ou frequência. A nomeação do líder será uma decisão da igreja.
 */
export function ConnectionDesk() {
  return <AppShell active="conexao" meta="Conexão e Trilhas"><ConnectionContent /></AppShell>;
}

function ConnectionContent() {
  const access = usePersonaAccess();
  const roles = access.kind === "ready" ? access.roles : [];
  const permitted = roles.some(role => CONNECTION_ROLES.includes(role as typeof CONNECTION_ROLES[number]));
  const [token, setToken] = useState("");
  const [journey, setJourney] = useState<Read<Journey | null>>({ status: "loading" });
  const [groups, setGroups] = useState<Read<Group[]>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const roleKey = roles.join("|");

  useEffect(() => {
    if (access.kind !== "ready" || !permitted) return;
    const token = loadStoredToken();
    if (!token) return;
    setToken(token);
    let active = true;
    const read = (path: string) => readPanel(token, path, () => apiGet<unknown>(path, token));
    setJourney({ status: "loading" });
    setGroups({ status: "loading" });
    void read("/small-groups").then(payload => {
      if (active) setGroups({ status: "ready", data: parseGroups(payload) });
    }).catch(() => { if (active) setGroups({ status: "error" }); });
    void read("/discipleship/tracks").then(async payload => {
      if (!active) return;
      const track = parseTracks(payload).find(item => /conex[aã]o/i.test(item.name));
      if (!track) {
        setJourney({ status: "ready", data: null });
        return;
      }
      const id = encodeURIComponent(track.id);
      const [stages, enrollments] = await Promise.allSettled([
        read("/discipleship/tracks/" + id + "/stages"),
        read("/discipleship/enrollments?trackId=" + id),
      ]);
      if (active) setJourney({ status: "ready", data: {
        track,
        stages: stages.status === "fulfilled" ? parseStages(stages.value) : null,
        enrollments: enrollments.status === "fulfilled" ? parseWalks(enrollments.value) : null,
      } });
    }).catch(() => { if (active) setJourney({ status: "error" }); });
    return () => { active = false; };
  }, [access.kind, permitted, roleKey, attempt]);

  if (access.kind !== "ready" || !permitted) return null;
  const tracking = journey.status === "ready" ? journey.data : null;
  const canRetry = journey.status === "error" || groups.status === "error"
    || (tracking && (tracking.stages === null || tracking.enrollments === null));
  return <div className={s.page}>
    <header className={s.heading}>
      <h1>Conexão e caminhada</h1>
      <p>Acompanhe a integração e consulte os Grupos de Amizade da congregação.</p>
      {canRetry && <button type="button" className={s.retry} onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button>}
    </header>

    <div className={s.leaderNote}>
      <UIIcon name="people" size={23}/>
      <div><strong>Liderança da Trilha Conexão</strong>
        <p>A igreja vai indicar quem coordena a trilha. Os mentores acompanham cada pessoa inscrita.</p>
      </div>
    </div>

    <section className={s.section} aria-labelledby="trilha-conexao">
      <div className={s.sectionTitle}>
        <h2 id="trilha-conexao">Trilha Conexão</h2>
      </div>
      {journey.status === "loading" ? <div className={s.load} role="status" aria-label="Carregando trilha"><span/></div> :
      journey.status === "error" ? <p className={s.notice} role="alert">Não foi possível consultar a trilha.</p> :
      tracking ? <>
        {tracking.track.description && <p className={s.note}>{tracking.track.description}</p>}
        {tracking.enrollments ? <div className={s.progressRow}>
          <div><strong>{tracking.enrollments.length}</strong><span>Pessoas acompanhadas</span></div>
          <div><strong>{tracking.enrollments.filter(w => w.mentorPersonId).length}</strong><span>Com mentor registrado</span></div>
          <div><strong>{tracking.enrollments.filter(w => w.status === "COMPLETED").length}</strong><span>Trilhas concluídas</span></div>
        </div> : <p className={s.notice} role="alert">A lista de acompanhamentos está indisponível.</p>}
        <ol className={s.steps}>
          {tracking.stages?.map(stage => <li key={stage.id}><span>{stage.sortOrder}</span><strong>{stage.title}</strong></li>)}
        </ol>
        {tracking.stages === null && <p className={s.notice} role="alert">As etapas da trilha estão indisponíveis.</p>}
        {tracking.stages?.length === 0 && <p className={s.notice}>Nenhuma etapa cadastrada.</p>}
      </> : <p className={s.notice}>A Trilha Conexão aguarda cadastro pela liderança.</p>}
    </section>

    <section className={s.section} aria-labelledby="grupos-amizade">
      <div className={s.sectionTitle}>
        <h2 id="grupos-amizade">Grupos de Amizade</h2>
      </div>
      {groups.status === "loading" ? <div className={s.load} role="status" aria-label="Carregando grupos"><span/></div> :
      groups.status === "error" ? <p className={s.notice} role="alert">Não foi possível consultar os grupos agora.</p> :
      groups.data.length ? <div className={s.groups}>{groups.data.map(group => <article key={group.id} className={s.group}>
        <h3>{group.name}</h3>
        <p>{group.meetsAtHint || "Horário ainda não informado"}</p>
        <div><span>{group.memberCount} participantes registrados</span><small>{group.leaderAssigned ? "Responsável cadastrado" : "Responsável ainda não definido"}</small></div>
      </article>)}</div> :
      <p className={s.notice}>Nenhum Grupo de Amizade cadastrado nesta congregação.</p>}
    </section>
    {token && <GroupRequests manage token={token} />}
    <AppNavLink href="/app/ministerios/" className={s.back}><UIIcon name="arrow" size={16}/> Voltar aos ministérios</AppNavLink>
  </div>;
}

function record(value: unknown): Record<string,unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string,unknown> : null;
}
const valueText = (x: unknown): string => typeof x === "string" ? x.trim() : "";
export function parseTracks(value: unknown): Track[] {
  const rows = record(value)?.tracks;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => {
    const data = record(row); const id = valueText(data?.id), name = valueText(data?.name);
    return id && name ? [{id, name, description: valueText(data?.description) || null}] : [];
  });
}
export function parseGroups(value: unknown): Group[] {
  const rows = record(value)?.groups;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => {
    const data = record(row); const id = valueText(data?.id), name = valueText(data?.name);
    if (!id || !name) return [];
    return [{ id, name, meetsAtHint: valueText(data?.meetsAtHint) || null,
      memberCount: Array.isArray(data?.members) ? data.members.length : 0,
      leaderAssigned: Boolean(valueText(data?.leaderPersonId)) }];
  });
}
export function parseStages(value: unknown): Stage[] {
  const rows = record(value)?.stages;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => {
    const d = record(row); const id = valueText(d?.id), title = valueText(d?.title);
    const sortOrder = typeof d?.sortOrder === "number" ? d.sortOrder : 0;
    return id && title ? [{id,title,sortOrder}] : [];
  }).sort((a,b)=>a.sortOrder-b.sortOrder);
}
export function parseWalks(value: unknown): Walk[] {
  const rows = record(value)?.enrollments;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => {
    const d = record(row); const id=valueText(d?.id);
    return id ? [{ id, mentorPersonId: valueText(d?.mentorPersonId)||null, status: valueText(d?.status) }] : [];
  });
}
