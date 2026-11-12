"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePersonaAccess } from "./AppShell";
import { MinistryOverview } from "./ministry/MinistryOverview";
import { MinistryExperience } from "./ministry/MinistryExperience";
import { getApiBaseUrl, loadStoredToken } from "../lib/api";
import {
  requestFormalAdmission,
  requestFormalEnd,
  requestInterestConversion,
  type ConversionResult,
  type FormalRole,
  type MembershipChange,
} from "../lib/ministry-desk";
import { loadMinistryBoard, type MinistryBoardData } from "../lib/ministry-presentation";
import { ministryHref, parseMinistryRoute, type MinistryTabId } from "../lib/ministry-view";
import { withBasePath } from "../lib/paths";
import { PageHeader } from "./ui/PageHeader";
import ui from "./ui/ui.module.css";
import styles from "./ministry-membership-catalog.module.css";

type Route = { ministryId?: string; tab: MinistryTabId; escalaId?: string };

function writeRoute(route: Route) {
  const url = route.ministryId
    ? withBasePath(ministryHref(route.ministryId, route.tab, route.escalaId))
    : withBasePath("/app/ministerios/");
  window.history.pushState(null, "", url);
}

export function MinistryDeskPage() {
  const { roles } = usePersonaAccess();
  const [token, setToken] = useState<string | null>(null);
  const route = parseMinistryRoute(useSearchParams().toString());
  const overview = !route.ministryId && route.tab === "visao";
  const [board, setBoard] = useState<MinistryBoardData | null>(null);
  const [conversion, setConversion] = useState<ConversionResult | null>(null);
  const [change, setChange] = useState<MembershipChange | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setToken(loadStoredToken());
  }, []);

  useEffect(() => {
    if (!token || overview) return;
    let cancelled = false;
    setBoard(null);
    void loadMinistryBoard({
      token,
      baseUrl: getApiBaseUrl(),
      ministryId: route.ministryId,
    })
      .then((next) => {
        if (!cancelled) setBoard(next);
      })
      .catch(() => {
        if (!cancelled) {
          setBoard({
            desk: { kind: "error", message: "A consulta dos ministérios autorizados não respondeu." },
            escalas: { kind: "hidden" },
            activities: { kind: "hidden" },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, overview, route.ministryId, reloadKey]);

  function go(next: Route) {
    setConversion(null);
    setChange(null);
    writeRoute(next);
  }

  async function convert(interestId: string) {
    if (!token || !board || board.desk.kind !== "ready" || convertingId) return;
    setConvertingId(interestId);
    setConversion(null);
    try {
      const result = await requestInterestConversion({
        token,
        baseUrl: getApiBaseUrl(),
        ministryId: board.desk.ministry.id,
        volunteerInterestId: interestId,
      });
      setConversion(result);
      if (result.created) setReloadKey((value) => value + 1);
    } catch {
      setConversion({
        created: false,
        status: 0,
        code: "MINISTRY_INTEREST_CONVERSION_BLOCKED",
        message: "A conversão não foi concluída. Nenhum integrante foi criado.",
        member: null,
      });
    } finally {
      setConvertingId(null);
    }
  }

  async function admit(personId: string, role: FormalRole) {
    if (!token || !board || board.desk.kind !== "ready" || pending) return;
    setPending(true);
    setChange(null);
    try {
      const result = await requestFormalAdmission({
        token,
        baseUrl: getApiBaseUrl(),
        ministryId: board.desk.ministry.id,
        personId,
        role,
      });
      setChange(result);
      if (result.applied) setReloadKey((value) => value + 1);
    } catch {
      setChange({
        applied: false,
        status: 0,
        code: "MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED",
        message: "A inclusão não foi concluída. Nenhum integrante foi criado.",
        member: null,
      });
    } finally {
      setPending(false);
    }
  }

  async function end(membershipId: string) {
    if (!token || !board || board.desk.kind !== "ready" || pending) return;
    setPending(true);
    setChange(null);
    try {
      const result = await requestFormalEnd({
        token,
        baseUrl: getApiBaseUrl(),
        ministryId: board.desk.ministry.id,
        membershipId,
      });
      setChange(result);
      if (result.applied) setReloadKey((value) => value + 1);
    } catch {
      setChange({
        applied: false,
        status: 0,
        code: "MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED",
        message: "O encerramento não foi concluído. O vínculo não foi alterado.",
        member: null,
      });
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <section className={styles.desk}>
        <PageHeader appearance="workspace" heading="h1" title="Ministérios" />
        <p className={styles.lede}>A sessão ainda não está disponível nesta página.</p>
      </section>
    );
  }

  if (overview) return <MinistryOverview token={token} />;

  if (!board) {
    return (
      <section className={styles.desk} role="status">
        <PageHeader appearance="workspace" heading="h1" title="Ministérios" />
        <p className={`${ui.workspaceSurface} ${styles.loadingPanel}`}>Carregando ministérios…</p>
      </section>
    );
  }

  return (
    <MinistryExperience
      token={token}
      roles={roles}
      desk={board.desk}
      escalas={board.escalas}
      activities={board.activities}
      tab={route.tab}
      escalaId={route.escalaId}
      conversion={conversion}
      convertingId={convertingId}
      change={change}
      pending={pending}
      onSelect={(ministryId) => go({ ministryId, tab: "visao" })}
      onTab={(tab) =>
        go({
          ministryId: route.ministryId ?? (board.desk.kind === "ready" ? board.desk.ministry.id : undefined),
          tab,
        })
      }
      onOpenEscala={(escalaId) =>
        go({
          ministryId: route.ministryId ?? (board.desk.kind === "ready" ? board.desk.ministry.id : undefined),
          tab: "escalas",
          escalaId,
        })
      }
      onConvert={(id) => void convert(id)}
      onAdmit={(personId, role) => void admit(personId, role)}
      onEnd={(membershipId) => void end(membershipId)}
      onRefresh={() => setReloadKey((value) => value + 1)}
    />
  );
}
