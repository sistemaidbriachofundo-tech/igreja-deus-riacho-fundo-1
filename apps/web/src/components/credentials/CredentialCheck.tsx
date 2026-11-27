"use client";

import { useEffect, useState } from "react";
import { ApiRequestError } from "../../lib/api";
import { credentialTokenFromHash } from "../../lib/credential-scan";
import { officialLogoAsset } from "../../lib/brand";
import { withBasePath } from "../../lib/paths";
import { Alert, Button, Loading, PageHeader } from "../ui";
import { verifyCredentialQr } from "./credential-api";
import type { QrCheck } from "./credential-model";
import s from "./credential-check.module.css";

type Result = QrCheck["state"] | "loading" | "error";

const results = {
  valid: { tone: "success", title: "Carteirinha válida", description: "A credencial está ativa na igreja." },
  revoked: { tone: "warning", title: "Carteirinha revogada", description: "Esta credencial perdeu a validade." },
  unknown: { tone: "warning", title: "Carteirinha não localizada", description: "Confira se você abriu o QR completo da carteirinha." },
  error: { tone: "danger", title: "Não foi possível verificar a carteirinha", description: "Confira sua conexão e tente novamente." },
} as const;

export function CredentialCheck() {
  const [state, setState] = useState<Result>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    let latest = 0;
    async function check() {
      const sequence = ++latest;
      const token = credentialTokenFromHash(window.location.hash);
      if (!token) {
        setState("unknown");
        return;
      }
      setState("loading");
      try {
        const result = await verifyCredentialQr(token);
        if (live && sequence === latest) setState(result.state);
      } catch (error) {
        if (live && sequence === latest) {
          setState(error instanceof ApiRequestError && error.status === 404 ? "unknown" : "error");
        }
      }
    }
    void check();
    window.addEventListener("hashchange", check);
    return () => {
      live = false;
      window.removeEventListener("hashchange", check);
    };
  }, [attempt]);

  const result = state === "loading" ? null : results[state];

  return (
    <main className={s.page}>
      <a className={s.brand} href={withBasePath("/")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBasePath(officialLogoAsset)} alt="" width={46} height={52} />
        <span><strong>Igreja de Deus</strong><small>Riacho Fundo I</small></span>
      </a>
      <section className={s.panel}>
        <PageHeader appearance="workspace" heading="h1" title="Validar carteirinha" />
        {result ? <Alert appearance="workspace" tone={result.tone} title={result.title}>
          {result.description}
        </Alert> : <Loading label="Verificando carteirinha" />}
        {state === "error" && <div><Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>
          Tentar novamente
        </Button></div>}
      </section>
    </main>
  );
}
