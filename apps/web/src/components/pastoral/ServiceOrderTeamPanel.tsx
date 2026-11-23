"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, ApiRequestError } from "../../lib/api";
import s from "./service-order-team.module.css";

export const OC_TEAM_OPTIONS = [
  { key: "pastor", label: "Pastor", description: "Função pastoral reconhecida no cadastro da igreja" },
  { key: "director", label: "Direção", description: "Condução e direção do culto" },
  { key: "preacher", label: "Pregação", description: "Pregação e ministração da Palavra" },
  { key: "praise", label: "Louvor", description: "Adoração e louvor durante a coleta" },
  { key: "welcome", label: "Acolhimento", description: "Momento de acolher" },
  { key: "media", label: "Mídia", description: "Vídeo prelúdio, IDB News, projeção e transmissão" },
  { key: "generosity", label: "Generosidade", description: "Momento de ofertas e generosidade" },
  { key: "prayer", label: "Oração / Bênção", description: "Oração pelas famílias e bênção apostólica" },
  { key: "instrumental", label: "Instrumental", description: "Instrumental de despedida e backstage" },
] as const;
export type OcRole = (typeof OC_TEAM_OPTIONS)[number]["key"];
type Member = {
  id: string; displayName: string; isMinor: boolean;
  roles: string[]; teamRoles?: OcRole[]; sources: string[];
};
type Directory = { people: Member[]; qualified: number; updatedAt: string | null; notice: string };
function errorMessage(err: unknown) {
  if (err instanceof ApiRequestError) {
    if (err.status === 403) return "Somente a liderança pastoral pode cadastrar funções da OC.";
    if (err.status === 404) return "A API de integrantes da OC ainda não está disponível neste ambiente.";
    if (err.status === 409) return "Outra pessoa atualizou a equipe. Recarregue a lista antes de salvar.";
  }
  return "Não foi possível atualizar o integrante. Confira os dados e tente novamente.";
}
const label = (role: string) => OC_TEAM_OPTIONS.find(item => item.key === role)?.label ?? role;

