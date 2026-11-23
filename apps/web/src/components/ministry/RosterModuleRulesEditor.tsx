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

/** Modelo inicial: é gravado só após o usuário revisar e salvar as regras. */
export const LOUVOR_STARTER_POSITIONS: ModulePosition[] = [
  { label: "Ministro de louvor", count: 1, couple: false, qualification: "ministro" },
  { label: "Bateria", count: 1, couple: false, qualification: "bateria" },
  { label: "Baixo", count: 1, couple: false, qualification: "baixo" },
  { label: "Teclado", count: 1, couple: false, qualification: "teclado" },
  { label: "Violão", count: 1, couple: false, qualification: "violao" },
  { label: "Back vocal", count: 2, couple: false, qualification: "back_vocal" },
];
const LOUVOR_CULTOS: RosterServiceType[] = ["thursday_evening", "sunday_morning", "sunday_evening"];

type RuleTab = "gerais" | "vagas" | "habilitacoes" | "casais" | "equipe";

export function RosterModuleRulesEditor({ module, actions, louvor, compact = false }: {
  module: EscalaModule;
  actions: RosterActionsProps;
  louvor?: boolean;
  compact?: boolean;
}) {
  const [rules, setRules] = useState<EscalaModuleRules>(() => ({
    positions: {}, qualifications: {}, couples: [], minIntervalDays: 10, maxMonthlyAssignments: 3, substituteInviteLimit: 0, ...module.rules,
    ...(actions.requireModuleMembership ? { volunteerIds: module.rules?.volunteerIds ?? [] } : {}),
  }));
  const [type, setType] = useState<RosterServiceType>("sunday_morning");
  const [section, setSection] = useState<RuleTab>("gerais");
  const [selectedQualification, setSelectedQualification] = useState(louvor ? "ministro" : "diaconia");
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
      if (Object.values(rules.positions).flat().some(row => !row.label.trim())) {
        setSection("vagas");
        setNotice("Preencha o nome de todas as posições antes de salvar.");
        return;
      }
      const { volunteerIds, ...otherRules } = rules;
      const payload = actions.managedModuleMemberships ? otherRules : { ...otherRules, volunteerIds };
      const saved = await apiPatch<{ rules: EscalaModuleRules }>(`/ministries/${encodeURIComponent(actions.ministryId)}/roster-modules/${encodeURIComponent(module.id)}/rules`, actions.token, payload);
      setNotice(actions.managedModuleMemberships ? "Regras do módulo salvas." : "Equipe e regras do módulo salvas.");
      actions.onRulesSaved?.(saved.rules);
    } catch (error) { setNotice(dasError(error)); }
    finally { setBusy(false); }
  }
  const tabs: { id: RuleTab; name: string }[] = [
    { id: "gerais", name: "Regras gerais" }, { id: "vagas", name: "Vagas por culto" },
    { id: "habilitacoes", name: "Habilitações" }, { id: "casais", name: "Casais" },
    ...(!actions.managedModuleMemberships ? [{ id: "equipe" as const, name: "Equipe" }] : []),
  ];
  return <section className={s.ruleSection} data-compact={compact ? "true" : "false"} aria-label={"Regras de " + module.name}>
    {!compact && <h4>Regras de {module.name}</h4>}
    {compact && <nav className={s.ruleTabs} role="tablist" aria-label="Assuntos de configuração">
      {tabs.map(tab => <button type="button" role="tab" key={tab.id} aria-selected={section === tab.id}
        onClick={() => { setSection(tab.id); setNotice(""); }}>{tab.name}</button>)}
    </nav>}
    <form className={s.ruleForm} onSubmit={save}>
      {(!compact || section === "equipe") && <>
      {actions.managedModuleMemberships ? <p>
        {actions.hideMembershipLinks ? "Vínculos de integrantes são administrados pela liderança autorizada do ministério." :
          <a href={withBasePath(ministryHref(actions.ministryId, "integrantes"))}>Editar vínculos em Integrantes</a>}
      </p> : <fieldset className={s.moduleTeam}>
        <legend>Voluntários do módulo</legend>
        {actions.hideMembershipLinks ? <p>Gerencie a composição da equipe na área de Integrantes.</p> :
          <a href={withBasePath(ministryHref(actions.ministryId, "integrantes"))}>Gerenciar integrantes do ministério</a>}
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
      </>}
      {(!compact || section === "gerais") && <div className={s.rulePane}>
        {compact && <p>Defina a frequência de participação e o fluxo de convites para todas as escalas deste módulo.</p>}
        <div className={s.form}>
        <label>Intervalo mínimo em dias<input type="number" min={0} max={60} value={rules.minIntervalDays} onChange={event => setRules({ ...rules, minIntervalDays: Number(event.target.value) })} /></label>
        <label>Máximo de escalas por mês<input type="number" min={1} max={31} value={rules.maxMonthlyAssignments} onChange={event => setRules({ ...rules, maxMonthlyAssignments: Number(event.target.value) })} /></label>
        <label>Convites por rodada<input type="number" min={0} max={5} value={rules.substituteInviteLimit} onChange={event => setRules({ ...rules, substituteInviteLimit: Number(event.target.value) })} /></label>
        {rules.substituteInviteLimit > 0 && <label>Prazo para aceitar (horas)<input type="number" min={1} max={72} value={rules.substituteInviteHours ?? 12} onChange={event => setRules({ ...rules, substituteInviteHours: Number(event.target.value) })} /></label>}
        </div>
      </div>}
      {(!compact || section === "vagas") && <div className={s.rulePane}>
        {compact && <p>Escolha um culto e configure as vagas. Posições de outros cultos continuam salvas ao trocar a seleção.</p>}
        <div className={s.form}>
        <label>Tipo de culto<select value={type} onChange={event => setType(event.target.value as RosterServiceType)}>
          {Object.entries(ROSTER_SERVICE_TYPES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        </div>
      {louvor && <div className={s.form}>
        <button className={ui.workspaceSecondary} type="button" disabled={busy ||
          LOUVOR_CULTOS.every(cult => (rules.positions[cult] ?? []).length > 0)}
          onClick={() => {
            setRules(current => ({
              ...current,
              positions: Object.fromEntries([
                ...Object.entries(current.positions),
                ...LOUVOR_CULTOS.filter(cult => !(current.positions[cult] ?? []).length)
                  .map(cult => [cult, LOUVOR_STARTER_POSITIONS.map(position => ({ ...position }))]),
              ]) as EscalaModuleRules["positions"],
            }));
            setNotice("Modelo sugerido aplicado somente aos cultos sem posições. Revise as vagas, as habilitações e clique em Salvar regras.");
          }}>
          Aplicar modelo editável do Louvor
        </button>
        <p>Cria posições sugeridas para quinta e domingos, sem substituir regras já salvas. A escala só será gerada depois de associar integrantes habilitados e revisar a simulação mensal.</p>
      </div>}
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
      </div>}
      {(!compact || section === "habilitacoes") && <div className={s.rulePane}>
        {compact ? <>
          <p>Selecione uma função e marque os integrantes habilitados. Para selecionar vários, use Ctrl ou ⌘.</p>
          <label className={s.ruleField}>Habilitação
            <select value={selectedQualification} onChange={event => setSelectedQualification(event.target.value)}>
              {tags.map(tag => <option value={tag} key={tag}>{tagNames[tag] ?? tag}</option>)}
            </select>
          </label>
          <label className={s.ruleField}>Integrantes habilitados
            <select multiple size={Math.min(8, Math.max(4, teamMembers.length))}
              value={rules.qualifications[selectedQualification] ?? []}
              onChange={event => setRules({ ...rules, qualifications: {
                ...rules.qualifications,
                [selectedQualification]: Array.from(event.target.selectedOptions, option => option.value),
              } })}>
              {teamMembers.map(person => <option value={person.personId} key={person.personId}>{person.displayName}</option>)}
            </select>
          </label>
        </> : <>
      {tags.map(tag => <div className={s.form} key={tag}><label>{tag === "diaconia" ? "Diáconos e diaconisas habilitados" : tagNames[tag] ?? tag}
        <select multiple value={rules.qualifications[tag] ?? []} onChange={event => setRules({ ...rules, qualifications: {
          ...rules.qualifications, [tag]: Array.from(event.target.selectedOptions, option => option.value),
        } })}>{teamMembers.map(person => <option value={person.personId} key={person.personId}>{person.displayName}</option>)}</select>
      </label></div>)}
        </>}
      </div>}
      {(!compact || section === "casais") && <div className={s.rulePane}>
        {compact && <p>Cadastre casais apenas quando uma posição exigir duas pessoas juntas.</p>}
      <h3>Casais para vagas de casal</h3>
      {rules.couples.map((pair, index) => <div className={s.form} key={index}>
        {pair.map((id, side) => <label key={side}>Pessoa {side + 1} do casal<select required value={id} onChange={event => {
          const updated: [string, string] = [...pair]; updated[side] = event.target.value;
          setRules({ ...rules, couples: rules.couples.map((current, i) => i === index ? updated : current) });
        }}><option value="">Selecionar</option>{teamMembers.map(person => <option key={person.personId} value={person.personId}>{person.displayName}</option>)}</select></label>)}
        <button type="button" className={ui.workspaceSecondary} onClick={() => setRules({ ...rules, couples: rules.couples.filter((_, i) => i !== index) })}>Remover casal</button>
      </div>)}
      <button className={ui.workspaceSecondary} type="button" onClick={() => setRules({ ...rules, couples: [...rules.couples, ["", ""]] })}>Cadastrar casal</button>
      </div>}
      <div className={compact ? s.ruleSaveBar : s.ruleSaveDefault}>
        <span>{compact ? "Alterações só entram em vigor após salvar." : ""}</span>
        <button className={ui.workspacePrimary} disabled={busy} type="submit">{busy ? "Salvando…" : "Salvar regras"}</button>
      </div>
      {notice && <p role="status" className={s.ruleNotice}>{notice}</p>}
    </form>
  </section>;
}
