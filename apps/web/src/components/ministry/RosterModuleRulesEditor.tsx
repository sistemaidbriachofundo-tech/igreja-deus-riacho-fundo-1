"use client";

import { useState, type FormEvent } from "react";
import { apiPatch } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { ministryHref } from "../../lib/ministry-view";
import { withBasePath } from "../../lib/paths";
import { ROSTER_LOCATION_LABELS, ROSTER_SERVICE_TYPES, type RosterLocation, type EscalaModule, type EscalaModuleRules, type ModulePosition, type RosterServiceType } from "../../lib/ministry-presentation";
import ui from "../ui/ui.module.css";
import type { RosterActionsProps } from "./RosterEditor";
import s from "./roster-editor.module.css";

const louvorQualifications: Record<string, string> = {
  lider: "Líder", bateria: "Bateria", violao: "Violão", teclado: "Teclado", baixo: "Baixo",
  ministro: "Ministro de louvor", back_vocal: "Back vocal",
  ministro_contralto: "Ministro · Contralto", ministro_mezzo_soprano: "Ministro · Mezzo-soprano", ministro_soprano: "Ministro · Soprano",
  back_vocal_contralto: "Back vocal · Contralto", back_vocal_mezzo_soprano: "Back vocal · Mezzo-soprano", back_vocal_soprano: "Back vocal · Soprano",
};

