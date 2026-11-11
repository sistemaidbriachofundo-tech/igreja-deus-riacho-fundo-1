"use client";

import type { KeyboardEvent } from "react";
import { withBasePath } from "../../lib/paths";
import type {
  ConversionResult,
  DeskReady,
  DeskResult,
  FormalRole,
  FinancePanel,
  MembershipChange,
} from "../../lib/ministry-desk";
import type { ActivityPanel, EscalaPanel } from "../../lib/ministry-presentation";
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
import { MinistryCover } from "./ministry-visuals";
import { PersonPortrait } from "../PersonPortrait";
import styles from "./ministry-home.module.css";

type Props = {
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
  onOpenEscala: (escalaId: string) => void;
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
        <p className={styles.kicker}>Ministérios</p>
        <h1>{title}</h1>
        <div className={styles.alert} role="alert" data-status="403">
          <strong>Esta conta não abre este ministério.</strong>
          <p>Integrantes, escalas e atividades ficam ocultos.</p>
        </div>
        <MinistryGrid ministries={desk.ministries} currentId="" onSelect={onSelect} />
        <button type="button" className={styles.secondary} onClick={onRefresh}>
          Consultar de novo
        </button>
      </div>
    );
  }

  const message =
    desk.kind === "unauthorized" || desk.kind === "empty" || desk.kind === "error"
      ? desk.message
      : "Não foi possível abrir os ministérios autorizados.";

  return (
    <div className={styles.board} data-screen="ministerios">
      <p className={styles.kicker}>Ministérios</p>
      <h1>Ministérios</h1>
      <div className={desk.kind === "empty" ? styles.note : styles.alert} role={desk.kind === "empty" ? "status" : "alert"}>
        <p>{message}</p>
      </div>
      <button type="button" className={styles.secondary} onClick={onRefresh}>
        Consultar de novo
      </button>
    </div>
  );
}

