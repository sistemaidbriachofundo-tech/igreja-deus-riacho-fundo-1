"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPatch, apiPost, loadStoredToken } from "../../lib/api";
import { churchLocalToISO, dasError } from "../../lib/das-operations";
import { Alert, Button, Input, Loading, Modal } from "../ui";
import s from "./repertoire-desk.module.css";

type Song = { title: string; musicalKey: string; materials?: string | null };
type Repertoire = { id?: string | null; rosterId: string; serviceAt: string; items: Song[];
  status?: string; scheduledAt?: string | null; sentAt?: string | null };
type Desk = Repertoire & { team?: { personId: string; name: string; role: string }[]; canEdit: boolean };
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const base = "/worship/repertoires";

export function RepertoireDesk({ rosterId, assignmentId }: { rosterId?: string; assignmentId?: string }) {
  const [open, setOpen] = useState(false);
  const [desk, setDesk] = useState<Desk>();
  const [songs, setSongs] = useState<Array<Song & { row: number }>>([]);
  const [sendAt, setSendAt] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const intent = useRef("");
  const nextRow = useRef(0);
  const endpoint = rosterId ? "/worship/rosters/" + encodeURIComponent(rosterId) + "/repertoire"
    : "/worship/assignments/" + encodeURIComponent(assignmentId ?? "") + "/repertoire";

  useEffect(() => {
    const token = loadStoredToken();
    if (!open || !token) return;
    let live = true;
    void apiGet<Desk>(endpoint, token, { fresh: true }).then(result => {
      if (!live) return;
      setDesk(result);
      setSongs((result.items ?? []).map((song, row) => ({ ...song, row })));
      nextRow.current = result.items?.length ?? 0;
    }, problem => { if (live) setError(dasError(problem)); });
    return () => { live = false; };
  }, [endpoint, open, revision]);

  function update(row: number, field: keyof Song, value: string) {
    setSongs(items => items.map(item => item.row === row ? { ...item, [field]: value } : item));
  }

  function move(index: number, delta: number) {
    const destination = index + delta;
    if (destination < 0 || destination >= songs.length) return;
    const copy = [...songs];
    [copy[index], copy[destination]] = [copy[destination], copy[index]];
    setSongs(copy);
  }

  const editable = desk?.canEdit && (!desk.id || desk.status === "DRAFT");
  const canSend = desk?.canEdit && (!desk.status || ["DRAFT", "AUTHORIZED"].includes(desk.status));

  async function save(action: "draft" | "send" | "schedule") {
    const token = loadStoredToken();
    if (!token || !desk?.canEdit || busy) return;
    if (action === "draft" && !editable) return;
    if (action !== "draft" && !canSend) return;
    const scheduledAt = action === "schedule" ? churchLocalToISO(sendAt) : null;
    setError("");
    setNotice("");
    const items = songs.map(({ title, musicalKey, materials }) => ({
      title: title.trim(), musicalKey: musicalKey.trim(), materials: materials?.trim() || null,
    }));
    if (!items.length || items.some(item => !item.title || !item.musicalKey)) {
      setError("Informe o nome e o tom de cada música.");
      return;
    }
    if (action === "schedule" && (!scheduledAt || Date.parse(scheduledAt) <= Date.now())) {
      setError("Escolha data e horário futuros no horário de Brasília.");
      return;
    }
    setBusy(true);
    try {
      let current: Repertoire = desk;
      if (!desk.id) {
        if (!intent.current) intent.current = crypto.randomUUID();
        current = await apiPost<Repertoire>(base, token, { rosterId: desk.rosterId, serviceAt: desk.serviceAt, idempotencyKey: intent.current, items });
      } else if (editable) {
        current = await apiPatch<Repertoire>(base + "/" + encodeURIComponent(desk.id), token, { items });
      }
      if (!current.id) throw new Error("Não foi possível salvar o repertório.");
      setDesk(previous => previous ? { ...previous, ...current } : previous);
      if (action !== "draft") {
        const path = base + "/" + encodeURIComponent(current.id);
        if (current.status === "DRAFT") await apiPost(path + "/authorize", token, {});
        await apiPost(path + "/schedule", token, scheduledAt ? { scheduledAt } : {});
      }
      setRevision(value => value + 1);
      setNotice(action === "draft" ? "Rascunho salvo." : action === "send" ? "Envio solicitado." : "Envio agendado.");
    } catch (problem) {
      setError(dasError(problem));
      setRevision(value => value + 1);
    } finally { setBusy(false); }
  }

  return <>
    <Button variant="secondary" onClick={() => { setError(""); setNotice(""); setOpen(true); }}>Repertório e equipe do culto</Button>
    <Modal open={open} appearance="workspace" title="Repertório e equipe do culto" onClose={() => !busy && setOpen(false)}>
      <div className={s.desk}>
        {error && <Alert appearance="workspace" tone="danger" title={error} />}
        {notice && <Alert appearance="workspace" tone="success" title={notice} />}
        {!desk && !error && <Loading label="Carregando repertório" />}
        {desk && <>
          {desk.team?.length ? <section><h2>Equipe escalada</h2>
            <ul>{desk.team.map((member, index) => <li key={member.personId + "-" + index}>{member.name} · {member.role}</li>)}</ul>
          </section> : null}
          {desk.sentAt ? <p>Enviado em {date.format(new Date(desk.sentAt))}.</p>
            : desk.scheduledAt && <p>Agendado para {date.format(new Date(desk.scheduledAt))}.</p>}
          {editable ? <>
            <Button variant="secondary" disabled={busy || songs.length >= 40} onClick={() => {
              const row = nextRow.current++;
              setSongs(items => [...items, { row, title: "", musicalKey: "" }]);
            }}>Adicionar música</Button>
            <ol className={s.list}>{songs.map((item, index) => <li key={item.row}>
              <div className={s.fields}>
                <Input label="Música" value={item.title} maxLength={160} onChange={event => update(item.row, "title", event.target.value)} />
                <Input label="Tom" value={item.musicalKey} maxLength={16} onChange={event => update(item.row, "musicalKey", event.target.value)} />
                <label>Materiais e orientações<textarea rows={2} value={item.materials ?? ""} maxLength={280}
                  onChange={event => update(item.row, "materials", event.target.value)} /></label>
              </div>
              <div className={s.actions}>
                <Button variant="ghost" disabled={!index || busy} onClick={() => move(index, -1)}>Subir</Button>
                <Button variant="ghost" disabled={index === songs.length - 1 || busy} onClick={() => move(index, 1)}>Descer</Button>
                <Button variant="ghost" disabled={busy} onClick={() => setSongs(items => items.filter(song => song.row !== item.row))}>Remover música</Button>
              </div>
            </li>)}</ol>
            <Button variant="secondary" disabled={busy || !songs.length} onClick={() => void save("draft")}>Salvar rascunho</Button>
          </> : songs.length ? <ol className={s.list} aria-label="Músicas do culto">{songs.map(item => <li key={item.row}>
            <strong>{item.title} · {item.musicalKey}</strong>{item.materials && <p>{item.materials}</p>}
          </li>)}</ol> : <p>Nenhum repertório disponível para este culto.</p>}
          {canSend && <div className={s.actions}>
            <Button disabled={busy || !songs.length} onClick={() => void save("send")}>Enviar agora</Button>
            <Input label="Data e horário de Brasília" type="datetime-local" value={sendAt} onChange={event => setSendAt(event.target.value)} />
            <Button variant="secondary" disabled={busy || !sendAt || !songs.length} onClick={() => void save("schedule")}>Agendar envio</Button>
          </div>}
        </>}
      </div>
    </Modal>
  </>;
}
