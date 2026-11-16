"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { PROFILE_PHOTO_TYPES, profilePhotoProblem } from "../../lib/my-account";
import { Button } from "../ui";
import { UIIcon } from "../ui/UIIcon";
import s from "../account/my-account.module.css";

export function PersonPhotoInput({ photo, onChange, disabled = false }: {
  photo: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function select(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = profilePhotoProblem(file);
    setError(problem ?? "");
    if (!problem) onChange(file);
  }

  return <div aria-labelledby={id}>
    <p id={id}><strong>Foto do cadastro</strong></p>
    <input hidden ref={camera} type="file" accept={PROFILE_PHOTO_TYPES} capture="environment" onChange={select} />
    <input hidden ref={picker} type="file" accept={PROFILE_PHOTO_TYPES} onChange={select} />
    {preview && <div className={s.photoStage}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={s.photo} alt="Prévia da foto do cadastro" src={preview}
        onError={() => { onChange(null); setError("A imagem não abriu. Escolha outra foto."); }} />
    </div>}
    <div className={s.photoChoices}>
      <Button type="button" variant="secondary" onClick={() => camera.current?.click()} disabled={disabled}>
        <UIIcon name="camera" size={17} /> Tirar foto
      </Button>
      <Button type="button" variant="secondary" onClick={() => picker.current?.click()} disabled={disabled}>Escolher arquivo</Button>
      {photo && <Button type="button" variant="ghost" onClick={() => { onChange(null); setError(""); }}
        disabled={disabled}>Descartar prévia</Button>}
    </div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
