"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPatch, apiPost, loadStoredToken } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { readMinistries, presentMembership, type FormalMember, type MinistryOption } from "../lib/ministry-desk";
import type { EscalaModule, EscalaModuleRules } from "../lib/ministry-presentation";
import { usePersonaAccess } from "./AppShell";
import { RosterModuleRulesEditor } from "./ministry/RosterModuleRulesEditor";
import { UIIcon } from "./ui/UIIcon";
import { Modal } from "./ui/Modal";
import { Alert } from "./ui/Alert";
import ui from "./ui/ui.module.css";
import s from "./system-rules-desk.module.css";

type RosterModuleResponse = {
  ministryId: string;
  modules?: EscalaModule[];
  permissions?: { scope: "ministry" | "modules" | "none" };
};
type Dialog = { kind: "rules"; moduleId: string } | { kind: "create" } | { kind: "rename"; moduleId: string };

/** A fonte de verdade é a regra do módulo salva pela API, nunca um resumo inventado no frontend. */
function moduleSummary(module: EscalaModule) {
  const positions = Object.values(module.rules?.positions ?? {}).flat();
  const services = Object.values(module.rules?.positions ?? {}).filter(rows => rows.length > 0).length;
  const slots = positions.reduce((count, row) => count + (row.count ?? 0), 0);
  return { services, slots };
}

