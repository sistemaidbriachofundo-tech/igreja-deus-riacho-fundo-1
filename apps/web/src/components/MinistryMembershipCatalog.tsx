"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiPatch } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { rosterModuleContains, type EscalaModule } from "../lib/ministry-presentation";
import { WorkspaceSearch } from "./ui/WorkspaceSearch";
import type {
  ConversionResult,
  DeskReady,
  FormalMember,
  FormalRole,
  InterestRow,
  MembershipChange,
} from "../lib/ministry-desk";
import {
  activeFormalMembers,
  humanWriteNotice,
  interestStageLabel,
  memberStatusLabel,
  roleLabel,
  visibleSchedule,
} from "../lib/ministry-view";
import { PersonPortrait } from "./PersonPortrait";
import {
  PersonPicker,
  canSearchPersons,
  type PersonOption,
} from "./PersonPicker";
import { Alert } from "./ui/Alert";
import { MinistryPersonDialog } from "./ministry/MinistryPersonDialog";
import { useActionConfirmation } from "./ui/ActionConfirmation";
import ui from "./ui/ui.module.css";
import styles from "./ministry-membership-catalog.module.css";

type Props = {
  token?: string | null;
  roles?: readonly string[];
  desk: DeskReady;
  conversion: ConversionResult | null;
  convertingId: string | null;
  change: MembershipChange | null;
  pending: boolean;
  onConvert: (interestId: string) => void;
  onAdmit: (personId: string, role: FormalRole) => void;
  onEnd: (membershipId: string) => void;
  rosterModules?: EscalaModule[];
  manageRosterModules?: boolean;
  moduleOnly?: boolean;
  onModulesSaved?: () => void;
};

