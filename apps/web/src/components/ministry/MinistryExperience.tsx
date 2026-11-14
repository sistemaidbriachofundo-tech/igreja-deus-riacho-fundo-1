"use client";

import { useState, type KeyboardEvent } from "react";
import { RosterActions, RosterEditor, type RosterActionsProps } from "./RosterEditor";
import { MonthlyRosterPreview } from "./MonthlyRosterPreview";
import { RosterModuleCatalog } from "./RosterModuleCatalog";
import { withBasePath } from "../../lib/paths";
import type {
  ConversionResult,
  DeskReady,
  DeskResult,
  FormalRole,
  FinancePanel,
  MembershipChange,
} from "../../lib/ministry-desk";
import type {
  ActivityPanel,
  EscalaPanel,
} from "../../lib/ministry-presentation";
import {
  MINISTRY_TABS,
  activeFormalMembers,
  activityStatusLabel,
  escalaStatusLabel,
  formatChurchWhen,
  ministryHref,
  ministryPanelTitle,
  servingShortcut,
  visibleSchedule,
  type MinistryTabId,
} from "../../lib/ministry-view";
import { MinistryMembershipCatalog } from "../MinistryMembershipCatalog";
import { UIIcon } from "../AppShell";
import { PersonPortrait } from "../PersonPortrait";
import { PageHeader } from "../ui/PageHeader";
import ui from "../ui/ui.module.css";
import styles from "./ministry-home.module.css";

const ministryTabIcons = {
  visao: "home", integrantes: "people", escalas: "calendar", atividades: "activity", recursos: "layers",
} as const;

type Props = {
  token?: string | null;
  roles?: readonly string[];
  desk: DeskResult;
  escalas: EscalaPanel;
  activities: ActivityPanel;
  tab: MinistryTabId;
  escalaId?: string;
  conversion: ConversionResult | null;
  convertingId: string | null;
  change: MembershipChange | null;
  pending: boolean;
  onSelect: (ministryId: string) => void;
  onTab: (tab: MinistryTabId) => void;
  onOpenEscala: (escalaId?: string) => void;
  onConvert: (interestId: string) => void;
  onAdmit: (personId: string, role: FormalRole) => void;
  onEnd: (membershipId: string) => void;
  onRefresh: () => void;
};

export function MinistryExperience(props: Props) {
  const { desk } = props;
  if (desk.kind === "ready") return <ReadyExperience {...props} desk={desk} />;
  return <StatusExperience {...props} />;
}

function StatusExperience({ desk, onSelect, onRefresh }: Props) {
  if (desk.kind === "denied") {
    const title = ministryPanelTitle(desk.ministry);
    return (
      <div className={styles.board} data-screen="ministerios">
        <PageHeader appearance="workspace" heading="h1" title={title} />
        <div className={styles.alert} role="alert" data-status="403">
          <strong>Esta conta não abre este ministério.</strong>
          <p>Integrantes, escalas e atividades ficam ocultos.</p>
        </div>
        <MinistryGrid
          ministries={desk.ministries}
          currentId=""
          onSelect={onSelect}
        />
        <button type="button" className={styles.secondary} onClick={onRefresh}>
          Consultar de novo
        </button>
      </div>
    );
  }

  const message =
    desk.kind === "unauthorized" ||
    desk.kind === "empty" ||
    desk.kind === "error"
      ? desk.message
      : "Não foi possível abrir os ministérios autorizados.";

  return (
    <div className={styles.board} data-screen="ministerios">
      <PageHeader appearance="workspace" heading="h1" title="Ministérios" />
      <div
        className={desk.kind === "empty" ? styles.note : styles.alert}
        role={desk.kind === "empty" ? "status" : "alert"}
      >
        <p>{message}</p>
      </div>
      <button type="button" className={styles.secondary} onClick={onRefresh}>
        Consultar de novo
      </button>
    </div>
  );
}

