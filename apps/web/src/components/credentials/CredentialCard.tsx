"use client";

import { useEffect, useState } from "react";
import { credentialScanUrl } from "../../lib/credential-scan";
import { withBasePath } from "../../lib/paths";
import { PersonPortrait } from "../PersonPortrait";
import {
  credentialStatusLabel,
  formatCredentialDate,
  registrationLabel,
  type CredentialCard,
  type QrCheck,
} from "./credential-model";
import s from "./credentials.module.css";

export function CredentialFaces({
  card,
  verification,
}: {
  card: CredentialCard;
  verification: QrCheck | null;
}) {
  const revoked = card.status === "REVOKED" || verification?.state === "revoked";
  const [scanQr, setScanQr] = useState<{ token: string; image: string } | null>(null);

  useEffect(() => {
    const scanUrl = credentialScanUrl(window.location.origin, card.qrPayload);
    if (!scanUrl) {
      setScanQr({ token: card.qrPayload, image: "" });
      return;
    }
    let live = true;
    void import("qrcode").then(qr => qr.toDataURL(scanUrl, {
      errorCorrectionLevel: "M", margin: 4, width: 352,
    })).then(image => {
      if (live) setScanQr({ token: card.qrPayload, image });
    }).catch(() => {
      if (live) setScanQr({ token: card.qrPayload, image: "" });
    });
    return () => { live = false; };
  }, [card.qrPayload]);

  const qr = scanQr?.token === card.qrPayload ? scanQr.image : null;
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
          <PersonPortrait name={card.displayName} photoUrl={card.photoUrl} size="card" />
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
            // eslint-disable-next-line @next/next/no-img-element
            <img className={s.qr} src={qr} width={176} height={176} alt="QR de verificação da credencial" />
          ) : <p className={s.qrMissing}>{qr === "" ? "QR indisponível." : "Preparando QR…"}</p>}
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
