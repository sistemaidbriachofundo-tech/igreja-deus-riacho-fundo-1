"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppShell } from "./AppShell";
import { CredentialDesk } from "./credentials/CredentialDesk";
import { PageHeader } from "./ui/PageHeader";
import {
  credentialFailure,
  type CredentialCard,
  type CredentialMembershipRow,
} from "./credentials/credential-model";
import {
  apiGet,
  apiLogin,
  clearToken,
  loadStoredToken,
  loginFailureMessage,
  storeToken,
  type AuthUser,
} from "../lib/api";
import s from "./church-credentials.module.css";

type MembershipPayload = {
  memberships: Array<{
    id: string;
    status: string;
    person: { id: string; displayName: string };
    activeCredentialId: string | null;
  }>;
};

function canManage(user: AuthUser): boolean {
  return user.grants.some((grant) => grant.roleCode === "SECRETARIA" || grant.roleCode === "PLATFORM_ADMIN");
}

function toRows(payload: MembershipPayload): CredentialMembershipRow[] {
  return payload.memberships
    .filter((membership) => membership.status === "ACTIVE")
    .map((membership) => ({
      membershipId: membership.id,
      personId: membership.person.id,
      displayName: membership.person.displayName,
      membershipStatus: membership.status,
      activeCredentialId: membership.activeCredentialId,
    }));
}

export function ChurchCredentials() {
  const [phase, setPhase] = useState<"checking" | "anonymous" | "ready">("checking");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<CredentialMembershipRow[]>([]);
  const [ownCard, setOwnCard] = useState<CredentialCard | null>(null);
  const [banner, setBanner] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CredentialCard | null>(null);

  const loadDesk = useCallback(async (activeToken: string, me: AuthUser) => {
    const manager = canManage(me);
    const [ownResult, listResult] = await Promise.allSettled([
      apiGet<{ card: CredentialCard | null }>("/credentials/me", activeToken),
      manager
        ? apiGet<MembershipPayload>("/memberships", activeToken)
        : Promise.resolve(null),
    ]);
    if (ownResult.status === "fulfilled") setOwnCard(ownResult.value.card);
    else {
      setOwnCard(null);
      if (!manager) setBanner(credentialFailure(ownResult.reason).message);
    }
    if (listResult.status === "fulfilled" && listResult.value) {
      setMemberships(toRows(listResult.value));
    } else if (manager) {
      setMemberships([]);
      if (listResult.status === "rejected") setBanner(credentialFailure(listResult.reason).message);
    }
    if (ownResult.status === "fulfilled" && (listResult.status !== "rejected" || !manager)) {
      setBanner("");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("cartao") === "aberto") {
          const mod = await import("./credentials/credential-preview");
          if (cancelled) return;
          setPreview(params.get("estado") === "revogada" ? mod.revokedPreviewCard : mod.activePreviewCard);
          setPhase("ready");
          return;
        }
      }
      const stored = loadStoredToken();
      if (!stored) {
        if (!cancelled) setPhase("anonymous");
        return;
      }
      try {
        const me = await apiGet<AuthUser>("/auth/me", stored);
        if (cancelled) return;
        setToken(stored);
        setUser(me);
        await loadDesk(stored, me);
        if (!cancelled) setPhase("ready");
      } catch {
        clearToken();
        if (!cancelled) {
          setToken(null);
          setUser(null);
          setPhase("anonymous");
        }
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [loadDesk]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setBanner("");
    try {
      const signed = await apiLogin(email.trim(), password);
      storeToken(signed.accessToken);
      setToken(signed.accessToken);
      setUser(signed.user);
      setPassword("");
      await loadDesk(signed.accessToken, signed.user);
      setPhase("ready");
    } catch (error) {
      setBanner(loginFailureMessage(error));
      setPhase("anonymous");
    } finally {
      setBusy(false);
    }
  }

  const manager = user ? canManage(user) : Boolean(preview);
  const peopleCount = preview ? 1 : manager ? memberships.length : ownCard ? 1 : 0;
  const activeCount = preview
    ? (preview.status === "ACTIVE" ? 1 : 0)
    : manager
      ? memberships.filter((row) => row.activeCredentialId).length
      : ownCard?.status === "ACTIVE" ? 1 : 0;

  return (
    <AppShell active="carteirinha" meta="Carteirinhas">
      <div className={s.page}>
        <PageHeader appearance="workspace" heading="h1" title="Carteirinhas" />

        {phase === "checking" ? <p className={s.panel} role="status">Verificando sessão</p> : null}

        {phase === "anonymous" ? (
          <section className={s.panel} aria-labelledby="credential-login">
            <h2 id="credential-login">Entrar</h2>
            <p>A carteirinha é a da matrícula já gravada na congregação.</p>
            <form className={s.form} onSubmit={(event) => void submit(event)}>
              <label>E-mail
                <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label>Senha
                <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <button type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
            </form>
          </section>
        ) : null}

        {banner ? <p className={s.alert} role="alert">{banner}</p> : null}

        {phase === "ready" ? (
          <>
            <section className={s.stats} aria-label="Situação das carteirinhas">
              <div><strong>{activeCount}</strong><span>Ativas</span></div>
              <div><strong>{peopleCount}</strong><span>Pessoas</span></div>
              <div><strong>{Math.max(peopleCount - activeCount, 0)}</strong><span>Sem credencial ativa</span></div>
            </section>
            <CredentialDesk
              token={token}
              canManage={manager}
              memberships={preview ? [{
                membershipId: preview.membershipId,
                personId: preview.personId,
                displayName: preview.displayName,
                membershipStatus: "ACTIVE",
                activeCredentialId: preview.status === "ACTIVE" ? preview.id : null,
              }] : memberships}
              ownCard={preview ?? ownCard}
              previewCard={preview}
              initialOpen={Boolean(preview)}
              onReload={() => {
                if (token && user) return loadDesk(token, user);
              }}
            />
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