function ReadyExperience({
  token,
  roles,
  desk,
  escalas,
  activities,
  tab,
  escalaId,
  conversion,
  convertingId,
  change,
  pending,
  onSelect,
  onTab,
  onOpenEscala,
  onConvert,
  onAdmit,
  onEnd,
  onRefresh,
}: Props & { desk: DeskReady }) {
  const title = ministryPanelTitle(desk.ministry);
  const count =
    desk.membership.kind === "ready"
      ? activeFormalMembers(desk.membership.members).length
      : null;
  const schedule = visibleSchedule(desk);
  const leaders = leadershipOf(desk);
  const shortcut = servingShortcut(desk.ministry.slug);

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const current = MINISTRY_TABS.findIndex((item) => item.id === tab);
    if (current < 0) return;
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % MINISTRY_TABS.length;
    else if (event.key === "ArrowLeft")
      next = (current - 1 + MINISTRY_TABS.length) % MINISTRY_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = MINISTRY_TABS.length - 1;
    else return;
    event.preventDefault();
    const id = MINISTRY_TABS[next].id;
    onTab(id);
    document.getElementById(`ministry-tab-${id}`)?.focus();
  }

  return (
    <div className={styles.board} data-screen="ministerios">
      <PageHeader
        appearance="workspace"
        heading="h1"
        title={desk.ministry.name}
        description={desk.ministry.description || undefined}
        actions={
          <label className={styles.ministryPicker}>
            Acessar ministério
            <select
              value={desk.ministry.id}
              onChange={(event) => onSelect(event.target.value)}
            >
              {desk.ministries.map((ministry) => (
                <option key={ministry.id} value={ministry.id}>
                  {ministryPanelTitle(ministry)}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <article
        className={styles.panel}
        data-ministry={desk.ministry.id}
        aria-label={title}
      >
        <div
          className={`${ui.workspaceTabs} ${styles.tabs}`}
          role="tablist"
          aria-label={title}
          onKeyDown={onTabKey}
        >
          {MINISTRY_TABS.map((item) => {
            const selected = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`ministry-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`ministry-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onTab(item.id)}
              >
                <span className={styles.tabIcon}><UIIcon name={ministryTabIcons[item.id]} size={18} /></span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`ministry-panel-${tab}`}
          aria-labelledby={`ministry-tab-${tab}`}
          className={styles.tabPanel}
          tabIndex={0}
        >
          {tab === "visao" ? (
            <section className={styles.overview}>
              <ul className={styles.stats}>
                <li>
                  <span>Integrantes formais</span>
                  <strong>
                    {count === null ? "Indisponível" : String(count)}
                  </strong>
                </li>
                <li>
                  <span>Interesses, sem vínculo</span>
                  <strong>{desk.interests.length}</strong>
                </li>
                <li>
                  <span>Escalas deste ministério</span>
                  <strong>
                    {escalas.kind === "ready"
                      ? String(escalas.items.length)
                      : "—"}
                  </strong>
                </li>
              </ul>
              {desk.finance.kind === "ready" && (
                <MinistryCash finance={desk.finance} />
              )}
              <div className={styles.split}>
                <section>
                  <h2>Liderança</h2>
                  {leaders.length === 0 ? (
                    <p>A liderança formal ainda não foi informada.</p>
                  ) : (
                    <ul className={styles.leaders}>
                      {leaders.map((leader) => (
                        <li key={`${leader.name}:${leader.role}`}>
                          <PersonPortrait name={leader.name} />
                          <span>
                            <strong>{leader.name}</strong>
                            <small>{leader.role}</small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <a
                    className={styles.textLink}
                    href={withBasePath(
                      ministryHref(desk.ministry.id, "integrantes"),
                    )}
                  >
                    Ver equipe completa
                  </a>
                </section>
                <section>
                  <h2>Encontro habitual</h2>
                  <p>
                    {schedule ??
                      "O perfil deste ministério ainda não informa horário."}
                  </p>
                  {desk.ministry.participationInfo ? (
                    <p>{desk.ministry.participationInfo}</p>
                  ) : null}
                </section>
              </div>
              {shortcut && (
                <div className={styles.shortcuts}>
                  <a
                    className={ui.workspaceSecondary}
                    href={withBasePath(shortcut.href)}
                  >
                    {shortcut.label}
                  </a>
                </div>
              )}
            </section>
          ) : null}

          {tab === "integrantes" ? (
            <MinistryMembershipCatalog
              token={token}
              roles={roles}
              desk={desk}
              conversion={conversion}
              convertingId={convertingId}
              change={change}
              pending={pending}
              onConvert={onConvert}
              onAdmit={onAdmit}
              onEnd={onEnd}
            />
          ) : null}

          {tab === "escalas" ? (
            <EscalaList
              key={desk.ministry.id}
              ministryId={desk.ministry.id}
              panel={escalas}
              escalaId={escalaId}
              shortcut={shortcut}
              onOpen={onOpenEscala}
              actions={token ? {
                token,
                ministryId: desk.ministry.id,
                members: desk.membership.kind === "ready" ? activeFormalMembers(desk.membership.members) : [],
                onRefresh,
                onOpen: onOpenEscala,
              } : undefined}
            />
          ) : null}

          {tab === "atividades" ? (
            <ActivityList panel={activities} schedule={schedule} />
          ) : null}

          {tab === "recursos" ? (
            <MinistryCash finance={desk.finance} />
          ) : null}
        </div>
      </article>
    </div>
  );
}

function MinistryGrid({
  ministries,
  currentId,
  onSelect,
}: {
  ministries: DeskReady["ministries"];
  currentId: string;
  onSelect: (ministryId: string) => void;
}) {
  if (ministries.length === 0) return null;
  return (
    <ul className={styles.grid}>
      {ministries.map((ministry) => {
        const current = ministry.id === currentId;
        const title = ministryPanelTitle(ministry);
        return (
          <li key={ministry.id}>
            <a
              href={withBasePath(ministryHref(ministry.id))}
              aria-current={current ? "page" : undefined}
              className={current ? styles.cardCurrent : styles.card}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onSelect(ministry.id);
              }}
            >
              <span className={styles.catalogIcon}><UIIcon name="family" size={19} /></span>
              <strong>{title}</strong>
              <UIIcon name="arrow" size={16} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function leadershipOf(desk: DeskReady): Array<{ name: string; role: string }> {
  if (desk.membership.kind === "ready") {
    const leaders = desk.membership.members.filter(
      (member) => member.status !== "ENCERRADO" && (member.role === "LIDER" || member.role === "COORDENADOR"),
    );
    if (leaders.length) {
      return leaders.map((member) => ({ name: member.displayName, role: member.role === "LIDER" ? "Liderança" : "Coordenação" }));
    }
  }
  return (desk.ministry.leadership ?? []).map((leader) => ({
    name: leader.displayName,
    role: leader.roleTitle,
  }));
}

function EscalaList({
  ministryId,
  panel,
  escalaId,
  shortcut,
  onOpen,
  actions,
}: {
  ministryId: string;
  panel: EscalaPanel;
  escalaId?: string;
  shortcut: { href: string; label: string } | null;
  onOpen: (escalaId?: string) => void;
  actions?: RosterActionsProps;
}) {
  const [moduleFilter, setModuleFilter] = useState("");
  if (
    panel.kind === "hidden" ||
    panel.kind === "denied" ||
    panel.kind === "unavailable"
  ) {
    return (
      <p className={styles.note} role="status">
        {panel.kind === "hidden"
          ? "As escalas deste ministério não foram consultadas."
          : panel.message}
      </p>
    );
  }
  const modules = panel.modules ?? [];
  const selectedModule = modules.find(module => module.id === moduleFilter);
  const items = selectedModule ? panel.items.filter(item => item.moduleId === selectedModule.id) : panel.items;
  const moduleNames = new Map(modules.map(module => [module.id, module.name]));
  const editor = actions && {
    ...actions, modules, moduleId: selectedModule?.id,
    onOpen: (id: string) => { setModuleFilter(""); actions.onOpen(id); },
  };
  return (
    <div className={styles.scheduleList}>
      {(actions || modules.length > 0) && (
        <RosterModuleCatalog actions={actions} modules={modules} selectedId={selectedModule?.id ?? ""} onSelect={setModuleFilter} />
      )}
      {editor && modules.length > 0 && <MonthlyRosterPreview token={editor.token} ministryId={ministryId} onRefresh={editor.onRefresh} />}
      {editor && <RosterEditor key={selectedModule?.id ?? "general"} {...editor} />}
      {shortcut && (
        <div className={styles.shortcuts}>
          <a
            className={ui.workspaceSecondary}
            href={withBasePath(shortcut.href)}
          >
            {shortcut.label}
          </a>
        </div>
      )}
      {items.length === 0 ? (
        <p className={styles.note}>{selectedModule ? "Nenhuma escala neste módulo." : "Nenhuma escala deste ministério."}</p>
      ) : (
        items.map((escala) => {
          const expanded = escala.id === escalaId;
          const detailId = `funcoes-${escala.id}`;
          const nextId = expanded ? undefined : escala.id;
          return (
            <article
              key={escala.id}
              id={`escala-${escala.id}`}
              className={
                expanded
                  ? `${styles.escala} ${styles.escalaCurrent}`
                  : styles.escala
              }
            >
              <header>
                <h2>{escala.title}</h2>
                <span>{escalaStatusLabel(escala.status)}</span>
              </header>
              <p>
                {escala.moduleId && moduleNames.has(escala.moduleId) && `${moduleNames.get(escala.moduleId)} · `}
                {formatChurchWhen(escala.serviceAt)} ·{" "}
                {escala.assignedCount === 1
                  ? "1 pessoa escalada"
                  : `${escala.assignedCount} pessoas escaladas`}
              </p>
              <a
                className={ui.workspaceSecondary}
                href={withBasePath(ministryHref(ministryId, "escalas", nextId))}
                aria-expanded={expanded}
                aria-controls={expanded ? detailId : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onOpen(nextId);
                }}
              >
                {expanded ? "Fechar detalhes" : "Abrir esta escala"}
              </a>
              {expanded && (
                <div className={styles.escalaDetails} id={detailId}>
                  {editor && <RosterActions {...editor} roster={escala} />}
                  {(!actions || !escala.positions?.length) && <h3>Funções na escala</h3>}
                  {(!actions || !escala.positions?.length) && (escala.functions.length ? (
                    <ul>
                      {escala.functions.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Funções ainda não definidas.</p>
                  ))}
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}

function ActivityList({ panel, schedule }: { panel: ActivityPanel; schedule: string | null }) {
  return (
    <div className={styles.stack}>
      <article className={styles.escala}>
        <h2>Encontro habitual</h2>
        <p>{schedule ?? "O perfil deste ministério ainda não informa horário."}</p>
      </article>
      {panel.kind === "ready" ? (
        panel.items.length === 0 ? (
          <p className={styles.note}>Nenhuma atividade publicada só deste ministério.</p>
        ) : (
          panel.items.map((activity) => (
            <article key={activity.id} className={styles.escala}>
              <header>
                <h2>{activity.name}</h2>
                <span>{activityStatusLabel(activity.status)}</span>
              </header>
              <p>{formatChurchWhen(activity.startsAt)}</p>
              {activity.locationText ? <p>{activity.locationText}</p> : null}
            </article>
          ))
        )
      ) : (
        <p className={styles.note} role="status">
          {panel.kind === "hidden" ? "As atividades deste ministério não foram consultadas." : panel.message}
        </p>
      )}
    </div>
  );
}

function MinistryCash({ finance }: { finance: FinancePanel }) {
  const currency = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return (
    <section className={styles.cash} aria-labelledby="caixa-title">
      <h2 id="caixa-title">Caixa do ministério</h2>
      {finance.kind === "ready" ? (
        <ul className={styles.stats}>
          <li>
            <span>Saldo em caixa</span>
            <strong>{currency.format(finance.balanceCents / 100)}</strong>
          </li>
          <li>
            <span>Entradas</span>
            <strong>{currency.format(finance.incomeCents / 100)}</strong>
          </li>
          <li>
            <span>Despesas</span>
            <strong>{currency.format(finance.expenseCents / 100)}</strong>
          </li>
        </ul>
      ) : (
        <p>
          {finance.kind === "denied"
            ? "Seu perfil não tem acesso ao caixa."
            : "Saldo ainda indisponível."}
        </p>
      )}
    </section>
  );
}
