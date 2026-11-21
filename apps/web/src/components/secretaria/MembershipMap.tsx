"use client";

import type { MembershipMapResponse, MembershipMapStatus } from "@idbrf/shared";
import dynamic from "next/dynamic";
import { useContext, useEffect, useState } from "react";
import { apiGet, isForbidden, loadStoredToken } from "../../lib/api";
import { AdminSessionContext } from "../AdminAccessGate";
import { AppNavLink, AppShell, UIIcon } from "../AppShell";
import { PageHeader } from "../ui/PageHeader";
import s from "./membership-map.module.css";

const demoEnabled = process.env.NEXT_PUBLIC_MEMBERSHIP_MAP_DEMO === "1";
const mapRoles = ["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"];
const labels = { ACTIVE: "Membros ativos", PENDING_ADMISSION: "Em admissão", INACTIVE: "Membros inativos" } as const;
const format = new Intl.NumberFormat("pt-BR");
const MapCanvas = dynamic(() => import("./MembershipMapCanvas").then(mod => mod.MembershipMapCanvas), {
  ssr: false,
  loading: () => <div className={s.placeholder} role="status">Carregando mapa…</div>,
});

type MapLoad =
  | { kind: "loading" }
  | { kind: "ready"; data: MembershipMapResponse }
  | { kind: "denied" }
  | { kind: "error" };

export function MembershipMap({ pastoralView = false }: { pastoralView?: boolean }) {
  const session = useContext(AdminSessionContext);
  const grants = session?.grants ?? [];
  const allowed = grants.some(grant => mapRoles.includes(grant.roleCode));
  const pastoral = pastoralView || (allowed && !grants.some(grant => ["SECRETARIA", "PLATFORM_ADMIN"].includes(grant.roleCode)));

  return <AppShell active={pastoral ? "pastoral" : "secretaria"} meta="Mapa da Membresia"
    secretarySection={pastoral ? undefined : "mapa"} pastoralSection={pastoral ? "mapa" : undefined}>
    <div className={s.page} data-membership-map>
      <PageHeader appearance="workspace" heading="h1" title="Mapa da Membresia"
        description="Veja onde os membros estão cadastrados por região."
        actions={allowed && !pastoral ? <AppNavLink className={s.peopleLink} href="/app/secretaria/pessoas/">
          <UIIcon name="people" size={16} /> Pessoas
        </AppNavLink> : undefined} />
      {allowed ? <MapWorkspace /> : <p role="alert">Seu perfil não tem acesso ao Mapa da Membresia.</p>}
    </div>
  </AppShell>;
}

function MapWorkspace() {
  const [status, setStatus] = useState<MembershipMapStatus>("ACTIVE");
  const [source, setSource] = useState<"demo" | "registry">(demoEnabled ? "demo" : "registry");
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<MapLoad>({ kind: "loading" });

  useEffect(() => {
    let current = true;
    const token = loadStoredToken();
    if (!token) {
      setLoad({ kind: "denied" });
      return;
    }
    // Both modes are inside the authenticated app. The example has no identifiable data.
    const request = source === "demo"
      ? import("./membership-map-demo").then(fixture => fixture.demoMembershipMap)
      : apiGet<MembershipMapResponse>("/reports/membership-map", token);
    void request.then(data => {
      if (current) setLoad({ kind: "ready", data });
    }).catch((error: unknown) => {
      if (current) setLoad({ kind: isForbidden(error) ? "denied" : "error" });
    });
    return () => { current = false; };
  }, [source, attempt]);

  function changeSource(next: "demo" | "registry") {
    setLoad({ kind: "loading" });
    setSource(next);
  }

  const group = load.kind === "ready" ? load.data[status] : undefined;
  const plotted = group?.regions.reduce((total, region) => total + region.count, 0);

  return <>
    <div className={s.toolbar}>
      <label>Situação <select value={status} onChange={event => setStatus(event.target.value as MembershipMapStatus)}>
        <option value="ACTIVE">Membros ativos</option>
        <option value="PENDING_ADMISSION">Em admissão</option>
        <option value="INACTIVE">Membros inativos</option>
      </select></label>
      {demoEnabled && <label>Origem <select value={source} onChange={event => changeSource(event.target.value as typeof source)}>
        <option value="demo">Dados fictícios</option>
        <option value="registry">Cadastros do DEV</option>
      </select></label>}
      {group && <div className={s.coverage} aria-live="polite">
        <span><strong>{format.format(plotted ?? 0)}</strong> no mapa</span>
        <span><strong>{format.format(group.pending)}</strong> endereços a revisar</span>
        {group.grouped > 0 && <span><strong>{format.format(group.grouped)}</strong> em regiões agrupadas</span>}
      </div>}
    </div>
    {load.kind === "loading" && <div className={s.placeholder} role="status">Carregando mapa…</div>}
    {load.kind === "denied" && <p role="alert">Seu perfil não tem acesso ao Mapa da Membresia.</p>}
    {load.kind === "error" && <div role="alert" className={s.notice}>
      Não conseguimos consultar a distribuição por região.
      <button type="button" onClick={() => { setLoad({ kind: "loading" }); setAttempt(value => value + 1); }}>Tentar novamente</button>
    </div>}
    {group && <MapCanvas regions={group.regions} statusLabel={labels[status].toLocaleLowerCase("pt-BR")} />}
  </>;
}
