"use client";

import { useState, type FormEvent } from "react";
import { apiPatch, apiPost } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import type { EscalaModule, EscalaModuleRules } from "../../lib/ministry-presentation";
import ui from "../ui/ui.module.css";
import type { RosterActionsProps } from "./RosterEditor";
import { RosterModuleRulesEditor } from "./RosterModuleRulesEditor";
import s from "./roster-editor.module.css";

export function RosterModuleCatalog({ actions, modules, initialId, louvor, onRulesSaved }: {
  actions?: RosterActionsProps;
  modules: EscalaModule[];
  initialId?: string;
  onRulesSaved: (id: string, rules: EscalaModuleRules) => void;
  louvor?: boolean;
}) {
  const [editing, setEditing] = useState<EscalaModule | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(initialId ?? "");
  const selected = modules.find(module => module.id === selectedId) ?? modules[0];

  function edit(module: EscalaModule | "new") {
    setError("");
    setEditing(module);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actions || !editing || busy) return;
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!name) { setError("Informe o nome do módulo."); return; }
    const path = `/ministries/${encodeURIComponent(actions.ministryId)}/roster-modules`;
    setBusy(true);
    setError("");
    try {
      if (editing === "new") await apiPost(path, actions.token, { name });
      else await apiPatch(`${path}/${encodeURIComponent(editing.id)}`, actions.token, { name });
      setEditing(null);
      actions.onRefresh();
    } catch (error) {
      setError(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={s.moduleCatalog} aria-label="Módulos de escala">
      <h3>Módulos e regras</h3>
      <div className={s.form}>
        {modules.length > 0 && <label>Módulo para editar<select value={selected?.id ?? ""} disabled={busy}
          onChange={event => { setSelectedId(event.target.value); setEditing(null); setError(""); }}>
          {modules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}
        </select></label>}
        {actions && <button className={ui.workspaceSecondary} type="button" disabled={busy} onClick={() => edit("new")}>Novo módulo</button>}
        {actions && selected && <button className={ui.workspaceSecondary} type="button" disabled={busy} onClick={() => edit(selected)}>Renomear módulo</button>}
      </div>
      {editing && <form className={s.form} key={editing === "new" ? "new" : editing.id} onSubmit={save}>
        <label>Nome do módulo<input name="name" defaultValue={editing === "new" ? "" : editing.name} maxLength={100} required /></label>
        <button className={ui.workspacePrimary} type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar módulo"}</button>
        <button className={ui.workspaceSecondary} type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button>
      </form>}
      {actions && selected && <RosterModuleRulesEditor key={selected.id} module={selected} actions={{ ...actions, onRulesSaved: rules => onRulesSaved(selected.id, rules) }} louvor={louvor} />}
      {error && <p className={s.error} role="alert">{error}</p>}
    </section>
  );
}
