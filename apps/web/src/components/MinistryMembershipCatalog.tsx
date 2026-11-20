"use client";

import { useEffect, useState, type FormEvent } from "react";
import { sortByName } from "@idbrf/shared";
import { apiGet, apiPatch } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { rosterModuleContains, type EscalaModule, type MinistryEscala } from "../lib/ministry-presentation";
import { pendingTeamInvitations, rosterInvitePath, rosterRouteUnavailable, type TeamInvitation } from "../lib/roster-invitations";
import { RosterTeamInvitationForm } from "./ministry/RosterTeamInvitationForm";
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
import { VocalProfile } from "./serving/VocalProfile";
import { SERVING_SURFACES } from "../lib/serving-rosters";
import { MinistryPersonDialog } from "./ministry/MinistryPersonDialog";
import { useActionConfirmation } from "./ui/ActionConfirmation";
import ui from "./ui/ui.module.css";
import styles from "./ministry-membership-catalog.module.css";

const memberRosterDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

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
  rosterItems?: readonly MinistryEscala[];
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
  rosterItems,
  manageRosterModules,
  moduleOnly,
  onModulesSaved,
}: Props) {
  const { confirm, confirmation } = useActionConfirmation();
  const [statusFilter, setStatusFilter] = useState("");
  const [inviting, setInviting] = useState(false);
  const [showAdmit, setShowAdmit] = useState(false);
  const [invitationRevision, setInvitationRevision] = useState(0);
  const [invitationLoad, setInvitationLoad] = useState<{ kind: "ready"; invites: TeamInvitation[] } | { kind: "unavailable" } | { kind: "error"; message: string }>();
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
  const moduleMode = rosterModules !== undefined;
  const canListInvitations = Boolean(token && moduleMode && canWrite);
  const ministryId = desk.ministry.id;
  const louvor = SERVING_SURFACES.louvor.slugs.some(slug => slug === desk.ministry.slug);
  useEffect(() => {
    if (!token || !canListInvitations) return;
    let current = true;
    void apiGet<{ invitations: TeamInvitation[] }>(rosterInvitePath(ministryId), token).then(result => {
      const invites = pendingTeamInvitations(result);
      if (current) setInvitationLoad({ kind: "ready", invites });
    }).catch(failure => {
      if (!current) return;
      setInvitationLoad(rosterRouteUnavailable(failure) ? { kind: "unavailable" } : { kind: "error", message: dasError(failure) });
    });
    return () => { current = false; };
  }, [canListInvitations, invitationRevision, ministryId, token]);

  const moduleMap = new Map(rosterModules?.map(module => [module.id, module]));
  const search = normalize(query.trim());
  const visibleInvites = invitationLoad?.kind === "ready" ? invitationLoad.invites.filter(invitation =>
    moduleMap.has(invitation.moduleId) && (!filteredModule || filteredModule.id === invitation.moduleId)
  ) : [];
  const entries = sortByName([
    ...members.filter(member => statusFilter !== "INVITE" && (!statusFilter || member.status === statusFilter) &&
      (!filteredModule || rosterModuleContains(filteredModule, member.personId)))
      .map(member => ({ kind: "member" as const, name: member.displayName, member })),
    ...(!statusFilter || statusFilter === "INVITE" ? visibleInvites.map(invite => ({
      kind: "invite" as const, name: invite.personName, invite,
    })) : []),
  ].filter(item => normalize(item.name).includes(search)), item => item.name);
  const nextRosters = new Map<string, number>();
  const now = Date.now();
  for (const roster of rosterItems ?? []) {
    const service = Date.parse(roster.serviceAt);
    if (roster.status !== "PUBLISHED" || service < now || (filteredModule && roster.moduleId !== filteredModule.id)) continue;
    for (const slot of roster.positions ?? []) for (const assignment of slot.assignments) {
      if (assignment.status !== "PENDING" && assignment.status !== "CONFIRMED") continue;
      for (const id of [assignment.personId, assignment.partnerPersonId]) {
        if (id && service < (nextRosters.get(id) ?? Infinity)) nextRosters.set(id, service);
      }
    }
  }
  const filtered = entries;
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
    <div className={moduleMode ? styles.moduleWorkspace : styles.columns}>
      {moduleMode && <header className={styles.teamHero}>
        <div><p>Ministérios / {desk.ministry.name}</p><h2>Integrantes</h2></div>
        {canWrite && <div>
          {!moduleOnly && <button type="button" className={ui.workspaceSecondary} aria-expanded={showAdmit}
            onClick={() => setShowAdmit(value => !value)}>Vincular pessoa</button>}
          {token && Boolean(rosterModules?.length) && manageRosterModules && <button type="button" className={styles.invitePrimary}
            onClick={() => setInviting(true)}>Convidar voluntário</button>}
        </div>}
      </header>}
      {token && inviting && rosterModules && <RosterTeamInvitationForm token={token} roles={roles} ministryId={ministryId}
        modules={rosterModules} initialModuleId={filteredModule?.id}
        onClose={() => setInviting(false)} onSent={() => {
          setInviting(false);
          setModuleFeedback("Convite enviado. Acompanhe a resposta na lista de integrantes.");
          setInvitationRevision(value => value + 1);
        }} />}
      {token && openedPerson && <MinistryPersonDialog key={openedPerson.id} token={token}
        ministryId={desk.ministry.id} member={openedPerson} roles={roles} onClose={() => setOpenedPerson(null)} />}
      <section
        className={styles.panel}
        data-region="formal-members"
        aria-labelledby="formal-members-title"
      >
        <h2 id="formal-members-title">{moduleMode ? "Pessoas do ministério" : "Pessoas da equipe"}</h2>
        {!moduleMode && <p>Integrantes cadastrados neste ministério, com sua função e situação atual.</p>}
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
            {!moduleOnly && (!moduleMode || showAdmit) && <AdmitForm
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
            {rosterModules && rosterModules.length > 0 && <div className={styles.teamFilters} role="group" aria-label="Equipes">
              {(!moduleOnly || rosterModules.length > 1) && <button type="button" aria-pressed={!filteredModule}
                onClick={() => { setModuleFilter(""); setPage(0); }}>Todas as equipes <span>{active.length}</span></button>}
              {rosterModules.map(module => <button type="button" key={module.id}
                aria-pressed={filteredModule?.id === module.id || (moduleOnly && rosterModules.length === 1)}
                onClick={() => { setModuleFilter(module.id); setPage(0); }}>
                {module.name} <span>{active.filter(member => rosterModuleContains(module, member.personId)).length}</span>
              </button>)}
            </div>}
            {invitationLoad?.kind === "error" && <p role="status">Convites da equipe: {invitationLoad.message}</p>}
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
            {(members.length > 0 || visibleInvites.length > 0) && (
              <div className={styles.teamSearch}>
              <WorkspaceSearch className={styles.memberSearch}
                aria-label="Buscar integrante por nome" value={query} placeholder="Buscar integrante por nome"
                onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
              {moduleMode && <label>Situação<select value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(0); }}>
                <option value="">Todas as situações</option><option value="ATIVO">Ativo</option>
                <option value="INVITE">Convite pendente</option><option value="PAUSADO">Pausado</option><option value="ENCERRADO">Encerrado</option>
              </select></label>}
              </div>
            )}
            {filtered.length > 0 ? (
              <div className={styles.people}>
                {filtered.slice(firstRow, firstRow + pageSize).map(entry => {
                  if (entry.kind === "invite") return <div className={styles.row} key={"invite:" + entry.invite.id}>
                    <PersonPortrait name={entry.name} />
                    <div><strong>{entry.name}</strong><small>{moduleMap.get(entry.invite.moduleId)?.name}</small></div>
                    <span className={styles.pendingInvite}>Convite pendente</span>
                  </div>;
                  const member = entry.member;
                  const nextRoster = nextRosters.get(member.personId);
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
                      {nextRoster !== undefined && <small>Próxima escala · {memberRosterDate.format(nextRoster)}</small>}
                      {linkedModules && <small className={styles.memberModules}>
                        {linkedModules.length ? linkedModules.map(module => module.name).join(" · ") : "Módulo a definir"}
                      </small>}
                    </div>
                    <div className={styles.memberActions}>
                    {louvor && canWrite && token && member.status === "ATIVO" &&
                      <VocalProfile token={token} personId={member.personId} name={member.displayName} />}
                    {Boolean(rosterModules?.length) && manageRosterModules && token && member.status === "ATIVO" &&
                      <button type="button" className={ui.workspaceSecondary} aria-expanded={editingModules === member.id}
                        onClick={() => { setModuleFeedback(""); setEditingModules(current => current === member.id ? "" : member.id); }}>
                        Gerenciar módulos <span className={styles.srOnly}>de {member.displayName}</span>
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
