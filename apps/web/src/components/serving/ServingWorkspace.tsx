"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, apiGet, apiPost, loadStoredToken, type LoginResult } from "../../lib/api";
import { churchLocalToISO, dasError } from "../../lib/das-operations";
import { withBasePath } from "../../lib/paths";
import { probeChurchRosterList } from "../../lib/serving-client";
import {
  findSameDayBlocks,
  parseMinistryList,
  parseMyAgenda,
  parseRosterList,
  pickSurfaceMinistry,
  rostersForMinistry,
  type PersonalAssignment,
  SERVING_SURFACES,
  type MinistryView,
  type RosterView,
  type ServingSurfaceId,
} from "../../lib/serving-rosters";
import { MemberSpace } from "./MemberSpace";
import { MinistryRosterDesk } from "./MinistryRosterDesk";
import { ServingFrame } from "./ServingFrame";
import styles from "./serving.module.css";

type Surface = ServingSurfaceId | "membro";
type Phase = "disabled" | "anonymous" | "loading" | "ready" | "error";
type Probe = "forbidden" | "allowed" | "unavailable" | null;

const COPY: Record<Surface, { title: string; lead: string }> = {
  atmosfera: {
    title: "Atmosfera",
    lead: "Escala por função e horário do ministério cujo slug a API já devolveu. Conflito no mesmo horário segue a regra do roster.",
  },
  louvor: {
    title: "Louvor",
    lead: "Escala por função e horário do louvor já cadastrado. Confirmação e substituição usam os endpoints existentes.",
  },
  membro: {
    title: "Meu Espaço",
    lead: "Sua agenda, filtrada pela pessoa do token. Confirmar e recusar gravam o estado e não enviam mensagem.",
  },
};