function ReadyExperience({
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
}: Props & { desk: DeskReady }) {
  const title = ministryPanelTitle(desk.ministry);
  const count =
    desk.membership.kind === "ready" ? activeFormalMembers(desk.membership.members).length : null;
  const schedule = visibleSchedule(desk);
  const leaders = leadershipOf(desk);
  const shortcut = servingShortcut(desk.ministry.slug);

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const current = MINISTRY_TABS.findIndex((item) => item.id === tab);
    if (current < 0) return;
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % MINISTRY_TABS.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + MINISTRY_TABS.length) % MINISTRY_TABS.length;
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
      <header className={styles.sectionIntro}>
        <div>
          <p className={styles.kicker}>GESTÃO MINISTERIAL</p>
          <h1>Ministérios</h1>
          <p>Equipes, escalas e atividades organizadas por ministério.</p>
        </div>
        <label className={styles.ministryPicker}>
          Acessar ministério
          <select value={desk.ministry.id} onChange={(event) => onSelect(event.target.value)}>
            {desk.ministries.map((ministry) => (
              <option key={ministry.id} value={ministry.id}>{ministryPanelTitle(ministry)}</option>
            ))}
          </select>
        </label>
      </header>
      <article className={styles.panel} data-ministry={desk.ministry.id} aria-labelledby="ministry-panel-title">
        <header className={styles.ministryHero}>
          <MinistryCover className={styles.hero} name={desk.ministry.name} slug={desk.ministry.slug} />
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <span>MINISTÉRIO SELECIONADO</span>
            <h2 id="ministry-panel-title">{title}</h2>
            {title !== desk.ministry.name ? <p className={styles.official}>{desk.ministry.name}</p> : null}
            {desk.ministry.description ? <p>{desk.ministry.description}</p> : <p>Gestão da equipe e acompanhamento do ministério.</p>}
          </div>
          <span className={styles.heroCount}>{count === null ? "Equipe" : `${count} ${count === 1 ? "integrante" : "integrantes"}`}</span>
        </header>

        <div className={styles.tabs} role="tablist" aria-label={title} onKeyDown={onTabKey}>
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
                className={selected ? styles.tabActive : styles.tab}
                onClick={() => onTab(item.id)}
              >
                {item.label}
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
                  <strong>{count === null ? "Indisponível" : String(count)}</strong>
                </li>
                <li>
                  <span>Interesses, sem vínculo</span>
                  <strong>{desk.interests.length}</strong>
                </li>
                <li>
                  <span>Escalas deste ministério</span>
                  <strong>{escalas.kind === "ready" ? String(escalas.items.length) : "—"}</strong>
                </li>
              </ul>
              {desk.finance.kind === "ready" && <MinistryCash finance={desk.finance} />}
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
                </section>
                <section>
                  <h2>Encontro habitual</h2>
                  <p>{schedule ?? "O perfil deste ministério ainda não informa horário."}</p>
                  {desk.ministry.participationInfo ? <p>{desk.ministry.participationInfo}</p> : null}
                </section>
              </div>
              <div className={styles.shortcuts}>
                <a href={withBasePath(ministryHref(desk.ministry.id, "integrantes"))}>Ver integrantes</a>
                <a href={withBasePath(ministryHref(desk.ministry.id, "escalas"))}>Ver escalas</a>
                {shortcut ? <a href={withBasePath(shortcut.href)}>{shortcut.label}</a> : null}
              </div>
            </section>
          ) : null}

          {tab === "integrantes" ? (
            <MinistryMembershipCatalog
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
              ministryId={desk.ministry.id}
              panel={escalas}
              escalaId={escalaId}
              shortcut={shortcut}
              onOpen={onOpenEscala}
            />
          ) : null}

          {tab === "atividades" ? <ActivityList panel={activities} schedule={schedule} /> : null}

          {tab === "recursos" ? (
            <ResourceList ministryId={desk.ministry.id} shortcut={shortcut} finance={desk.finance} />
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
                event.preventDefault();
                onSelect(ministry.id);
              }}
            >
              <MinistryCover className={styles.cover} name={ministry.name} slug={ministry.slug} />
              <strong>{title}</strong>
              {title !== ministry.name ? <small>{ministry.name}</small> : <small>Equipe autorizada</small>}
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
}: {
  ministryId: string;
  panel: EscalaPanel;
  escalaId?: string;
  shortcut: { href: string; label: string } | null;
  onOpen: (escalaId: string) => void;
}) {
  if (panel.kind === "hidden" || panel.kind === "denied" || panel.kind === "unavailable") {
    return (
      <p className={styles.note} role="status">
        {panel.kind === "hidden" ? "As escalas deste ministério não foram consultadas." : panel.message}
      </p>
    );
  }
  return (
    <div className={styles.stack}>
      <div className={styles.shortcuts}>
        {shortcut ? <a href={withBasePath(shortcut.href)}>{shortcut.label}</a> : null}
      </div>
      {panel.items.length === 0 ? (
        <p className={styles.note}>Nenhuma escala deste ministério.</p>
      ) : (
        panel.items.map((escala) => (
          <article
            key={escala.id}
            id={`escala-${escala.id}`}
            className={escala.id === escalaId ? `${styles.escala} ${styles.escalaCurrent}` : styles.escala}
          >
            <header>
              <h2>{escala.title}</h2>
              <span>{escalaStatusLabel(escala.status)}</span>
            </header>
            <p>{formatChurchWhen(escala.serviceAt)}</p>
            <p>
              {escala.functions.length
                ? escala.functions.join(", ")
                : "Funções ainda não definidas"}
              {" · "}
              {escala.assignedCount === 1 ? "1 pessoa escalada" : `${escala.assignedCount} pessoas escaladas`}
            </p>
            <a
              href={withBasePath(ministryHref(ministryId, "escalas", escala.id))}
              onClick={(event) => {
                event.preventDefault();
                onOpen(escala.id);
              }}
            >
              Abrir esta escala
            </a>
          </article>
        ))
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
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <section className={styles.note} aria-labelledby="caixa-title">
      <h2 id="caixa-title">Caixa do ministério</h2>
      {finance.kind === "ready" ? (
        <ul className={styles.stats}>
          <li><span>Saldo em caixa</span><strong>{currency.format(finance.balanceCents / 100)}</strong></li>
          <li><span>Entradas</span><strong>{currency.format(finance.incomeCents / 100)}</strong></li>
          <li><span>Despesas</span><strong>{currency.format(finance.expenseCents / 100)}</strong></li>
        </ul>
      ) : <p>{finance.kind === "denied" ? "Seu perfil não tem acesso ao caixa." : "Saldo ainda indisponível."}</p>}
    </section>
  );
}

function ResourceList({
  ministryId,
  shortcut,
  finance,
}: {
  ministryId: string;
  shortcut: { href: string; label: string } | null;
  finance: FinancePanel;
}) {
  return (
    <div className={styles.stack}>
      <section className={styles.escala}>
        <h2>O que esta conta pode abrir</h2>
        <div className={styles.shortcuts}>
          <a href={withBasePath(ministryHref(ministryId, "integrantes"))}>Integrantes</a>
          <a href={withBasePath(ministryHref(ministryId, "escalas"))}>Escalas</a>
          {shortcut ? <a href={withBasePath(shortcut.href)}>{shortcut.label}</a> : null}
        </div>
      </section>
      <MinistryCash finance={finance} />
    </div>
  );
}
