"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AppShell, AppNavLink, usePersonaAccess, UIIcon } from "./AppShell";
import { Button, PageHeader } from "./ui";
import { GroupRequests } from "./GroupRequests";
import { apiGet, apiPatch, apiPost, loadStoredToken } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { readPanel } from "../lib/panel-read";
import { JourneyOperations, PeopleSearch, type ConnectionPerson } from "./JourneyOperations";
import s from "./connection-desk.module.css";

type Track = { id: string; name: string; description: string | null };
type Group = { id: string; name: string; meetsAtHint: string | null; memberCount: number; leaderAssigned: boolean; leader?: ConnectionPerson };
type Stage = { id: string; title: string; sortOrder: number; description?: string | null };
type Walk = { id: string; personId: string; personName: string | null; mentorPersonId: string | null; mentorName: string | null; status: string };
type Read<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };
type Journey = { track: Track; stages: Stage[] | null; enrollments: Walk[] | null };

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
  const permitted = access.canManageConnection === true;
  const [token, setToken] = useState("");
  const [journey, setJourney] = useState<Read<Journey | null>>({ status: "loading" });
  const [groups, setGroups] = useState<Read<Group[]>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [fault, setFault] = useState("");
  const [groupEditor, setGroupEditor] = useState<Group | "new" | null>(null);
  const [groupLeader, setGroupLeader] = useState<ConnectionPerson | null | undefined>();
  const [groupFeedback, setGroupFeedback] = useState("");
  const [groupError, setGroupError] = useState("");
  const [busy, setBusy] = useState(false);
  const roleKey = roles.join("|");

  useEffect(() => {
    if (access.kind !== "ready" || !permitted) return;
    const token = loadStoredToken();
    if (!token) return;
    setToken(token);
    let active = true;
    const read = (path: string) => readPanel(token, path, () => apiGet<unknown>(path, token), { fresh: attempt > 0 });
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

  useEffect(() => {
    if (access.kind !== "ready" || !permitted) return;
    const id = window.location.hash.slice(1);
    if (["trilha", "grupos", "pedidos"].includes(id)) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [access.kind, permitted]);

  if (access.kind !== "ready" || !permitted) return null;
  const tracking = journey.status === "ready" ? journey.data : null;
  const canRetry = journey.status === "error" || groups.status === "error"
    || (tracking && (tracking.stages === null || tracking.enrollments === null));
  async function createConnection() {
    setBusy(true);
    setFault("");
    try {
      await apiPost("/discipleship/tracks", token, { name: "Trilha da Conexão" });
      setAttempt(value => value + 1);
    } catch (error) {
      setFault(dasError(error));
    } finally {
      setBusy(false);
    }
  }
  async function saveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupEditor || busy) return;
    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get("name")).trim(),
      meetsAtHint: String(form.get("schedule")).trim(),
      ...(groupLeader !== undefined ? { leaderPersonId: groupLeader?.id ?? null } : {}),
    };
    setBusy(true);
    setGroupError("");
    try {
      if (groupEditor === "new") await apiPost("/small-groups", token, body);
      else await apiPatch("/small-groups/" + encodeURIComponent(groupEditor.id), token, body);
      setGroupFeedback(groupEditor === "new" ? "Grupo cadastrado." : "Grupo atualizado.");
      setGroupEditor(null);
      try {
        setGroups({ status: "ready", data: parseGroups(await apiGet("/small-groups", token)) });
      } catch {
        setGroups({ status: "error" });
      }
    } catch (error) {
      setGroupError(dasError(error));
    } finally {
      setBusy(false);
    }
  }
  function editGroup(group: Group | "new") {
    setGroupEditor(group);
    setGroupLeader(undefined);
    setGroupFeedback("");
    setGroupError("");
  }

  return <div className={s.page}>
    <PageHeader appearance="workspace" heading="h1" title="Conexão e caminhada"
      description="Acompanhe a integração e organize os Grupos de Amizade."
      actions={canRetry ? <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>
        Tentar novamente
      </Button> : undefined} />

    <section id="trilha" className={s.section} aria-labelledby="trilha-conexao">
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
        {token && tracking.stages && tracking.enrollments && <JourneyOperations
          token={token} trackId={tracking.track.id} initialPeople={tracking.enrollments} initialStages={tracking.stages}
          onPeopleChange={enrollments => setJourney({ status: "ready", data: { ...tracking, enrollments } })}
          onStagesChange={stages => setJourney({ status: "ready", data: { ...tracking, stages } })}
        />}
      </> : <div>
        <p className={s.notice}>A Trilha Conexão aguarda cadastro pela liderança.</p>
        {token && journey.status === "ready" && <button type="button" className={s.retry} disabled={busy} onClick={() => void createConnection()}>Criar Trilha da Conexão</button>}
        {fault && <p role="alert">{fault}</p>}
      </div>}
    </section>

    <section id="grupos" className={s.section} aria-labelledby="grupos-amizade">
      <div className={s.sectionTitle}>
        <h2 id="grupos-amizade">Grupos de Amizade</h2>
        {token && <button className={s.primaryAction} type="button" onClick={() => editGroup("new")}>
          <UIIcon name="plus" size={17} /> Novo grupo
        </button>}
      </div>
      {groupFeedback && <p className={s.notice} role="status">{groupFeedback}</p>}
      {groupError && <p className={s.notice} role="alert">{groupError}</p>}
      {groupEditor && <div className={s.groupEdit} key={groupEditor === "new" ? "new" : groupEditor.id}>
        <h3>{groupEditor === "new" ? "Cadastrar grupo" : "Editar " + groupEditor.name}</h3>
        <form id="grupo-form" className={s.operationForm} onSubmit={saveGroup}>
        <label>Nome do grupo<input name="name" required maxLength={100} defaultValue={groupEditor === "new" ? "" : groupEditor.name} autoFocus /></label>
        <label>Dia, hora e local<input name="schedule" maxLength={180} defaultValue={groupEditor === "new" ? "" : groupEditor.meetsAtHint ?? ""} placeholder="Ex. terças, 19h30 · Riacho Fundo I" /></label>
        </form>
        <p><strong>Responsável</strong> · {groupLeader === undefined && groupEditor !== "new" ? groupEditor.leader?.displayName ?? "A definir" : groupLeader?.displayName ?? "A definir"}</p>
        <PeopleSearch token={token} label="Buscar responsável pelo nome" onSelect={setGroupLeader} />
        <div className={s.requestActions}>
          <button type="submit" form="grupo-form" className={s.primaryAction} disabled={busy}>{busy ? "Salvando…" : "Salvar grupo"}</button>
          <button type="button" className={s.retry} disabled={busy} onClick={() => { setGroupEditor(null); setGroupError(""); }}>Cancelar</button>
        </div>
      </div>}
      {groups.status === "loading" ? <div className={s.load} role="status" aria-label="Carregando grupos"><span/></div> :
      groups.status === "error" ? <p className={s.notice} role="alert">Não foi possível consultar os grupos agora.</p> :
      groups.data.length ? <div className={s.groups}>{groups.data.map(group => <article key={group.id} className={s.group}>
        <h3>{group.name}</h3>
        <p>{group.meetsAtHint || "Horário ainda não informado"}</p>
        <div><span>{group.memberCount} participantes registrados</span><small>{group.leader?.displayName ?? (group.leaderAssigned ? "Responsável cadastrado" : "Responsável ainda não definido")}</small></div>
        {token && <button className={s.retry} type="button" onClick={() => editGroup(group)}>Editar grupo<span className={s.srOnly}> {group.name}</span></button>}
      </article>)}</div> :
      <p className={s.notice}>Nenhum Grupo de Amizade cadastrado nesta congregação.</p>}
    </section>
    {token && <div id="pedidos"><GroupRequests manage token={token} /></div>}
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
    const leaderId = valueText(data?.leaderPersonId), leaderName = valueText(data?.leaderName);
    return [{ id, name, meetsAtHint: valueText(data?.meetsAtHint) || null,
      memberCount: Array.isArray(data?.members) ? data.members.length : 0,
      leaderAssigned: Boolean(leaderId), ...(leaderId && leaderName ? { leader: { id: leaderId, displayName: leaderName } } : {}) }];
  });
}
export function parseStages(value: unknown): Stage[] {
  const rows = record(value)?.stages;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => {
    const d = record(row); const id = valueText(d?.id), title = valueText(d?.title);
    const sortOrder = typeof d?.sortOrder === "number" ? d.sortOrder : 0;
    return id && title ? [{id,title,sortOrder, description: valueText(d?.description) || null}] : [];
  }).sort((a,b)=>a.sortOrder-b.sortOrder);
}
export function parseWalks(value: unknown): Walk[] {
  const rows = record(value)?.enrollments;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => {
    const d = record(row); const id=valueText(d?.id);
    return id ? [{
      id, personId: valueText(d?.personId), personName: valueText(d?.personName) || null,
      mentorPersonId: valueText(d?.mentorPersonId) || null, mentorName: valueText(d?.mentorName) || null,
      status: valueText(d?.status),
    }] : [];
  });
}