export function ServingWorkspace({ surface }: { surface: Surface }) {
  const enabled = process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const [phase, setPhase] = useState<Phase>(enabled ? "loading" : "disabled");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<LoginResult["user"] | null>(null);
  const [ministries, setMinistries] = useState<MinistryView[]>([]);
  const [rosters, setRosters] = useState<RosterView[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<Probe>(null);
  const [agenda, setAgenda] = useState<PersonalAssignment[]>([]);
  const [scopeDenied, setScopeDenied] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setPhase("disabled");
      return;
    }
    const stored = loadStoredToken();
    if (!stored) {
      setPhase("anonymous");
      return;
    }
    let cancelled = false;
    setPhase("loading");
    void (async () => {
      try {
        const me = await apiGet<LoginResult["user"]>("/auth/me", stored);
        if (cancelled) return;
        setScopeDenied(false);
        if (surface === "membro") {
          const body = await apiGet<unknown>("/rosters/me", stored);
          if (cancelled) return;
          const parsed = parseMyAgenda(body);
          if (parsed.personId !== me.personId) {
            throw new Error("Formato inesperado: a agenda não é da pessoa autenticada.");
          }
          setAgenda(parsed.assignments);
          setRosters([]);
          setToken(stored);
          setUser(me);
          setPhase("ready");
          return;
        }
        const ministryBody = await apiGet<unknown>("/ministries", stored);
        if (cancelled) return;
        const parsedMinistries = parseMinistryList(ministryBody);
        const selected = pickSurfaceMinistry(parsedMinistries, surface);
        setMinistries(parsedMinistries);
        if (!selected) {
          setRosters([]);
          setToken(stored);
          setUser(me);
          setPhase("ready");
          return;
        }
        try {
          const rosterBody = await apiGet<unknown>(
            `/rosters/by-ministry/${encodeURIComponent(selected.id)}`,
            stored,
          );
          if (cancelled) return;
          const parsedRosters = parseRosterList(rosterBody);
          if (parsedRosters.some((roster) => roster.ministryId !== selected.id)) {
            throw new Error("Formato inesperado: a resposta trouxe escala de outro ministério.");
          }
          setRosters(parsedRosters);
        } catch (error) {
          if (error instanceof ApiRequestError && error.status === 403) {
            if (cancelled) return;
            setRosters([]);
            setScopeDenied(true);
            setToken(stored);
            setUser(me);
            setPhase("ready");
            return;
          }
          throw error;
        }
        setToken(stored);
        setUser(me);
        setPhase("ready");
      } catch (error) {
        if (!cancelled) {
          setNotice(servingError(error));
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, surface, reload]);

  const roles = useMemo(
    () => user?.grants.map((grant) => grant.roleCode) ?? [],
    [user],
  );
  const ministry =
    surface === "membro" ? null : pickSurfaceMinistry(ministries, surface);
  const visibleRosters = ministry ? rostersForMinistry(rosters, ministry.id) : [];
  const blocks = useMemo(
    () => findSameDayBlocks(rosters),
    [rosters],
  );

  async function run(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
      setNotice(success);
      setReload((value) => value + 1);
    } catch (error) {
      setNotice(servingError(error));
    } finally {
      setBusy(false);
    }
  }

  const copy = COPY[surface];

  return (
    <ServingFrame active={surface} title={copy.title} lead={copy.lead}>
      {phase === "disabled" && (
        <section className={styles.card} role="status">
          <h2>Homologação desabilitada</h2>
          <p>As escalas autenticadas só abrem com a API de testes configurada.</p>
        </section>
      )}
      {phase === "anonymous" && (
        <section className={styles.card}>
          <h2>Entrar para continuar</h2>
          <p>Sem sessão, esta tela não consulta escalas.</p>
          <a href={withBasePath("/login/")}>Ir para o login de homologação</a>
        </section>
      )}
      {phase === "loading" && (
        <section className={styles.card} role="status">
          Verificando a sessão e os contratos de escala…
        </section>
      )}
      {phase === "error" && (
        <p className={styles.conflict} role="alert">
          {notice}
        </p>
      )}
      {phase === "ready" && user && surface === "membro" && (
        <MemberSpace
          email={user.email}
          personId={user.personId}
          assignments={agenda}
          busy={busy}
          notice={notice}
          probe={probe}
          onConfirm={(assignmentId) =>
            void run(
              () => apiPost(`/rosters/assignments/${encodeURIComponent(assignmentId)}/confirm`, token),
              "Confirmação gravada. O estado exibido veio da API e nenhuma mensagem foi enviada.",
            )
          }
          onDecline={(assignmentId) =>
            void run(
              () => apiPost(`/rosters/assignments/${encodeURIComponent(assignmentId)}/decline`, token),
              "Recusa gravada. O estado exibido veio da API e nenhuma mensagem foi enviada.",
            )
          }
          onProbe={() => {
            if (busy) return;
            setBusy(true);
            setNotice("");
            void probeChurchRosterList(token)
              .then((result) => setProbe(result))
              .catch(() => setProbe("unavailable"))
              .finally(() => setBusy(false));
          }}
        />
      )}
      {phase === "ready" && user && surface !== "membro" && scopeDenied && (
        <section className={styles.blocked} role="alert" data-scope="forbidden">
          <h2>Sem permissão neste ministério</h2>
          <p>A API recusou a escala deste grupo. Nenhuma escala de outro ministério foi carregada.</p>
        </section>
      )}
      {phase === "ready" && user && surface !== "membro" && !scopeDenied && (
        <MinistryRosterDesk
          surface={surface}
          ministry={ministry}
          rosters={visibleRosters}
          blocks={blocks}
          roles={roles}
          actorPersonId={user.personId}
          token={token}
          busy={busy}
          notice={notice}
          onCreate={({ title, serviceAtLocal }) => {
            if (!ministry) return;
            const serviceAt = churchLocalToISO(serviceAtLocal);
            if (!serviceAt) {
              setNotice("Informe data e horário válidos no fuso da congregação.");
              return;
            }
            void run(
              () =>
                apiPost("/rosters", token, {
                  title,
                  serviceAt,
                  ministryId: ministry.id,
                }),
              "Escala registrada na API com o ministryId desta frente.",
            );
          }}
          onAddSlot={(rosterId, roleLabel, requiresCouple) =>
            void run(
              () =>
                apiPost(`/rosters/${encodeURIComponent(rosterId)}/slots`, token, {
                  roleLabel,
                  requiresCouple,
                }),
              "Função registrada na API.",
            )
          }
          onAssign={(slotId, personId, partnerPersonId) =>
            void run(
              () =>
                apiPost(`/rosters/slots/${encodeURIComponent(slotId)}/assign`, token, {
                  personId,
                  ...(partnerPersonId ? { partnerPersonId } : {}),
                }),
              "Designação gravada como pendente. Nenhuma mensagem foi enviada.",
            )
          }
          onConfirm={(assignmentId) =>
            void run(
              () => apiPost(`/rosters/assignments/${encodeURIComponent(assignmentId)}/confirm`, token),
              "Confirmação gravada. Nenhuma mensagem foi enviada.",
            )
          }
          onDecline={(assignmentId) =>
            void run(
              () => apiPost(`/rosters/assignments/${encodeURIComponent(assignmentId)}/decline`, token),
              "Recusa gravada. Nenhuma mensagem foi enviada.",
            )
          }
          onSubstitute={(assignmentId, personId) =>
            void run(
              () =>
                apiPost(`/rosters/assignments/${encodeURIComponent(assignmentId)}/substitute`, token, {
                  personId,
                }),
              "Substituição gravada como pendente. A pessoa confirma em Meu Espaço. Nenhuma mensagem foi enviada.",
            )
          }
          onPublish={(rosterId) =>
            void run(
              () => apiPost(`/rosters/${encodeURIComponent(rosterId)}/publish`, token),
              "Escala publicada na API. Um alerta, se houver, fica no outbox mock e não é mensagem real.",
            )
          }
          onClose={(rosterId) =>
            void run(
              () => apiPost(`/rosters/${encodeURIComponent(rosterId)}/close`, token),
              "Escala fechada na API.",
            )
          }
        />
      )}
      <p className={styles.footnote}>
        {surface === "membro"
          ? "Nenhum dado de escala alheia é pedido ao abrir esta página."
          : `Superfície ${SERVING_SURFACES[surface].title}. Escalas sem o ministryId correspondente ficam de fora.`}
      </p>
    </ServingFrame>
  );
}

function servingError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("Formato inesperado")) {
    return error.message;
  }
  if (error instanceof ApiRequestError) {
    const parsed = readApiBody(error.message);
    if (parsed.code === "ROSTER_SAME_DAY") {
      return "Esta pessoa já tem outra posição ativa neste dia. Nada foi gravado.";
    }
    if (parsed.code === "MINISTRY_SCOPE_FORBIDDEN" || error.status === 403) {
      return "Seu perfil não tem autorização para esta escala.";
    }
    if (parsed.message) return parsed.message;
  }
  return dasError(error);
}

function readApiBody(raw: string): { code?: string; message?: string } {
  try {
    const body = JSON.parse(raw) as { code?: unknown; message?: unknown };
    return {
      code: typeof body.code === "string" ? body.code : undefined,
      message: typeof body.message === "string" ? body.message : undefined,
    };
  } catch {
    return {};
  }
}
