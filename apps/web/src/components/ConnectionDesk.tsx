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

type Track = { id: string; name: string; code?: string | null; description: string | null };
type Group = {
  id: string; name: string; meetsAtHint: string | null; memberCount: number; leaderAssigned: boolean;
  leader?: ConnectionPerson; meetingAddress?: string; photoUrl?: string; contactWhatsApp?: string; publicListed?: boolean;
};
type Stage = { id: string; title: string; sortOrder: number; description?: string | null };
type Walk = { id: string; personId: string; personName: string | null; mentorPersonId: string | null; mentorName: string | null; status: string; currentStageId?: string | null };
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
  const [selectedStageId, setSelectedStageId] = useState("");
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
      const tracks = parseTracks(payload);
      const track = tracks.find(item => item.code === "conexao")
        ?? tracks.find(item => item.code === undefined && /^(?:trilha\s+(?:da\s+)?)?conex[aã]o$/i.test(item.name));
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
      meetingAddress: String(form.get("address")).trim(),
      photoUrl: String(form.get("photo")).trim(),
      contactWhatsApp: String(form.get("contact")).replace(/\D/g, ""),
      publicListed: form.get("publicListed") === "on",
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
        <h2 id="trilha-conexao"><span className={s.sectionIcon}><UIIcon name="layers" size={22} /></span>Trilha da Conexão</h2>
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
        {tracking.stages && tracking.enrollments && <section className={s.stageBoard} aria-labelledby="conexao-por-etapa">
          <h3 id="conexao-por-etapa">Pessoas por etapa</h3>
          <div className={s.stageChoices} role="group" aria-label="Etapas em acompanhamento">
            {tracking.stages.map(stage => {
              const total = tracking.enrollments?.filter(walk => walk.currentStageId === stage.id).length ?? 0;
              return <button className={s.stageChoice} key={stage.id} type="button" aria-pressed={selectedStageId === stage.id}
                onClick={() => setSelectedStageId(stage.id)}>
                <span>{stage.title}</span><strong>{total}</strong>
              </button>;
            })}
          </div>
          {selectedStageId && <div className={s.stagePeople} aria-live="polite">
            <h4>{tracking.stages.find(stage => stage.id === selectedStageId)?.title}</h4>
            {tracking.enrollments.some(walk => walk.currentStageId === selectedStageId)
              ? <ul className={s.operationList}>{tracking.enrollments.filter(walk => walk.currentStageId === selectedStageId).map(walk =>
                <li key={walk.id}><strong>{walk.personName ?? "Pessoa matriculada"}</strong>
                  <span>{walk.mentorName ?? "Mentor a definir"}</span></li>,
              )}</ul>
              : <p>Nenhuma pessoa nesta etapa.</p>}
          </div>}
        </section>}
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
        <h2 id="grupos-amizade"><span className={s.sectionIcon}><UIIcon name="people" size={22} /></span>Grupos de Amizade</h2>
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
        <label>Dia e horário<input name="schedule" maxLength={180} defaultValue={groupEditor === "new" ? "" : groupEditor.meetsAtHint ?? ""} placeholder="Ex. terças, 19h30" /></label>
        <label>Endereço do encontro<input name="address" maxLength={200} defaultValue={groupEditor === "new" ? "" : groupEditor.meetingAddress} /></label>
        <label>WhatsApp do grupo ou responsável<input name="contact" type="tel" maxLength={24} autoComplete="off" defaultValue={groupEditor === "new" ? "" : groupEditor.contactWhatsApp} /></label>
        <label>URL da foto (HTTPS)<input name="photo" type="url" maxLength={500} defaultValue={groupEditor === "new" ? "" : groupEditor.photoUrl} /></label>
        <label className={s.groupPublish}>
          <input name="publicListed" type="checkbox" defaultChecked={groupEditor !== "new" && groupEditor.publicListed} />
          <span>Publicar este grupo no site com o endereço e o WhatsApp autorizados</span>
        </label>
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
        {group.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={s.groupPhoto} src={group.photoUrl} alt="" loading="lazy" />
        )}
        <h3>{group.name}</h3>
        <p><UIIcon name="calendar" size={16} />{group.meetsAtHint || "Horário ainda não informado"}</p>
        {group.meetingAddress && <p>{group.meetingAddress}</p>}
        <div className={s.groupDetails}>
          <span><UIIcon name="people" size={16} />{group.memberCount} {group.memberCount === 1 ? "participante" : "participantes"}</span>
          <small><UIIcon name="badge" size={16} />{group.leader?.displayName ?? (group.leaderAssigned ? "Responsável cadastrado" : "Responsável a definir")}</small>
          <small>{group.publicListed ? "Visível no portal" : "Exibido na área logada"}</small>
        </div>
        {token && <button className={s.retry} type="button" onClick={() => editGroup(group)}>Editar grupo <UIIcon name="arrow" size={15} /><span className={s.srOnly}> {group.name}</span></button>}
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
    return id && name ? [{ id, name, code: data?.code === undefined ? undefined : valueText(data.code) || null, description: valueText(data?.description) || null }] : [];
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
      ...(data?.meetingAddress ? { meetingAddress: valueText(data.meetingAddress) } : {}),
      ...(data?.photoUrl ? { photoUrl: valueText(data.photoUrl) } : {}),
      ...(data?.contactWhatsApp ? { contactWhatsApp: valueText(data.contactWhatsApp) } : {}),
      ...(data?.publicListed === true ? { publicListed: true } : {}),
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
      currentStageId: valueText(d?.currentStageId) || null,
      status: valueText(d?.status),
    }] : [];
  });
}