export function MinistryMembershipCatalog({
  token,
  roles = [],
  desk,
  conversion,
  convertingId,
  change,
  pending,
  onConvert,
  onAdmit,
  onEnd,
  rosterModules,
  manageRosterModules,
  moduleOnly,
  onModulesSaved,
}: Props) {
  const { confirm, confirmation } = useActionConfirmation();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [moduleFilter, setModuleFilter] = useState("");
  const [editingModules, setEditingModules] = useState("");
  const [moduleFeedback, setModuleFeedback] = useState("");
  const [openedPerson, setOpenedPerson] = useState<FormalMember | null>(null);
  const members = desk.membership.kind === "ready"
    ? desk.membership.members.filter(member =>
      !moduleOnly || rosterModules?.some(module => rosterModuleContains(module, member.personId)))
    : [];
  const active = activeFormalMembers(members);
  const schedule = visibleSchedule(desk);
  const canWrite = desk.membership.kind === "ready";
  const normalize = (name: string) =>
    name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("pt-BR");
  const filteredModule = rosterModules?.find(module => module.id === moduleFilter);
  const filtered = members.filter(member =>
    normalize(member.displayName).includes(normalize(query.trim())) &&
    (!filteredModule || rosterModuleContains(filteredModule, member.personId)),
  );
  const pageSize = 12;
  const visiblePage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / pageSize) - 1),
  );
  const firstRow = visiblePage * pageSize;

  async function requestRemoval(member: FormalMember) {
    const accepted = await confirm({
      title: "Retirar integrante da equipe?",
      subject: member.displayName,
      description: "O vínculo com este ministério será encerrado e ficará registrado no histórico.",
      cancel: "Manter na equipe",
      action: "Retirar da equipe",
      tone: "danger",
    });
    if (accepted) onEnd(member.id);
  }

  return (
    <div className={styles.columns}>
      {token && openedPerson && <MinistryPersonDialog key={openedPerson.id} token={token}
        ministryId={desk.ministry.id} member={openedPerson} roles={roles} onClose={() => setOpenedPerson(null)} />}
      <section
        className={styles.panel}
        data-region="formal-members"
        aria-labelledby="formal-members-title"
      >
        <h2 id="formal-members-title">Pessoas da equipe</h2>
        <p>
          {rosterModules?.length ? "Consulte a função e os módulos em que cada integrante serve." :
            "Integrantes cadastrados neste ministério, com sua função e situação atual."}
        </p>
        {schedule ? (
          <p className={styles.schedule}>Encontro habitual: {schedule}</p>
        ) : null}
        {change && (
          <div className={styles.actionFeedback}>
            <Alert
              appearance="workspace"
              tone={change.applied ? "success" : "danger"}
              title={
                change.applied
                  ? "Equipe atualizada"
                  : "Não foi possível atualizar a equipe"
              }
            >
              {change.applied && change.member
                ? change.code === "MINISTRY_MEMBERSHIP_ENDED"
                  ? `A retirada de ${change.member.displayName} foi registrada no histórico.`
                  : `${change.member.displayName} já aparece na lista de integrantes.`
                : humanWriteNotice(change.code, change.applied, change.message)}
            </Alert>
          </div>
        )}
        {canWrite ? (
          <>
            {!moduleOnly && <AdmitForm
              token={token ?? ""}
              roles={roles}
              pending={pending}
              onAdmit={onAdmit}
              options={members
                .filter((member) => member.status === "ENCERRADO")
                .map((member) => ({
                  id: member.personId,
                  displayName: member.displayName,
                }))}
              excludeIds={active.map((member) => member.personId)}
              savedPersonId={
                change?.applied ? change.member?.personId : undefined
              }
            />}
            {moduleFeedback && <p role="status">{moduleFeedback}</p>}
            {rosterModules && rosterModules.length > 0 && <label className={styles.moduleFilter}>
              Módulo da equipe
              <select value={moduleFilter} onChange={event => { setModuleFilter(event.target.value); setPage(0); }}>
                <option value="">Todos os módulos</option>
                {rosterModules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}
              </select>
            </label>}
            {active.length === 0 ? (
              <div className={styles.invite} data-region="invite">
                <strong>
                  Esta equipe ainda não tem integrantes cadastrados
                </strong>
                <p>
                  Adicione alguém já cadastrado ou escolha uma pessoa
                  interessada abaixo.
                </p>
              </div>
            ) : null}
            {members.length > 0 && (
              <WorkspaceSearch className={styles.memberSearch}
                aria-label="Buscar integrante por nome" value={query} placeholder="Buscar integrante por nome"
                onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
            )}
            {filtered.length > 0 ? (
              <div className={styles.people}>
                {filtered.slice(firstRow, firstRow + pageSize).map(member => {
                  const linkedModules = rosterModules?.filter(module => rosterModuleContains(module, member.personId));
                  return (
                  <div className={styles.row} key={member.id}>
                    <PersonPortrait name={member.displayName} />
                    <div>
                      {token ? <button className={styles.personLink} type="button" aria-label={"Abrir ficha de " + member.displayName}
                        onClick={() => setOpenedPerson(member)}>{member.displayName}</button> : <strong>{member.displayName}</strong>}
                      <small>
                        {roleLabel(member.role)} ·{" "}
                        {memberStatusLabel(member.status)}
                      </small>
                      {linkedModules && <small className={styles.memberModules}>
                        {linkedModules.length ? linkedModules.map(module => module.name).join(" · ") : "Módulo a definir"}
                      </small>}
                    </div>
                    <div className={styles.memberActions}>
                    {Boolean(rosterModules?.length) && manageRosterModules && token && member.status === "ATIVO" &&
                      <button type="button" className={ui.workspaceSecondary} aria-expanded={editingModules === member.id}
                        onClick={() => { setModuleFeedback(""); setEditingModules(current => current === member.id ? "" : member.id); }}>
                        Editar módulos <span className={styles.srOnly}>de {member.displayName}</span>
                      </button>}
                    {member.status === "ENCERRADO" ? (
                      <span className={styles.tag}>Encerrado</span>
                    ) : !moduleOnly ? (
                      <button
                        className={styles.endAction}
                        type="button"
                        disabled={pending}
                        onClick={() => void requestRemoval(member)}
                      >
                        Retirar da equipe
                      </button>
                    ) : null}
                    </div>
                    {editingModules === member.id && token && rosterModules && manageRosterModules &&
                      <MemberModuleForm key={member.id} member={member} modules={rosterModules} token={token}
                        ministryId={desk.ministry.id} onSaved={() => {
                          setEditingModules("");
                          setModuleFeedback("Os módulos de " + member.displayName + " foram atualizados.");
                          onModulesSaved?.();
                        }} />}
                  </div>
                ); })}
              </div>
            ) : members.length > 0 ? (
              <p className={styles.emptySearch} role="status">
                Nenhum integrante encontrado. Revise o nome ou o módulo selecionado.
              </p>
            ) : null}
            {filtered.length > pageSize && (
              <nav className={styles.pagination} aria-label="Páginas da equipe">
                <button
                  type="button"
                  className={ui.workspaceSecondary}
                  disabled={visiblePage === 0}
                  onClick={() => setPage(visiblePage - 1)}
                >
                  Anterior
                </button>
                <span>
                  {firstRow + 1}–
                  {Math.min(firstRow + pageSize, filtered.length)} de{" "}
                  {filtered.length}
                </span>
                <button
                  type="button"
                  className={ui.workspaceSecondary}
                  disabled={firstRow + pageSize >= filtered.length}
                  onClick={() => setPage(visiblePage + 1)}
                >
                  Próxima
                </button>
              </nav>
            )}
          </>
        ) : (
          <p className={styles.schedule}>
            Inclusão e remoção permanecem indisponíveis.
          </p>
        )}
      </section>

      {!moduleOnly && <section
        className={styles.panel}
        data-region="volunteer-interests"
        aria-labelledby="interests-title"
      >
        <h2 id="interests-title">Pessoas interessadas</h2>
        <p>{desk.interestsMessage}</p>
        {desk.interests.length === 0 ? (
          <p className={styles.schedule}>Nenhum interesse neste ministério.</p>
        ) : (
          <div className={styles.people}>
            {desk.interests.map((interest) => (
              <InterestLine
                key={interest.id}
                interest={interest}
                busy={convertingId === interest.id}
                canConvert={canWrite}
                onConvert={onConvert}
              />
            ))}
          </div>
        )}
        {conversion && (
          <div className={styles.actionFeedback}>
            <Alert
              appearance="workspace"
              tone={conversion.created ? "success" : "danger"}
              title={
                conversion.created
                  ? "Integrante registrado"
                  : "Não foi possível incluir na equipe"
              }
            >
              {humanWriteNotice(
                conversion.code,
                conversion.created,
                conversion.message,
              )}
            </Alert>
          </div>
        )}
      </section>}
      {confirmation}
    </div>
  );
}

