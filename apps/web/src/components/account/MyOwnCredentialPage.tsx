"use client";

import { useEffect, useState } from "react";
import { loadStoredToken } from "../../lib/api";
import { AppNavLink, usePersonaAccess } from "../AppShell";
import { MyCredentialSection } from "./MyCredentialSection";
import s from "./my-own-credential.module.css";

export function MyOwnCredentialPage() {
  const access = usePersonaAccess();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (access.kind !== "ready") return;
    setToken(loadStoredToken());
  }, [access.kind]);

  return <main className={s.page}>
    <nav aria-label="Você está em" className={s.breadcrumb}>
      <AppNavLink href="/app/minha-conta/">Minha conta</AppNavLink><span aria-hidden="true">/</span><span>Minha carteirinha</span>
    </nav>
    <header className={s.heading}>
      <div><p className={s.kicker}>SUA IDENTIFICAÇÃO</p>
        <h1>Minha carteirinha</h1>
        <p>Veja seu documento de membro, confira o QR Code e baixe o PDF para apresentar quando precisar.</p>
      </div>
      <AppNavLink className={s.accountLink} href="/app/minha-conta/">Meu perfil</AppNavLink>
    </header>
    {access.kind === "ready" && token ? <MyCredentialSection token={token}/> :
      <div className={s.loading} role="status">Verificando sua sessão…</div>}
    <aside className={s.privacy}><strong>Carteirinha pessoal e protegida</strong>
      <p>Seu vínculo de membresia é independente do papel no sistema. O QR Code identifica apenas a credencial e pode ser validado sem expor CPF, telefone ou endereço.</p>
    </aside>
  </main>;
}