export function ServiceOrderTeamPanel({ token, canEdit }: { token: string; canEdit: boolean }) {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState("");
  const [roles, setRoles] = useState<OcRole[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const response = await apiGet<Directory>("/service-orders/planning/people", token, { fresh: true });
    setDirectory(response);
    return response;
  }, [token]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void apiGet<Directory>("/service-orders/planning/people", token, { fresh: true })
      .then(result => { if (alive) { setDirectory(result); setError(""); } })
      .catch(err => { if (alive) setError(errorMessage(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  const people = useMemo(() => directory?.people ?? [], [directory]);
  const assigned = useMemo(() => people.filter(p => (p.teamRoles ?? []).length > 0), [people]);
  const filtered = useMemo(() => assigned.filter(p => p.displayName.toLocaleLowerCase("pt-BR")
    .includes(query.trim().toLocaleLowerCase("pt-BR"))), [assigned, query]);
  const selected = people.find(p => p.id === personId) ?? null;

  function edit(person: Member) {
    setPersonId(person.id);
    setRoles([...(person.teamRoles ?? [])]);
    setNotice("");
    setError("");
    document.getElementById("oc-team-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function choose(id: string) {
    const person = people.find(p => p.id === id);
    setPersonId(id);
    setRoles([...(person?.teamRoles ?? [])]);
    setError("");
    setNotice("");
  }
  function toggle(role: OcRole, checked: boolean) {
    setRoles(current => checked ? [...current.filter(k => k !== role), role] : current.filter(k => k !== role));
  }

  async function save(nextRoles: OcRole[]) {
    if (!directory || !selected || !canEdit || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await apiPatch("/service-orders/planning/team/" + encodeURIComponent(selected.id), token, {
        roles: nextRoles, expectedUpdatedAt: directory.updatedAt ?? null,
      });
      await refresh();
      setNotice(nextRoles.length
        ? selected.displayName + " atualizado na equipe da Ordem do Culto."
        : selected.displayName + " retirado da equipe da OC. A membresia permanece intacta.");
      setPersonId(""); setRoles([]);
    } catch (err) {
      setError(errorMessage(err));
      try { await refresh(); } catch { /* mantém o erro original, sem ocultar a falha */ }
    } finally {
      setSaving(false);
    }
  }

  return <section className={s.page} aria-labelledby="oc-integrantes-title">
    <header className={s.hero}>
      <div><span className={s.overline}>EQUIPE DE CELEBRAÇÃO</span>
        <h2 id="oc-integrantes-title">Integrantes da Ordem do Culto</h2>
        <p>Vincule membros ativos às funções do roteiro. A lista de pessoas vem da Secretaria, sem criar cadastros duplicados.</p></div>
      <div className={s.kpi}><strong>{assigned.length}</strong><span>Integrantes habilitados</span></div>
    </header>
    {loading && <p role="status">Consultando integrantes da congregação…</p>}
    {error && <p className={s.error} role="alert">{error}</p>}
    {notice && <p className={s.success} role="status">{notice}</p>}
    {directory && <div className={s.columns}>
      <div className={s.listPanel}>
        <div className={s.panelHeading}><h3>Equipe cadastrada</h3><span>{assigned.length} participantes</span></div>
        <label className={s.search}>Buscar integrante
          <input type="search" placeholder="Digite o nome" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        {assigned.length === 0 && <p className={s.empty}>Ainda não há integrantes definidos para a OC. Selecione uma pessoa e atribua suas funções.</p>}
        {assigned.length > 0 && filtered.length === 0 && <p className={s.empty}>Nenhum integrante corresponde à busca.</p>}
        <ul className={s.list}>{filtered.map(person => <li key={person.id} className={s.member} data-active={personId === person.id}>
          <div className={s.memberInfo}><strong>{person.displayName}</strong>
            <div className={s.tags}>{(person.teamRoles ?? []).map(role =>
              <span key={role} className={s.tag}>{label(role)}</span>)}</div>
          </div>
          {canEdit && <button type="button" className={s.quietButton} onClick={() => edit(person)}>Editar</button>}
        </li>)}</ul>
      </div>
      <div className={s.formPanel} id="oc-team-form">
        <div className={s.panelHeading}><h3>{selected && (selected.teamRoles ?? []).length ? "Editar integrante" : "Adicionar integrante"}</h3>
          {selected && <button type="button" className={s.quietButton} onClick={() => choose("")}>Cancelar</button>}
        </div>
        {!canEdit && <p className={s.explanation}>Consulta disponível. Apenas o pastor com acesso à congregação pode alterar funções.</p>}
        <label className={s.field}>Pessoa cadastrada
          <select disabled={!canEdit || saving} value={personId} onChange={e => choose(e.target.value)}>
            <option value="">Selecione um membro ativo</option>
            {people.map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}
          </select>
        </label>
        {selected && <p className={s.explanation}>Funções marcadas nesta tela são habilitações para a OC, não cargos e nem permissões de acesso. A tag Pastor exige reconhecimento pastoral no cadastro.</p>}
        <fieldset className={s.roles} disabled={!canEdit || !selected || saving}>
          <legend>Funções que pode exercer</legend>
          <div className={s.roleGrid}>{OC_TEAM_OPTIONS.map(role =>
            <label key={role.key} className={s.role} data-checked={roles.includes(role.key)}>
              <input type="checkbox" checked={roles.includes(role.key)}
                onChange={e => toggle(role.key, e.target.checked)} />
              <span><strong>{role.label}</strong><small>{role.description}</small></span>
            </label>)}</div>
        </fieldset>
        {canEdit && <div className={s.actions}>
          <button type="button" className={s.saveButton} disabled={!selected || !roles.length || saving}
            onClick={() => void save(roles)}>{saving ? "Salvando…" : "Salvar integrante"}</button>
          {selected && (selected.teamRoles ?? []).length > 0 &&
            <button type="button" className={s.removeButton} disabled={saving}
              onClick={() => void save([])}>Retirar da equipe</button>}
        </div>}
        <p className={s.explanation}>A geração mensal continua criando rascunhos. O pastor valida os nomes e publica a OC somente após revisão.</p>
      </div>
    </div>}
  </section>;
}
