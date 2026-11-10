import { withBasePath } from "../../lib/paths";
import {
  avatarLabel,
  credentialStatusLabel,
  formatCredentialDate,
  registrationLabel,
  safeQrSvg,
  type CredentialCard,
  type QrCheck,
} from "./credential-model";
import s from "./credentials.module.css";

function Portrait({ name }: { name: string }) {
  return (
    <span className={s.portrait} role="img" aria-label={`Retrato ilustrado de ${name}`}>
      {avatarLabel(name)}
    </span>
  );
}

export function CredentialFaces({
  card,
  verification,
}: {
  card: CredentialCard;
  verification: QrCheck | null;
}) {
  const revoked = card.status === "REVOKED" || verification?.state === "revoked";
  const qr = safeQrSvg(card.qrSvg);
  const ministry = card.ministryName?.trim();
  return (
    <div className={s.faces}>
      <article className={s.face} aria-label="Frente da carteirinha">
        <div className={s.faceGlow} aria-hidden="true" />
        <header className={s.faceTop}>
          <span
            className={s.logo}
            role="img"
            aria-label="Logomarca da Igreja de Deus"
            style={{ backgroundImage: `url("${withBasePath("/images/logo-igreja-aprovada.webp")}")` }}
          />
          <span className={s.brand}>
            <strong>Igreja de Deus</strong>
            <small>Riacho Fundo I</small>
          </span>
          <span className={s.edition}>Homologação</span>
        </header>
        <div className={s.identity}>
          <Portrait name={card.displayName} />
          <div>
            <p className={s.overline}>Membro</p>
            <h3>{card.displayName}</h3>
            {ministry ? <p className={s.ministry}>{ministry}</p> : null}
          </div>
        </div>
        <footer className={s.faceMeta}>
          <div>
            <span>Matrícula</span>
            <strong>
              <span className={s.reg} aria-hidden="true">{registrationLabel(card.membershipId)}</span>
              <span className={s.srOnly}>{card.membershipId}</span>
            </strong>
          </div>
          <div>
            <span>Situação</span>
            <strong data-credential-status={card.status}>{credentialStatusLabel(card.status)}</strong>
          </div>
        </footer>
      </article>

      <article className={`${s.face} ${s.back}`} aria-label="Verso da carteirinha">
        <header className={s.backTop}>
          <p className={s.overline}>Verificação</p>
          <strong>{card.churchName}</strong>
        </header>
        <div className={s.qrBlock}>
          {qr ? (
            <div
              className={s.qr}
              role="img"
              aria-label="QR de verificação da credencial"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          ) : (
            <p className={s.qrMissing}>QR indisponível nesta resposta.</p>
          )}
          {revoked ? <span className={s.stamp}>Revogada</span> : null}
        </div>
        <p className={s.qrHint}>
          {revoked
            ? "QR revogado. Esta credencial não é válida."
            : "A leitura deste QR consulta a situação da credencial."}
        </p>
        <footer className={s.faceMeta}>
          <div>
            <span>Emitida</span>
            <strong>{formatCredentialDate(card.issuedAt)}</strong>
          </div>
          <div>
            <span>Revogação</span>
            <strong>{formatCredentialDate(card.revokedAt)}</strong>
          </div>
        </footer>
        {verification ? <p className={s.verifyLine} role="status">{verification.label}</p> : null}
      </article>
    </div>
  );
}
