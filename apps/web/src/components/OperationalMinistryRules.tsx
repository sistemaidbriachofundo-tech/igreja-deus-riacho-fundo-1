"use client";

import { useEffect, useState } from "react";
import { apiGet, loadStoredToken } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { readMinistries, presentMembership, type FormalMember, type MinistryOption } from "../lib/ministry-desk";
import type { EscalaModule, EscalaModuleRules } from "../lib/ministry-presentation";
import { RosterModuleCatalog } from "./ministry/RosterModuleCatalog";
import { Alert } from "./ui/Alert";
import s from "./system-rules-desk.module.css";

type RosterModuleResponse = {
  ministryId: string;
  modules?: EscalaModule[];
  permissions?: { scope: "ministry" | "modules" | "none" };
};

export function OperationalMinistryRules() {
  const [token, setToken] = useState("");
  const [ministries, setMinistries] = useState<MinistryOption[]>([]);
  const [ministryId, setMinistryId] = useState("");
  const [modules, setModules] = useState<EscalaModule[] | null>(null);
  const [members, setMembers] = useState<FormalMember[]>([]);
  const [scopeAllowed, setScopeAllowed] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const session = loadStoredToken();
    if (!session) return;
    setToken(session);
    let live = true;
    void apiGet<unknown>("/ministries", session, { fresh: true })
      .then(response => {
        if (!live) return;
        const available = readMinistries(response);
        setMinistries(available);
        setMinistryId(current => current && available.some(row => row.id === current) ? current : available[0]?.id ?? "");
      })
      .catch(issue => { if (live) setError(dasError(issue)); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!token || !ministryId || !ministries.some(row => row.id === ministryId)) return;
    let live = true;
    setModules(null);
    setMembers([]);
    setError("");
    setScopeAllowed(false);
    const id = encodeURIComponent(ministryId);
    void Promise.all([
      apiGet<RosterModuleResponse>(`/rosters/by-ministry/${id}`, token, { fresh: true }),
      apiGet<unknown>(`/ministry-scope/${id}/formal-memberships`, token, { fresh: true }),
    ]).then(([roster, response]) => {
      if (!live) return;
      if (roster.ministryId !== ministryId || roster.permissions?.scope !== "ministry") {
        setError("A configuração deste ministério exige permissão administrativa específica.");
        return;
      }
      const membership = presentMembership(200, response);
      if (membership.kind !== "ready") {
        setError("Não foi possível verificar os integrantes autorizados deste ministério.");
        return;
      }
      setScopeAllowed(true);
      setMembers(membership.members.filter(person => person.status === "ATIVO"));
      setModules(Array.isArray(roster.modules) ? roster.modules.filter(module => typeof module.id === "string" && typeof module.name === "string") : []);
    }).catch(issue => { if (live) setError(dasError(issue)); });
    return () => { live = false; };
  }, [token, ministryId, ministries, reload]);

  const selected = ministries.find(item => item.id === ministryId);
  return <section className={s.centralRoster} aria-label="Configuração central dos módulos e escalas">
    <div className={s.centralRosterHeader}>
      <div>
        <h3>Regras de módulos e escalas</h3>
        <p>Configure posições, vagas, habilitações, intervalos, limites mensais e convites aqui, sem entrar no ministério.</p>
      </div>
      <label>Ministério
        <select value={ministryId} onChange={event => setMinistryId(event.target.value)} disabled={!ministries.length}>
          {ministries.length === 0 && <option value="">Nenhum ministério disponível</option>}
          {ministries.map(ministry => <option value={ministry.id} key={ministry.id}>{ministry.name}</option>)}
        </select>
      </label>
    </div>
    {error && <Alert appearance="workspace" tone="danger" title={error} />}
    {ministryId && !error && modules === null && <p role="status">Consultando módulos e regras autorizados…</p>}
    {scopeAllowed && modules && selected && <RosterModuleCatalog
      key={ministryId}
      modules={modules}
      louvor={/louvor/i.test(selected.slug ?? "")}
      actions={{
        token,
        ministryId,
        members,
        onRefresh: () => setReload(value => value + 1),
        onOpen: () => undefined,
        managedModuleMemberships: true,
        hideMembershipLinks: true,
      }}
      onRulesSaved={(id: string, rules: EscalaModuleRules) => setModules(current => current?.map(module => module.id === id ? { ...module, rules } : module) ?? null)}
    />}
    <p className={s.centralRosterHint}>O administrador configura a congregação nesta tela. A liderança do ministério continua podendo alterar apenas os próprios módulos na sua área; a API verifica essas permissões em cada operação.</p>
  </section>;
}