export function OperationalMinistryRules() {
  const access = usePersonaAccess();
  const allowed = access.kind === "ready" && access.roles.includes("PLATFORM_ADMIN");
  const [token, setToken] = useState("");
  const [ministries, setMinistries] = useState<MinistryOption[]>([]);
  const [ministryId, setMinistryId] = useState("");
  const [modules, setModules] = useState<EscalaModule[] | null>(null);
  const [members, setMembers] = useState<FormalMember[]>([]);
  const [scopeAllowed, setScopeAllowed] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [moduleName, setModuleName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");

  useEffect(() => {
    if (!allowed) return;
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
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !token || !ministryId || !ministries.some(row => row.id === ministryId)) return;
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
        setError("Sem autorização administrativa para configurar este ministério.");
        return;
      }
      const membership = presentMembership(200, response);
      if (membership.kind !== "ready") {
        setError("Não foi possível verificar os integrantes autorizados deste ministério.");
        return;
      }
      setScopeAllowed(true);
      setMembers(membership.members.filter(person => person.status === "ATIVO"));
      setModules(Array.isArray(roster.modules) ? roster.modules.filter(module =>
        typeof module.id === "string" && typeof module.name === "string") : []);
    }).catch(issue => { if (live) setError(dasError(issue)); });
    return () => { live = false; };
  }, [allowed, token, ministryId, ministries, reload]);

  const selectedMinistry = ministries.find(row => row.id === ministryId);
  const selectedModule = dialog && "moduleId" in dialog ? modules?.find(row => row.id === dialog.moduleId) : null;
  const canEdit = allowed && scopeAllowed && modules !== null && Boolean(token);

  function openDialog(next: Dialog) {
    setMutationError("");
    setModuleName(next.kind === "rename" ? modules?.find(row => row.id === next.moduleId)?.name ?? "" : "");
    setDialog(next);
  }
  function closeDialog() {
    if (busy) return;
    setMutationError("");
    setDialog(null);
  }
  async function saveModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || busy || !dialog || dialog.kind === "rules") return;
    const name = moduleName.trim().replace(/\s+/g, " ");
    if (!name) { setMutationError("Informe um nome para o módulo."); return; }
    setBusy(true);
    setMutationError("");
    try {
      const path = `/ministries/${encodeURIComponent(ministryId)}/roster-modules`;
      if (dialog.kind === "create") {
        await apiPost(path, token, { name });
      } else {
        await apiPatch(`${path}/${encodeURIComponent(dialog.moduleId)}`, token, { name });
      }
      setDialog(null);
      setReload(value => value + 1);
    } catch (issue) { setMutationError(dasError(issue)); }
    finally { setBusy(false); }
  }

  if (!allowed) return null;

  return <div className={s.centralWorkspace} aria-label="Configurações de escalas por ministério">
    <div className={s.centralToolbar}>
      <div className={s.centralToolbarIntro}>
        <strong>Módulos de escala</strong>
        <span>Escolha o ministério e abra apenas a configuração que deseja alterar.</span>
      </div>
      <label className={s.centralMinistrySelect}>Ministério
        <select value={ministryId} onChange={event => {
          setDialog(null);
          setMinistryId(event.target.value);
        }} disabled={!ministries.length || busy}>
          {ministries.length === 0 && <option value="">Nenhum ministério disponível</option>}
          {ministries.map(ministry => <option value={ministry.id} key={ministry.id}>{ministry.name}</option>)}
        </select>
      </label>
      <button className={ui.workspacePrimary} type="button" disabled={!canEdit}
        onClick={() => openDialog({ kind: "create" })}>
        <UIIcon name="plus" size={17} /> Novo módulo
      </button>
    </div>

    {error && <Alert appearance="workspace" tone="danger" title={error} />}
    {ministryId && !error && modules === null && <p role="status" className={s.centralState}>Carregando módulos autorizados…</p>}
    {!ministryId && !error && <p role="status" className={s.centralState}>Nenhum ministério disponível para configuração.</p>}

    {canEdit && modules && <>
      <div className={s.centralListHeading}>
        <h3>{selectedMinistry?.name ?? "Ministério"}</h3>
        <span>{modules.length} {modules.length === 1 ? "módulo" : "módulos"}</span>
      </div>
      {modules.length === 0 ? <p className={s.centralEmpty}>Este ministério ainda não tem módulos de escala. Use <strong>Novo módulo</strong> para começar.</p>
        : <ul className={s.centralModuleGrid} aria-label="Módulos configuráveis">
          {modules.map(module => {
            const summary = moduleSummary(module);
            return <li key={module.id} className={s.centralModuleCard}>
              <span className={s.centralModuleIcon}><UIIcon name="roster" size={20} /></span>
              <div className={s.centralModuleCopy}>
                <strong>{module.name}</strong>
                <span>{summary.services} {summary.services === 1 ? "tipo de culto" : "tipos de culto"} · {summary.slots} {summary.slots === 1 ? "vaga configurada" : "vagas configuradas"}</span>
              </div>
              <button type="button" className={s.centralConfigure}
                onClick={() => openDialog({ kind: "rules", moduleId: module.id })}>
                Configurar <UIIcon name="chevron" size={16} />
              </button>
            </li>;
          })}
        </ul>}
    </>}

    <p className={s.centralGuard}>
      <UIIcon name="shield" size={17} />
      As alterações respeitam o acesso de cada ministério. Os líderes continuam gerenciando apenas as regras de sua equipe.
    </p>

    {dialog?.kind === "rules" && canEdit && selectedModule &&
      <Modal open appearance="workspace" size="wide" title={`Configurar · ${selectedModule.name}`}
        description={`Ministério: ${selectedMinistry?.name ?? "selecionado"}. Altere as regras por assunto e salve ao concluir.`}
        onClose={closeDialog}>
        <div className={s.centralDialogTools}>
          <button type="button" className={ui.workspaceQuiet} onClick={() =>
            openDialog({ kind: "rename", moduleId: selectedModule.id })}>Renomear módulo</button>
        </div>
        <RosterModuleRulesEditor key={selectedModule.id} module={selectedModule}
          compact
          louvor={/louvor/i.test(selectedMinistry?.slug ?? "")}
          actions={{
            token, ministryId, members, onRefresh: () => setReload(value => value + 1),
            onOpen: () => undefined, managedModuleMemberships: true,
            hideMembershipLinks: true,
            onRulesSaved: (rules: EscalaModuleRules) => {
              setModules(current => current?.map(row => row.id === selectedModule.id ? { ...row, rules } : row) ?? null);
            },
          }} />
      </Modal>}

    {dialog && dialog.kind !== "rules" && canEdit &&
      <Modal open appearance="workspace"
        title={dialog.kind === "create" ? "Novo módulo" : "Renomear módulo"}
        description="A alteração será gravada somente neste ministério."
        onClose={closeDialog}>
        <form className={s.centralNameForm} onSubmit={saveModule}>
          <label>Nome do módulo
            <input required maxLength={100} autoFocus value={moduleName}
              onChange={event => setModuleName(event.target.value)}
              placeholder="Ex.: Recepção" />
          </label>
          {mutationError && <Alert appearance="workspace" tone="danger" title={mutationError} />}
          <div className={s.centralNameActions}>
            <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={closeDialog}>Cancelar</button>
            <button type="submit" className={ui.workspacePrimary} disabled={busy || !moduleName.trim()}>
              {busy ? "Salvando…" : "Salvar módulo"}
            </button>
          </div>
        </form>
      </Modal>}
  </div>;
}
