"use client";

import { useEffect, useState } from "react";
import { AppShell, AppNavLink, usePersonaAccess, UIIcon } from "./AppShell";
import { apiGet, loadStoredToken } from "../lib/api";
import { readPanel } from "../lib/panel-read";
import s from "./connection-desk.module.css";

type Track = { id: string; name: string; description: string | null };
type Group = { id: string; name: string; meetsAtHint: string | null; memberCount: number; leaderAssigned: boolean };
type Stage = { id: string; title: string; sortOrder: number };
type Walk = { id: string; mentorPersonId: string | null; status: string };
type State = {
  status: "loading" | "ready" | "unavailable";
  track: Track | null; stages: Stage[]; enrollments: Walk[]; groups: Group[];
  tracksError: boolean; groupsError: boolean;
};
const initial: State = { status: "loading", track: null, stages: [], enrollments: [], groups: [], tracksError: false, groupsError: false };
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
  const [state, setState] = useState<State>(initial);
  const roleKey = roles.join("|");

  useEffect(() => {
    if (access.kind !== "ready" || !permitted) return;
    const token = loadStoredToken();
    if (!token) return;
    let active = true;
    const read = (path: string) => readPanel(token, path, () => apiGet<unknown>(path, token));
    setState(initial);
    void Promise.allSettled([read("/discipleship/tracks"), read("/small-groups")]).then(async ([tracksRes, groupsRes]) => {
      if (!active) return;
      const tracks = tracksRes.status === "fulfilled" ? parseTracks(tracksRes.value) : [];
      const track = tracks.find(t => /conex[aã]o/i.test(t.name)) ?? null;
      const groups = groupsRes.status === "fulfilled" ? parseGroups(groupsRes.value) : [];
      let stages: Stage[] = [];
      let enrollments: Walk[] = [];
      if (track) {
        const results = await Promise.allSettled([
          read("/discipleship/tracks/" + encodeURIComponent(track.id) + "/stages"),
          read("/discipleship/enrollments?trackId=" + encodeURIComponent(track.id)),
        ]);
        if (results[0].status === "fulfilled") stages = parseStages(results[0].value);
        if (results[1].status === "fulfilled") enrollments = parseWalks(results[1].value);
      }
      if (active) setState({
        status: "ready", track, stages, enrollments, groups,
        tracksError: tracksRes.status === "rejected", groupsError: groupsRes.status === "rejected",
      });
    }).catch(() => { if (active) setState({ ...initial, status: "unavailable" }); });
    return () => { active = false; };
  }, [access.kind, permitted, roleKey]);

  if (access.kind !== "ready" || !permitted) return null;
  return <div className={s.page}>
    <header className={s.heading}>
      <span className={s.kicker}>CUIDADO E PERTENCIMENTO</span>
      <h1>Conexão e caminhada</h1>
      <p>Da primeira visita à integração. Uma jornada acompanhada por pessoas, não apenas por etapas do sistema.</p>
    </header>

    <div className={s.leaderNote}>
      <UIIcon name="people" size={23}/>
      <div><strong>Liderança da Trilha Conexão</strong>
        <p>A igreja terá um líder responsável pelo acompanhamento. A pessoa ainda não foi indicada neste sistema; a designação deve ser formalizada antes de iniciar a operação.</p>
      </div>
    </div>

    <section className={s.section} aria-labelledby="trilha-conexao">
      <div className={s.sectionTitle}>
        <span className={s.kicker}>01 · DA DECISÃO AO PERTENCIMENTO</span>
        <h2 id="trilha-conexao">Trilha Conexão</h2>
      </div>
      {state.status === "loading" ? <div className={s.load} role="status" aria-label="Carregando trilha"><span/></div> :
      state.tracksError ? <p className={s.notice} role="alert">Não foi possível consultar a trilha. Nenhum acompanhamento foi estimado.</p> :
      state.track ? <>
        <p className={s.note}>{state.track.description || "Etapas de acolhimento e integração cadastradas pela igreja."}</p>
        <div className={s.progressRow}>
          <div><strong>{state.enrollments.length}</strong><span>Pessoas acompanhadas</span></div>
          <div><strong>{state.enrollments.filter(w => w.mentorPersonId).length}</strong><span>Com mentor registrado</span></div>
          <div><strong>{state.enrollments.filter(w => w.status === "COMPLETED").length}</strong><span>Trilhas concluídas</span></div>
        </div>
        <ol className={s.steps}>
          {state.stages.map(stage => <li key={stage.id}><span>{String(stage.sortOrder).padStart(2, "0")}</span><strong>{stage.title}</strong></li>)}
        </ol>
        {!state.stages.length && <p className={s.notice}>A trilha existe no banco, mas ainda não tem etapas cadastradas.</p>}
      </> : <p className={s.notice}>A Trilha Conexão ainda não foi cadastrada no banco. Sua sequência deve ser aprovada pelo líder antes de registrar etapas e pessoas.</p>}
      <p className={s.subnote}>O material enviado pela igreja orienta a jornada: recepção, primeiro cuidado, Primeiros Passos, batismo, integração e DNA e Serviço. As etapas exibidas acima vêm exclusivamente dos registros oficiais do sistema.</p>
    </section>

    <section className={s.section} aria-labelledby="grupos-amizade">
      <div className={s.sectionTitle}>
        <span className={s.kicker}>02 · RELACIONAMENTOS QUE PERMANECEM</span>
        <h2 id="grupos-amizade">Grupos de Amizade</h2>
        <p>Consulta interna para secretaria e liderança. Esses dados não aparecem no portal público.</p>
      </div>
      {state.status === "loading" ? <div className={s.load} role="status" aria-label="Carregando grupos"><span/></div> :
      state.groupsError ? <p className={s.notice} role="alert">Não foi possível consultar os grupos agora.</p> :
      state.groups.length ? <div className={s.groups}>{state.groups.map(group => <article key={group.id} className={s.group}>
        <h3>{group.name}</h3>
        <p>{group.meetsAtHint || "Horário ainda não informado"}</p>
        <div><span>{group.memberCount} participantes registrados</span><small>{group.leaderAssigned ? "Responsável cadastrado" : "Responsável ainda não definido"}</small></div>
      </article>)}</div> :
      <p className={s.notice}>Nenhum Grupo de Amizade cadastrado nesta congregação.</p>}
    </section>
    <p className={s.footerNote}>Acesso restrito por perfil e congregação. Matrículas, mentores e frequência são consultados na API autorizada.</p>
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
