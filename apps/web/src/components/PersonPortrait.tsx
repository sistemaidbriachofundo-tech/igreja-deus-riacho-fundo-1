import styles from "./person-portrait.module.css";

type Props = {
  name: string;
  photoUrl?: string | null;
  size?: "small" | "medium" | "large" | "card";
  className?: string;
};

export function personInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return [words[0]?.charAt(0), words.length > 1 ? words.at(-1)?.charAt(0) : ""]
    .filter(Boolean).join("").toLocaleUpperCase("pt-BR") || "ID";
}

/**
 * A foto só é renderizada quando uma URL de imagem é fornecida por um serviço autorizado.
 * Nunca deduzir foto de uma pessoa a partir do nome nem usar imagens genéricas como identidade.
 * Sem retrato cadastrado, mostra as iniciais.
 */
export function PersonPortrait({ name, photoUrl, size = "medium", className }: Props) {
  const safePhoto = photoUrl && photoUrl.length <= 262_200 &&
    (/^https:\/\//i.test(photoUrl) || /^\/[^/]/.test(photoUrl) || /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photoUrl))
    ? photoUrl : null;
  const frameClass = [styles.portrait, className].filter(Boolean).join(" ");
  return (
    <span className={frameClass} data-photo-size={size}
      role="img" aria-label={safePhoto ? `Foto cadastrada de ${name}` : `Foto de ${name} ainda não cadastrada`}>
      {safePhoto ? <img src={safePhoto} alt="" loading="lazy" referrerPolicy="no-referrer" /> :
        <span className={styles.initials} aria-hidden="true">{personInitials(name)}</span>}
    </span>
  );
}
