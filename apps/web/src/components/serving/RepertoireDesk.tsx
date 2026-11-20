"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPatch, apiPost, loadStoredToken } from "../../lib/api";
import { churchLocalToISO, dasError } from "../../lib/das-operations";
import { Alert, Button, Input, Loading, Modal } from "../ui";
import s from "./repertoire-desk.module.css";

type Song = { title: string; key?: string; note?: string; audio?: string; chord?: string; lyrics?: string; video?: string };
type Desk = { songs: Song[]; catalog?: Song[]; team?: { personId: string; name: string; role: string }[];
  canEdit: boolean; status?: string; scheduledAt?: string | null; sentAt?: string | null };
const resources = [["audio", "Áudio"], ["chord", "Cifra"], ["lyrics", "Letra"], ["video", "Vídeo"]] as const;
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function https(value: string | undefined): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { return; }
}

export function RepertoireDesk({ rosterId, assignmentId }: { rosterId?: string; assignmentId?: string }) {
  const [open, setOpen] = useState(false);
  const [desk, setDesk] = useState<Desk>();
  const [songs, setSongs] = useState<Song[]>([]);
  const [song, setSong] = useState("");
  const [draftRows, setDraftRows] = useState<number[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [sendAt, setSendAt] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const endpoint = rosterId ? "/rosters/" + encodeURIComponent(rosterId) + "/repertoire"
    : "/rosters/assignments/" + encodeURIComponent(assignmentId ?? "") + "/repertoire";

  useEffect(() => {
    const token = loadStoredToken();
    if (!open || !token) return;
    let live = true;
    void apiGet<Desk>(endpoint, token).then(
      result => {
        if (!live) return;
        const loaded = result.songs ?? [];
        setDesk(result);
        setSongs(loaded);
        setDraftRows(loaded.map((_, index) => index));
        setNextKey(loaded.length);
      },
      problem => { if (live) setError(dasError(problem)); },
    );
    return () => { live = false; };
  }, [endpoint, open, revision]);

  function update(index: number, field: keyof Song, value: string) {
    setSongs(items => items.map((item, position) => position === index ? { ...item, [field]: value } : item));
  }
  function move(index: number, delta: number) {
    const destination = index + delta;
    if (destination < 0 || destination >= songs.length) return;
    const swap = <T,>(items: T[]) => {
      const copy = [...items];
      [copy[index], copy[destination]] = [copy[destination], copy[index]];
      return copy;
    };
    setSongs(swap);
    setDraftRows(swap);
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = song.trim();
    if (!title) return;
    const saved = desk?.catalog?.find(item => item.title === title);
    setSongs(items => [...items, saved ?? { title }]);
    setDraftRows(items => [...items, nextKey]);
    setNextKey(value => value + 1);
    setSong("");
  }

  async function save(action: "draft" | "send" | "schedule") {
    const token = loadStoredToken();
    if (!token || !desk?.canEdit || busy) return;
    const scheduled = action === "schedule" ? churchLocalToISO(sendAt) : null;
    setError("");
    setNotice("");
    if ((action !== "draft" && !songs.length) || songs.some(item => !item.title.trim())) {
      setError("Informe o nome de cada música antes de salvar ou enviar.");
      return;
    }
    if (songs.some(item => resources.some(([id]) => Boolean(item[id] && !https(item[id]))))) {
      setError("Use links HTTPS para os materiais da equipe.");
      return;
    }
    if (action === "schedule" && (!scheduled || Date.parse(scheduled) <= Date.now())) {
      setError("Escolha data e horário futuros no horário de Brasília.");
      return;
    }
    setBusy(true);
    try {
      await apiPatch(endpoint, token, { songs: songs.map(item => ({ ...item, title: item.title.trim() })) });
      if (action !== "draft") await apiPost(endpoint + "/send", token, scheduled ? { scheduledAt: scheduled } : {});
      setRevision(value => value + 1);
      setNotice(action === "send" ? "Envio solicitado." : action === "schedule" ? "Envio agendado." : "Rascunho salvo.");
    } catch (problem) {
      setError(dasError(problem));
    } finally {
      setBusy(false);
    }
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
            <ul>{desk.team.map((item, index) => <li key={item.personId + "-" + index}>{item.name} · {item.role}</li>)}</ul>
          </section> : null}
          {desk.sentAt && <p>Enviado em {date.format(new Date(desk.sentAt))}.</p>}
          {desk.scheduledAt && <p>Agendado para {date.format(new Date(desk.scheduledAt))}.</p>}
          {desk.canEdit ? <>
            <form className={s.actions} onSubmit={add}>
              <Input label="Música" list="worship-song-catalog" value={song} maxLength={120} onChange={event => setSong(event.target.value)} required />
              <datalist id="worship-song-catalog">{desk.catalog?.map((item, index) => <option key={item.title + "-" + index} value={item.title} />)}</datalist>
              <Button variant="secondary" type="submit" disabled={busy}>Adicionar música</Button>
            </form>
            <ol className={s.list}>{songs.map((item, index) => <li key={draftRows[index]}>
              <div className={s.fields}>
                <Input label="Música" value={item.title} maxLength={120} onChange={event => update(index, "title", event.target.value)} />
                <Input label="Tom" value={item.key ?? ""} maxLength={24} onChange={event => update(index, "key", event.target.value)} />
                <Input label="Observação" value={item.note ?? ""} maxLength={400} onChange={event => update(index, "note", event.target.value)} />
                {resources.map(([key, label]) => <Input key={key} label={label} type="url" value={item[key] ?? ""}
                  maxLength={600} onChange={event => update(index, key, event.target.value)} />)}
              </div>
              <div className={s.actions}>
                <Button variant="ghost" disabled={!index || busy} onClick={() => move(index, -1)}>Subir</Button>
                <Button variant="ghost" disabled={index === songs.length - 1 || busy} onClick={() => move(index, 1)}>Descer</Button>
                <Button variant="ghost" disabled={busy} onClick={() => {
                  setSongs(items => items.filter((_, position) => position !== index));
                  setDraftRows(items => items.filter((_, position) => position !== index));
                }}>Remover música</Button>
              </div>
            </li>)}</ol>
            <div className={s.actions}>
              <Button variant="secondary" disabled={busy} onClick={() => void save("draft")}>Salvar rascunho</Button>
              <Button disabled={busy || !songs.length} onClick={() => void save("send")}>Enviar agora</Button>
            </div>
            <div className={s.actions}>
              <Input label="Data e horário de Brasília" type="datetime-local" value={sendAt} onChange={event => setSendAt(event.target.value)} />
              <Button variant="secondary" disabled={busy || !sendAt || !songs.length} onClick={() => void save("schedule")}>Agendar envio</Button>
            </div>
          </> : songs.length ? <ol className={s.list} aria-label="Músicas do culto">{songs.map((item, index) => <li key={index}>
            <strong>{item.title}</strong>{item.key && <p>Tom · {item.key}</p>}{item.note && <p>{item.note}</p>}
            <div className={s.actions}>{resources.map(([key, label]) => {
              const link = https(item[key]);
              return link ? <a key={key} href={link} target="_blank" rel="noopener noreferrer">{label}</a> : null;
            })}</div>
          </li>)}</ol> : <p>Nenhum repertório enviado para este culto.</p>}
        </>}
      </div>
    </Modal>
  </>;
}