export function RosterModuleRulesEditor({ module, actions, louvor }: {
  module: EscalaModule;
  actions: RosterActionsProps;
  louvor?: boolean;
}) {
  const [rules, setRules] = useState<EscalaModuleRules>(() => ({
    positions: {}, qualifications: {}, couples: [], minIntervalDays: 10, maxMonthlyAssignments: 3, substituteInviteLimit: 0, ...module.rules,
    ...(actions.requireModuleMembership ? { volunteerIds: module.rules?.volunteerIds ?? [] } : {}),
  }));
  const [type, setType] = useState<RosterServiceType>("sunday_morning");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [newVolunteer, setNewVolunteer] = useState("");
  const team = rules.volunteerIds;
  const memberNames = new Map(actions.members.map(person => [person.personId, person.displayName]));
  const availableMembers = actions.members.filter(person => !team?.includes(person.personId));
  const teamMembers = actions.members.filter(person => !team || team.includes(person.personId));
  const rows = rules.positions[type] ?? [];
  const tagNames = louvor ? louvorQualifications : { diaconia: "Diaconia" } as Record<string, string>;
  const tags = [...new Set([...Object.keys(tagNames), ...Object.keys(rules.qualifications),
    ...Object.values(rules.positions).flatMap(list => list.map(row => row.qualification ?? "")).filter(Boolean)])];

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
      const { volunteerIds, ...otherRules } = rules;
      const payload = actions.managedModuleMemberships ? otherRules : { ...otherRules, volunteerIds };
      const saved = await apiPatch<{ rules: EscalaModuleRules }>(`/ministries/${encodeURIComponent(actions.ministryId)}/roster-modules/${encodeURIComponent(module.id)}/rules`, actions.token, payload);
      setNotice(actions.managedModuleMemberships ? "Regras do módulo salvas." : "Equipe e regras do módulo salvas.");
      actions.onRulesSaved?.(saved.rules);
    } catch (error) { setNotice(dasError(error)); }
    finally { setBusy(false); }
  }
  return <section className={s.ruleSection} aria-label={"Regras de " + module.name}>
    <h4>Regras de {module.name}</h4>
    <form className={s.ruleForm} onSubmit={save}>
      {actions.managedModuleMemberships ? <p>
        <a href={withBasePath(ministryHref(actions.ministryId, "integrantes"))}>Editar vínculos em Integrantes</a>
      </p> : <fieldset className={s.moduleTeam}>
        <legend>Voluntários do módulo</legend>
        <a href={withBasePath(ministryHref(actions.ministryId, "integrantes"))}>Gerenciar integrantes do ministério</a>
        {!actions.requireModuleMembership && <label>Quem pode servir
          <select value={team ? "team" : "ministry"} onChange={event => setRules(previous => ({
            ...previous,
            volunteerIds: event.target.value === "team"
              ? [...new Set([...Object.values(previous.qualifications).flat(), ...previous.couples.flat()])]
              : undefined,
          }))}>
            <option value="ministry">Todos os integrantes ativos do ministério</option>
            <option value="team">Somente a equipe deste módulo</option>
          </select>
        </label>}
        {team && <>
          <div className={s.form}>
            <label>Voluntário<select value={newVolunteer} onChange={event => setNewVolunteer(event.target.value)}>
              <option value="">Selecionar integrante</option>
              {availableMembers.map(person => <option key={person.personId} value={person.personId}>{person.displayName}</option>)}
            </select></label>
            <button className={ui.workspaceSecondary} type="button" disabled={!newVolunteer || !availableMembers.some(member => member.personId === newVolunteer)} onClick={() => {
              setRules({ ...rules, volunteerIds: [...team, newVolunteer] });
              setNewVolunteer("");
            }}>Adicionar voluntário</button>
          </div>
          {team.length ? <ul className={s.teamList}>{team.map(id => {
            const linked = rules.couples.some(pair => pair.includes(id)) || Object.values(rules.qualifications).some(ids => ids.includes(id));
            return <li key={id}>
              <span>{memberNames.get(id) ?? "Integrante inativo"}</span>
              <button type="button" className={ui.workspaceSecondary} onClick={() => {
                setRules({
                  ...rules,
                  volunteerIds: team.filter(personId => personId !== id),
                  couples: rules.couples.filter(pair => !pair.includes(id)),
                  qualifications: Object.fromEntries(Object.entries(rules.qualifications).map(([tag, ids]) => [tag, ids.filter(personId => personId !== id)])),
                });
                if (linked) setNotice("A remoção também retira os vínculos de casal e habilitações dessa pessoa neste módulo ao salvar.");
              }}>Remover <span className={s.screenReaderOnly}>{memberNames.get(id) ?? "integrante inativo"}</span></button>
            </li>;
          })}</ul> : <p>A equipe do módulo está vazia. Adicione pelo menos um voluntário para preencher vagas.</p>}
        </>}
      </fieldset>}
      <div className={s.form}>
        <label>Tipo de culto<select value={type} onChange={event => setType(event.target.value as RosterServiceType)}>
          {Object.entries(ROSTER_SERVICE_TYPES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Intervalo mínimo em dias<input type="number" min={0} max={60} value={rules.minIntervalDays} onChange={event => setRules({ ...rules, minIntervalDays: Number(event.target.value) })} /></label>
        <label>Máximo de escalas por mês<input type="number" min={1} max={31} value={rules.maxMonthlyAssignments} onChange={event => setRules({ ...rules, maxMonthlyAssignments: Number(event.target.value) })} /></label>
        <label>Convites por rodada<input type="number" min={0} max={5} value={rules.substituteInviteLimit} onChange={event => setRules({ ...rules, substituteInviteLimit: Number(event.target.value) })} /></label>
        {rules.substituteInviteLimit > 0 && <label>Prazo para aceitar (horas)<input type="number" min={1} max={72} value={rules.substituteInviteHours ?? 12} onChange={event => setRules({ ...rules, substituteInviteHours: Number(event.target.value) })} /></label>}
      </div>
      {rows.map((row, index) => <div className={s.form} key={index}>
        <label>Posição<input required maxLength={100} value={row.label} onChange={event => editRow(index, { label: event.target.value })} /></label>
        {Object.entries(ROSTER_LOCATION_LABELS).map(([field, label]) => <label key={field}>{label}<input maxLength={100} value={row[field as keyof RosterLocation] ?? ""} onChange={event => editRow(index, { [field]: event.target.value })} /></label>)}
        <label>Vagas<input type="number" min={0} max={30} value={row.count} onChange={event => editRow(index, { count: Number(event.target.value) })} /></label>
        <label>Habilitação<select value={row.qualification ?? ""} onChange={event => editRow(index, { qualification: event.target.value || undefined })}>
          <option value="">Qualquer integrante</option>{tags.map(tag => <option key={tag} value={tag}>{tagNames[tag] ?? tag}</option>)}
        </select></label>
        <label>Tipo de vaga<select value={row.couple ? "couple" : "individual"} onChange={event => editRow(index, { couple: event.target.value === "couple" })}>
          <option value="individual">Individual</option>
          <option value="couple">Casal</option>
        </select></label>
        <button className={ui.workspaceSecondary} type="button" onClick={() => setRows(rows.filter((_, i) => i !== index))}>Remover posição</button>
      </div>)}
      <button className={ui.workspaceSecondary} type="button" onClick={() => setRows([...rows, { label: "", count: 1, couple: false }])}>Adicionar regra de vaga</button>
      {tags.map(tag => <div className={s.form} key={tag}><label>{tag === "diaconia" ? "Diáconos e diaconisas habilitados" : tagNames[tag] ?? tag}
        <select multiple value={rules.qualifications[tag] ?? []} onChange={event => setRules({ ...rules, qualifications: {
          ...rules.qualifications, [tag]: Array.from(event.target.selectedOptions, option => option.value),
        } })}>{teamMembers.map(person => <option value={person.personId} key={person.personId}>{person.displayName}</option>)}</select>
      </label></div>)}
      <h3>Casais para vagas de casal</h3>
      {rules.couples.map((pair, index) => <div className={s.form} key={index}>
        {pair.map((id, side) => <label key={side}>Pessoa {side + 1} do casal<select required value={id} onChange={event => {
          const updated: [string, string] = [...pair]; updated[side] = event.target.value;
          setRules({ ...rules, couples: rules.couples.map((current, i) => i === index ? updated : current) });
        }}><option value="">Selecionar</option>{teamMembers.map(person => <option key={person.personId} value={person.personId}>{person.displayName}</option>)}</select></label>)}
        <button type="button" className={ui.workspaceSecondary} onClick={() => setRules({ ...rules, couples: rules.couples.filter((_, i) => i !== index) })}>Remover casal</button>
      </div>)}
      <button className={ui.workspaceSecondary} type="button" onClick={() => setRules({ ...rules, couples: [...rules.couples, ["", ""]] })}>Cadastrar casal</button>
      <button className={ui.workspacePrimary} disabled={busy} type="submit">Salvar regras</button>
      {notice && <p role="status">{notice}</p>}
    </form>
  </section>;
}
