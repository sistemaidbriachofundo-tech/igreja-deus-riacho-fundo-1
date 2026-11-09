"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, loadStoredToken, type LoginResult } from "../../lib/api";
import { churchLocalToISO, dasError } from "../../lib/das-operations";
import { withBasePath } from "../../lib/paths";
import { probeChurchRosterList } from "../../lib/serving-client";
import {
  endpointsForSurface,
  findSimultaneousBlocks,
  parseMinistryList,
  parseRosterList,
  pickSurfaceMinistry,
  rostersForMinistry,
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
    lead: "Sua sessão, o atalho da carteirinha e a confirmação da sua atribuição. Listas de outras pessoas não aparecem aqui.",
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
        if (!endpointsForSurface(surface).includes("/rosters")) {
          setToken(stored);
          setUser(me);
          setPhase("ready");
          return;
        }
        const [ministryBody, rosterBody] = await Promise.all([
          apiGet<unknown>("/ministries", stored),
          apiGet<unknown>("/rosters", stored),
        ]);
        if (cancelled) return;
        setMinistries(parseMinistryList(ministryBody));
        setRosters(parseRosterList(rosterBody));
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
    () => findSimultaneousBlocks(rosters),
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
          busy={busy}
          notice={notice}
          probe={probe}
          onConfirm={(assignmentId) =>
            void run(
              () => apiPost(`/assignments/${encodeURIComponent(assignmentId)}/confirm`, token),
              "Confirmação registrada na API.",
            )
          }
          onDecline={(assignmentId) =>
            void run(
              () => apiPost(`/assignments/${encodeURIComponent(assignmentId)}/decline`, token),
              "Recusa registrada na API.",
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
      {phase === "ready" && user && surface !== "membro" && (
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
                apiPost(`/slots/${encodeURIComponent(slotId)}/assignments`, token, {
                  personId,
                  ...(partnerPersonId ? { partnerPersonId } : {}),
                }),
              "Designação registrada na API.",
            )
          }
          onConfirm={(assignmentId) =>
            void run(
              () => apiPost(`/assignments/${encodeURIComponent(assignmentId)}/confirm`, token),
              "Confirmação registrada na API.",
            )
          }
          onDecline={(assignmentId) =>
            void run(
              () => apiPost(`/assignments/${encodeURIComponent(assignmentId)}/decline`, token),
              "Recusa registrada na API.",
            )
          }
          onSubstitute={(assignmentId, personId) =>
            void run(
              () =>
                apiPost(`/assignments/${encodeURIComponent(assignmentId)}/substitute`, token, {
                  personId,
                }),
              "Substituição registrada na API. A atribuição anterior deixa de ocupar o horário.",
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
  return dasError(error);
}
