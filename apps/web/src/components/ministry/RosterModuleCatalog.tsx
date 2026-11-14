"use client";

import { useState, type FormEvent } from "react";
import { apiPatch, apiPost } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import type { EscalaModule } from "../../lib/ministry-presentation";
import ui from "../ui/ui.module.css";
import type { RosterActionsProps } from "./RosterEditor";
import { RosterModuleRulesEditor } from "./RosterModuleRulesEditor";
import s from "./roster-editor.module.css";

export function RosterModuleCatalog({ actions, modules, selectedId, onSelect }: {
  actions?: RosterActionsProps;
  modules: EscalaModule[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [editing, setEditing] = useState<EscalaModule | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = modules.find(module => module.id === selectedId);

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
      <div className={s.form}>
        {modules.length > 0 && <label>Módulo da escala<select value={selectedId} onChange={event => onSelect(event.target.value)}>
          <option value="">Todas as escalas</option>
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
      {actions && selected && <RosterModuleRulesEditor key={selected.id} module={selected} actions={actions} />}
      {error && <p className={s.error} role="alert">{error}</p>}
    </section>
  );
}
