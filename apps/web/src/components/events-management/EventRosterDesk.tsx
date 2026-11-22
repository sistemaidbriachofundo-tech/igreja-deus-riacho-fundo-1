"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, type LoginResult } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import type { ManagedEvent } from "../../lib/event-management";
import { findSameDayBlocks, parseRosterList } from "../../lib/serving-rosters";
import { MinistryRosterDesk } from "../serving/MinistryRosterDesk";
import ui from "../ui/ui.module.css";
import s from "./event-management.module.css";

export function EventRosterDesk({ event, token, viewer }: {
  event: ManagedEvent;
  token: string;
  viewer: LoginResult["user"];
}) {
  const path = `/rosters/by-event/${encodeURIComponent(event.id)}`;
  const [data, setData] = useState<{ rosters: ReturnType<typeof parseRosterList>; canCreate: boolean }>();
  const [opened, setOpened] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, refresh] = useState(0);

  useEffect(() => {
    if (!opened) return;
    let current = true;
    void apiGet<{ canCreate?: unknown }>(path, token)
      .then(body => {
        if (current) setData({ rosters: parseRosterList(body), canCreate: body.canCreate === true });
      })
      .catch(error => { if (current) setNotice(dasError(error)); });
    return () => { current = false; };
  }, [opened, path, token, revision, event.status]);

  async function run(url: string, label: string, body?: unknown) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await apiPost(url, token, body);
      refresh(value => value + 1);
      setNotice(label);
    } catch (error) {
      setNotice(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  return <details className={s.panel} id="escala-do-evento" onToggle={event => setOpened(event.currentTarget.open)}>
    <summary>Escala da equipe</summary>
    {notice && <p role="status">{notice}</p>}
    {opened && !data && (notice
      ? <button type="button" className={ui.workspaceSecondary} onClick={() => { setNotice(""); refresh(value => value + 1); }}>Tentar novamente</button>
      : <p role="status">Carregando escala…</p>)}
    {data?.canCreate && <button type="button" disabled={busy}
      className={ui.workspacePrimary} onClick={() => void run(path, "Rascunho da escala criado.")}>Criar escala deste evento</button>}
    {data && <MinistryRosterDesk
      surface="event"
      eventName={event.name}
      eventPeoplePath={path + "/people"}
      ministry={null}
      rosters={data.rosters}
      blocks={findSameDayBlocks(data.rosters)}
      roles={viewer.grants.map(grant => grant.roleCode)}
      actorPersonId={viewer.personId}
      token={token}
      busy={busy}
      notice=""
      onAddSlot={(id, roleLabel, requiresCouple) => void run(`/rosters/${id}/slots`, "Função adicionada.", { roleLabel, requiresCouple })}
      onAssign={(id, personId, partnerPersonId) => void run(`/rosters/slots/${id}/assign`, "Pessoa escalada.", { personId, ...(partnerPersonId && { partnerPersonId }) })}
      onConfirm={id => void run(`/rosters/assignments/${id}/confirm`, "Participação confirmada.")}
      onDecline={id => void run(`/rosters/assignments/${id}/decline`, "Recusa registrada.")}
      onSubstitute={(id, personId) => void run(`/rosters/assignments/${id}/substitute`, "Substituição registrada.", { personId })}
      onPublish={id => void run(`/rosters/${id}/publish`, "Escala publicada.")}
      onClose={id => void run(`/rosters/${id}/close`, "Escala encerrada.")}
    />}
  </details>;
}
