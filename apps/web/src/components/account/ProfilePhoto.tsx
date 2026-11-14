"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  accountProblem, profilePhotoProblem, readMyPhoto, saveMyPhoto, MY_PROFILE_PHOTO_PATH, PROFILE_PHOTO_TYPES, type MyAccount,
} from "../../lib/my-account";
import { UIIcon } from "../AppShell";
import { PersonPortrait } from "../PersonPortrait";
import { Alert, Button } from "../ui";
import s from "./my-account.module.css";

export function ProfilePhoto({ account, token }: { account: MyAccount; token: string }) {
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState(account.photoPath);
  const [photoReadFailed, setPhotoReadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  useEffect(() => {
    if (!photoPath) return;
    let live = true;
    let objectUrl: string | undefined;
    void readMyPhoto(token, photoPath).then(image => {
      if (!live) return;
      objectUrl = URL.createObjectURL(image);
      setPhoto(objectUrl);
      setPhotoReadFailed(false);
    }).catch(() => {
      if (live) {
        setPhoto(null);
        setPhotoReadFailed(true);
      }
    });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, photoPath, revision]);

  useEffect(() => {
    if (!selected) {
      setPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selected);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selected]);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const error = profilePhotoProblem(file);
    if (error) {
      setFeedback({ tone: "danger", message: error });
      setSelected(null);
      return;
    }
    setFeedback(null);
    setSelected(file);
  }

  async function save() {
    if (!selected || busy || !account.canEditProfilePhoto) return;
    setBusy(true);
    setFeedback(null);
    try {
      await saveMyPhoto(token, selected);
      setPhotoPath(MY_PROFILE_PHOTO_PATH);
      setRevision(value => value + 1);
      setSelected(null);
      setFeedback({ tone: "success", message: "Foto de perfil atualizada." });
    } catch (error) {
      setFeedback({ tone: "danger", message: accountProblem(error, "photo") });
    } finally {
      setBusy(false);
    }
  }

  const imageUrl = preview ?? photo;
  return (
    <section className={`${s.panel} ${s.photoPanel}`} aria-labelledby="account-photo-title">
      <div className={s.sectionHeading}>
        <h2 id="account-photo-title">Foto de perfil</h2>
        <p>Sua foto também aparece na Ficha 360 e na carteirinha.</p>
      </div>
      <div className={s.photoStage}>
        {imageUrl ? (
          // This URL is created locally from validated image data and released when the image changes.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={s.photo} src={imageUrl} alt={preview ? "Prévia da nova foto" : "Sua foto de perfil"} onError={() => {
            if (preview) {
              setSelected(null);
              setFeedback({ tone: "danger", message: "A imagem não abriu. Escolha outra foto." });
            } else {
              setPhoto(null);
              setPhotoReadFailed(true);
            }
          }} />
        ) : <PersonPortrait name={account.name ?? "Sua conta"} size="large" />}
        {preview && <span className={s.previewLabel}>Prévia</span>}
      </div>
      {photoReadFailed && <p className={s.muted} role="status">A foto salva não pôde ser exibida.</p>}
      {account.canEditProfilePhoto ? (
        <>
          <input hidden ref={camera} type="file" accept={PROFILE_PHOTO_TYPES} capture="user" onChange={choose} />
          <input hidden ref={picker} type="file" accept={PROFILE_PHOTO_TYPES} onChange={choose} />
          <div className={s.photoChoices}>
            <Button variant="secondary" onClick={() => camera.current?.click()} disabled={busy}>
              <UIIcon name="camera" size={17} /> Tirar foto
            </Button>
            <Button variant="secondary" onClick={() => picker.current?.click()} disabled={busy}>Escolher arquivo</Button>
          </div>
          {selected ? <div className={s.actions}>
            <Button onClick={() => void save()} disabled={busy}>{busy ? "Salvando…" : "Salvar foto"}</Button>
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={busy}>Cancelar</Button>
          </div> : <p className={s.muted}>JPG, PNG ou WebP de até 5 MB.</p>}
        </>
      ) : <p className={s.muted}>Para vincular uma foto ao cadastro, fale com a Secretaria.</p>}
      {feedback && <Alert appearance="workspace" tone={feedback.tone} title={feedback.message} />}
    </section>
  );
}