function AdmitForm({
  token,
  roles,
  pending,
  onAdmit,
  options,
  excludeIds,
  savedPersonId,
}: {
  token: string;
  roles: readonly string[];
  pending: boolean;
  onAdmit: (personId: string, role: FormalRole) => void;
  options: readonly PersonOption[];
  excludeIds: readonly string[];
  savedPersonId?: string;
}) {
  const [personId, setPersonId] = useState("");
  const [reference, setReference] = useState("");
  const [manual, setManual] = useState(false);
  const [role, setRole] = useState<FormalRole>("INTEGRANTE");
  const canSearch = canSearchPersons(roles);
  const selectedId = manual ? reference.trim() : personId;

  useEffect(() => {
    if (savedPersonId) {
      setPersonId("");
      setReference("");
    }
  }, [savedPersonId]);

  return (
    <form
      className={styles.admit}
      onSubmit={(event) => {
        event.preventDefault();
        if (selectedId && !pending) onAdmit(selectedId, role);
      }}
    >
      <PersonPicker
        token={token}
        roles={roles}
        label="Pessoa para adicionar à equipe"
        value={personId}
        onChange={setPersonId}
        required
        disabled={pending || manual}
        options={canSearch ? undefined : options}
        excludeIds={excludeIds}
        help={
          canSearch
            ? "Busque alguém já cadastrado na igreja."
            : "Escolha uma pessoa já conhecida neste ministério. Novos interessados aparecem na seção ao lado."
        }
      />
      <label>
        Função na equipe
        <select
          name="role"
          value={role}
          disabled={pending}
          onChange={(event) => setRole(event.target.value as FormalRole)}
        >
          <option value="LIDER">Liderança</option>
          <option value="COORDENADOR">Coordenação</option>
          <option value="INTEGRANTE">Integrante</option>
          <option value="APOIO">Apoio</option>
        </select>
      </label>
      <button type="submit" disabled={pending || !selectedId}>
        {pending ? "Adicionando…" : "Adicionar à equipe"}
      </button>
      {!canSearch && (
        <details
          className={styles.reference}
          onToggle={(event) => setManual(event.currentTarget.open)}
        >
          <summary>Usar referência fornecida pela Secretaria</summary>
          <label>
            Referência do cadastro
            <input
              value={reference}
              disabled={pending}
              onChange={(event) => setReference(event.target.value)}
              autoComplete="off"
            />
          </label>
        </details>
      )}
    </form>
  );
}

function InterestLine({
  interest,
  busy,
  canConvert,
  onConvert,
}: {
  interest: InterestRow;
  busy: boolean;
  canConvert: boolean;
  onConvert: (interestId: string) => void;
}) {
  return (
    <div className={styles.row}>
      <PersonPortrait name={interest.displayName} />
      <div>
        <strong>{interest.displayName}</strong>
        <small>{interestStageLabel(interest.stage)} · não é integrante</small>
      </div>
      <span className={styles.tag}>Interesse</span>
      {canConvert ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onConvert(interest.id)}
        >
          {busy ? "Registrando…" : "Registrar como integrante"}
        </button>
      ) : null}
    </div>
  );
}

function MemberModuleForm({ member, modules, token, ministryId, onSaved }: {
  member: FormalMember;
  modules: EscalaModule[];
  token: string;
  ministryId: string;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const initial = modules.filter(module => rosterModuleContains(module, member.personId));
  const initialIds = new Set(initial.map(module => module.id));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const selected = new Set(new FormData(event.currentTarget).getAll("moduleId"));
    const addModuleIds = modules.filter(module => selected.has(module.id) && !initialIds.has(module.id)).map(module => module.id);
    const removeModuleIds = initial.filter(module => !selected.has(module.id)).map(module => module.id);
    if (!addModuleIds.length && !removeModuleIds.length) { onSaved(); return; }
    setSaving(true);
    setError("");
    try {
      await apiPatch(`/ministries/${encodeURIComponent(ministryId)}/memberships/${encodeURIComponent(member.id)}/roster-modules`,
        token, { addModuleIds, removeModuleIds });
      onSaved();
    } catch (failure) {
      setError(dasError(failure));
    } finally {
      setSaving(false);
    }
  }

  return <form className={styles.moduleForm} onSubmit={save}>
    <fieldset disabled={saving}>
      <legend>Módulos de {member.displayName}</legend>
      {modules.map(module => <label key={module.id}>
        <input type="checkbox" name="moduleId" value={module.id} defaultChecked={initialIds.has(module.id)} />
        {module.name}
      </label>)}
      <button type="submit" className={ui.workspacePrimary}>{saving ? "Salvando…" : "Salvar módulos"}</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </form>;
}
