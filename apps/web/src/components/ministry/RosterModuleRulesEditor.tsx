"use client";

import { useState, type FormEvent } from "react";
import { apiPatch } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { ROSTER_SERVICE_TYPES, type EscalaModule, type EscalaModuleRules, type ModulePosition, type RosterServiceType } from "../../lib/ministry-presentation";
import ui from "../ui/ui.module.css";
import type { RosterActionsProps } from "./RosterEditor";
import s from "./roster-editor.module.css";

export function RosterModuleRulesEditor({ module, actions }: { module: EscalaModule; actions: RosterActionsProps }) {
  const [rules, setRules] = useState<EscalaModuleRules>(() => ({
    positions: {}, qualifications: {}, couples: [], minIntervalDays: 10, maxMonthlyAssignments: 3, substituteInviteLimit: 0, ...module.rules,
  }));
  const [type, setType] = useState<RosterServiceType>("sunday_morning");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const rows = rules.positions[type] ?? [];
  const tags = [...new Set(["diaconia", ...Object.values(rules.positions).flatMap(list => list.map(row => row.qualification ?? "")).filter(Boolean)])];

  function setRows(positions: ModulePosition[]) {
    setRules(previous => ({ ...previous, positions: { ...previous.positions, [type]: positions } }));
  }
  function editRow(index: number, update: Partial<ModulePosition>) {
    setRows(rows.map((row, i) => i === index ? { ...row, ...update } : row));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      await apiPatch(`/ministries/${encodeURIComponent(actions.ministryId)}/roster-modules/${encodeURIComponent(module.id)}/rules`, actions.token, rules);
      setNotice("Regras salvas para os próximos cultos.");
    } catch (error) { setNotice(dasError(error)); }
    finally { setBusy(false); }
  }
  return <details className={s.position}>
    <summary>Vagas, habilitações e casais de {module.name}</summary>
    <form className={s.ruleForm} onSubmit={save}>
      <div className={s.form}>
        <label>Tipo de culto<select value={type} onChange={event => setType(event.target.value as RosterServiceType)}>
          {Object.entries(ROSTER_SERVICE_TYPES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Intervalo mínimo em dias<input type="number" min={0} max={60} value={rules.minIntervalDays} onChange={event => setRules({ ...rules, minIntervalDays: Number(event.target.value) })} /></label>
        <label>Máximo de escalas por mês<input type="number" min={1} max={31} value={rules.maxMonthlyAssignments} onChange={event => setRules({ ...rules, maxMonthlyAssignments: Number(event.target.value) })} /></label>
        <label>Convites automáticos por vaga<input type="number" min={0} max={5} value={rules.substituteInviteLimit} onChange={event => setRules({ ...rules, substituteInviteLimit: Number(event.target.value) })} /></label>
      </div>
      {rows.map((row, index) => <div className={s.form} key={index}>
        <label>Posição<input required maxLength={100} value={row.label} onChange={event => editRow(index, { label: event.target.value })} /></label>
        <label>Vagas<input type="number" min={0} max={30} value={row.count} onChange={event => editRow(index, { count: Number(event.target.value) })} /></label>
        <label>Habilitação<select value={row.qualification ?? ""} onChange={event => editRow(index, { qualification: event.target.value || undefined })}>
          <option value="">Qualquer integrante</option>{tags.map(tag => <option key={tag} value={tag}>{tag === "diaconia" ? "Diaconia" : tag}</option>)}
        </select></label>
        <label className={s.checkbox}><input type="checkbox" checked={row.couple} onChange={event => editRow(index, { couple: event.target.checked })} /> Casal</label>
        <button className={ui.workspaceSecondary} type="button" onClick={() => setRows(rows.filter((_, i) => i !== index))}>Remover posição</button>
      </div>)}
      <button className={ui.workspaceSecondary} type="button" onClick={() => setRows([...rows, { label: "", count: 1, couple: false }])}>Adicionar regra de vaga</button>
      {tags.map(tag => <div className={s.form} key={tag}><label>{tag === "diaconia" ? "Diáconos e diaconisas habilitados" : tag}
        <select multiple value={rules.qualifications[tag] ?? []} onChange={event => setRules({ ...rules, qualifications: {
          ...rules.qualifications, [tag]: Array.from(event.target.selectedOptions, option => option.value),
        } })}>{actions.members.map(person => <option value={person.personId} key={person.personId}>{person.displayName}</option>)}</select>
      </label></div>)}
      {rules.couples.map((pair, index) => <div className={s.form} key={index}>
        {pair.map((id, side) => <label key={side}>Pessoa {side + 1} do casal<select required value={id} onChange={event => {
          const updated: [string, string] = [...pair]; updated[side] = event.target.value;
          setRules({ ...rules, couples: rules.couples.map((current, i) => i === index ? updated : current) });
        }}><option value="">Selecionar</option>{actions.members.map(person => <option key={person.personId} value={person.personId}>{person.displayName}</option>)}</select></label>)}
        <button type="button" className={ui.workspaceSecondary} onClick={() => setRules({ ...rules, couples: rules.couples.filter((_, i) => i !== index) })}>Remover casal</button>
      </div>)}
      <button className={ui.workspaceSecondary} type="button" onClick={() => setRules({ ...rules, couples: [...rules.couples, ["", ""]] })}>Cadastrar casal</button>
      <button className={ui.workspacePrimary} disabled={busy} type="submit">Salvar regras</button>
      {notice && <p role="status">{notice}</p>}
    </form>
  </details>;
}
