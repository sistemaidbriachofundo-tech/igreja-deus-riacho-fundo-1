"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiRequestError, apiGet, apiPut } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { Alert, Button, Loading, Modal, Select } from "../ui";
import s from "./repertoire-desk.module.css";

const functions = [
  ["LEADER", "Líder de Louvor"], ["MINISTER", "Ministro de Louvor"], ["BACK_VOCAL", "Back vocal"],
  ["DRUMS", "Bateria"], ["ACOUSTIC_GUITAR", "Violão"], ["KEYBOARD", "Teclado"], ["BASS", "Baixo"],
] as const;
const voices = [
  { value: "UNSPECIFIED", label: "Sem classificação" }, { value: "CONTRALTO", label: "Contralto" },
  { value: "MEZZO_SOPRANO", label: "Mezzo-soprano" }, { value: "SOPRANO", label: "Soprano" },
  { value: "TENOR", label: "Tenor" }, { value: "BASS", label: "Baixo" },
];
type Profile = { classification: string; functions: string[] };
const empty: Profile = { classification: "UNSPECIFIED", functions: [] };

export function VocalProfile({ token, personId, name }: { token: string; personId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const path = "/worship/vocal-profiles/" + encodeURIComponent(personId);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void apiGet<Profile | null>(path, token, { fresh: true }).then(
      result => { if (live) setProfile(result ?? empty); },
      problem => {
        if (!live) return;
        if (problem instanceof ApiRequestError && problem.status === 404) setProfile(empty);
        else setError(dasError(problem));
      },
    );
    return () => { live = false; };
  }, [open, path, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile?.functions.length || busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      setProfile(await apiPut<Profile>(path, token, { classification: profile.classification, functions: profile.functions }));
      setSaved(true);
    } catch (problem) { setError(dasError(problem)); }
    finally { setBusy(false); }
  }

  return <>
    <Button variant="secondary" onClick={() => { setError(""); setProfile(undefined); setSaved(false); setOpen(true); }}>Funções e voz</Button>
    <Modal open={open} onClose={() => !busy && setOpen(false)} title={"Louvor · " + name} appearance="workspace">
      <div className={s.desk}>
        {error && <Alert appearance="workspace" tone="danger" title={error} />}
        {saved && <Alert appearance="workspace" tone="success" title="Perfil de Louvor salvo." />}
        {!profile && !error && <Loading label="Carregando funções e voz" />}
        {profile && <form className={s.desk} onSubmit={submit}>
          <fieldset><legend>Funções que a pessoa pode exercer</legend>
            {functions.map(([id, label]) => <label key={id}><input type="checkbox" checked={profile.functions.includes(id)}
              onChange={event => setProfile({ ...profile, functions: event.target.checked
                ? [...profile.functions, id] : profile.functions.filter(item => item !== id) })} /> {label}</label>)}
          </fieldset>
          <Select label="Classificação vocal" options={voices} value={profile.classification}
            onChange={event => setProfile({ ...profile, classification: event.target.value })} />
          <Button type="submit" disabled={busy || !profile.functions.length}>Salvar perfil</Button>
        </form>}
      </div>
    </Modal>
  </>;
}
