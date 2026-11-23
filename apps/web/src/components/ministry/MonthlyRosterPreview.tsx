"use client";

import { useState, type FormEvent } from "react";
import { ApiRequestError, apiPost } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { type EscalaModule } from "../../lib/ministry-presentation";
import {
  monthlyChoiceKey, monthlyDecisions, monthlySlotChoice, monthlyVacancyMessage, nextRosterMonth,
  MONTHLY_CAPACITY_MAX, rosterEditable, saveRosterMonth, simulateRosterMonth,
  type MonthlyDraftChoice, type MonthlyPosition, type MonthlyPreview, type MonthlyRoster,
} from "../../lib/monthly-roster-simulation";
import { churchDayKey } from "../../lib/serving-rosters";
import { UIIcon } from "../ui/UIIcon";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import s from "./monthly-roster-simulation.module.css";

type Props = { token: string; ministryId: string; modules: readonly EscalaModule[]; louvor?: boolean; initialModuleId?: string; initialMonth?: string; onRefresh: () => void; onClose: () => void };
type Session = { preview: MonthlyPreview; moduleId?: string };
const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
const dateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
const clock = new Intl.DateTimeFormat("pt-BR", { hour: "numeric", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function MonthlyRosterPreview({ token, ministryId, modules, louvor, initialModuleId, initialMonth, onRefresh, onClose }: Props) {
  const [session, setSession] = useState<Session>();
  const [edits, setEdits] = useState<Record<string, MonthlyDraftChoice>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [recalculatedEdits, setRecalculatedEdits] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [busy, setBusy] = useState<"generating" | "recalculating" | "saving" | "legacy" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const { confirm, confirmation } = useActionConfirmation();
  const preview = session?.preview;
  const revision = preview?.revision;
  const scope = modules.find(item => item.id === session?.moduleId);
  const rosters = (preview?.rosters ?? []).filter(roster => {
    if (roster.status === "MISSING" && roster.positions.length === 0) return false;
    return !scope || (roster.moduleId ? roster.moduleId === scope.id : roster.moduleName === scope.name);
  }).sort((a, b) => a.serviceAt.localeCompare(b.serviceAt));
  const positions = rosters.filter(rosterEditable).flatMap(roster => roster.positions.filter(position => !position.readOnly));
  const choices = positions.map(position => monthlySlotChoice(position, edits));
  const open = choices.filter(choice => !choice.choice).length;
  const locked = choices.filter(choice => choice.locked).length;
  const waitingForAvailability = open === positions.length &&
    positions.some(position => position.reasons?.includes("MONTHLY_UNANSWERED"));
  const groups = rosters.filter(rosterEditable).flatMap(roster => (roster.capacity ?? []).map(group => {
    const value = quantities[capacityKey(roster.id, group.id)];
    const count = value === undefined ? group.count : value.trim() === "" ? NaN : Number(value);
    return { rosterId: roster.id, groupId: group.id, count, valid: Number.isInteger(count) && count >= group.minimumCount && count <= MONTHLY_CAPACITY_MAX };
  }));
  const invalidQuantity = groups.some(group => !group.valid);
  const capacities = groups.map(({ rosterId, groupId, count }) => ({ rosterId, groupId, count }));
  const hasQuantityChanges = Object.keys(quantities).length > 0;
  const dirty = Object.keys(edits).length > 0 || hasQuantityChanges || recalculatedEdits;

  function resetEdits() {
    setEdits({});
    setQuantities({});
    setStale(false);
  }

  async function allowDiscard() {
    return !dirty || confirm({
      title: "Descartar os ajustes desta simulação?",
      description: "Os nomes e as quantidades alterados nesta tela serão descartados.",
      action: "Descartar ajustes",
      cancel: "Continuar editando",
      tone: "danger",
    });
  }

  function start(kind: NonNullable<typeof busy>) {
    setBusy(kind);
    setNotice("");
    setError("");
  }

  function report(failure: unknown) {
    setStale(failure instanceof ApiRequestError && failure.status === 409);
    setError(failure instanceof ApiRequestError && failure.status === 409
      ? "A escala mudou desde que você abriu a simulação. Atualize a prévia para revisar os conflitos."
      : dasError(failure));
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const month = String(data.get("month"));
    const moduleId = String(data.get("moduleId") ?? "") || undefined;
    if (!(await allowDiscard())) return;
    start("generating");
    try {
      // O primeiro sorteio cria apenas a equipe genérica a partir dos membros ativos.
      // Não distribui funções instrumentais específicas sem habilitação documentada.
      if (louvor && !modules.length) {
        const prepared = await apiPost<{ created: boolean; people: number }>(
          `/rosters/by-ministry/${encodeURIComponent(ministryId)}/prepare-louvor`, token, {});
        if (prepared.created) {
          setNotice(`Equipe inicial criada com ${prepared.people} integrantes. As funções instrumentais podem ser personalizadas em Módulos e regras.`);
        }
        onRefresh();
      }
      const result = await simulateRosterMonth(ministryId, token, { month, moduleId }, false);
      setSession({ preview: result, moduleId });
      setOnlyOpen(false);
      setRecalculatedEdits(false);
      resetEdits();
    } catch (failure) { report(failure); }
    finally { setBusy(null); }
  }

  async function recalculate(refresh = false) {
    if (busy || !session || !revision || (invalidQuantity && !refresh)) return;
    start("recalculating");
    try {
      const decisions = monthlyDecisions({ ...session.preview, rosters }, edits);
      const result = await simulateRosterMonth(ministryId, token, {
        month: session.preview.month, moduleId: session.moduleId,
        ...(!refresh ? { revision, fillOnlyOpen: true, capacities } : {}),
        decisions: refresh ? decisions.filter(item => item.locked) : decisions,
      });
      setSession({ ...session, preview: result });
      setRecalculatedEdits(dirty);
      resetEdits();
      setNotice(refresh ? "Simulação atualizada. Confira as vagas antes de salvar." : "Vagas recalculadas. Confira o resultado abaixo.");
    } catch (failure) { report(failure); }
    finally { setBusy(null); }
  }

  async function save() {
    if (busy || !session || !revision || stale || hasQuantityChanges) return;
    if (!(await confirm({
      title: "Salvar a escala do mês como rascunho?",
      subject: monthLabel.format(new Date(session.preview.month + "-15T12:00:00Z")),
      description: open ? `Restam ${open} ${open === 1 ? "vaga aberta" : "vagas abertas"} para revisar. Os avisos são enviados na publicação.`
        : "A equipe de liderança poderá revisar a escala antes de publicar.",
      action: "Salvar rascunho",
      cancel: "Voltar à simulação",
    }))) return;
    start("saving");
    try {
      const result = await saveRosterMonth(ministryId, token, {
        month: session.preview.month, moduleId: session.moduleId, revision,
        decisions: monthlyDecisions({ ...session.preview, rosters }, edits), capacities,
      });
      setNotice(`Rascunho salvo. ${result.savedRosters === 1 ? "1 escala gravada" : `${result.savedRosters} escalas gravadas`}.`);
      setSession(undefined);
      setRecalculatedEdits(false);
      resetEdits();
      onRefresh();
    } catch (failure) { report(failure); }
    finally { setBusy(null); }
  }

  async function applyLegacy(position: MonthlyPosition) {
    if (busy || !position.personId) return;
    start("legacy");
    try {
      await apiPost(`/rosters/slots/${encodeURIComponent(position.slotId)}/assign`, token, {
        personId: position.personId, fromMonthlyPreview: true,
        ...(position.partnerPersonId ? { partnerPersonId: position.partnerPersonId } : {}),
      });
      setSession(current => current && { ...current, preview: { ...current.preview,
        rosters: current.preview.rosters.map(roster => ({ ...roster,
          positions: roster.positions.filter(item => item.slotId !== position.slotId),
        })),
      } });
      setNotice("Sugestão salva no rascunho.");
      onRefresh();
    } catch (failure) { report(failure); }
    finally { setBusy(null); }
  }

  const days = new Map<string, MonthlyRoster[]>();
  for (const roster of rosters) {
    if (onlyOpen && !roster.positions.some(position => rosterEditable(roster) && !position.readOnly && !monthlySlotChoice(position, edits).choice)) continue;
    const day = churchDayKey(roster.serviceAt);
    const records = days.get(day) ?? [];
    records.push(roster);
    days.set(day, records);
  }

  return <section aria-label="Simulação mensal" className={s.workspace}>
    {confirmation}
    <header className={s.header}>
      <div><h2>Revisar escala do mês</h2><p>Revise os cultos e as equipes antes de salvar o rascunho.</p></div>
      <button type="button" className={s.secondary} disabled={Boolean(busy)}
        onClick={() => void allowDiscard().then(accepted => { if (accepted) onClose(); })}>Voltar à agenda</button>
    </header>
    <form className={s.filters} onSubmit={generate}>
      <label>Mês da escala <input name="month" type="month" defaultValue={initialMonth ?? nextRosterMonth()} required disabled={Boolean(busy)} /></label>
      {modules.length > 0 && <label>Equipe
        <select name="moduleId" defaultValue={initialModuleId ?? (modules.length === 1 ? modules[0].id : "")} disabled={Boolean(busy)}>
          {modules.length > 1 && <option value="">Todas as equipes autorizadas</option>}
          {modules.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      <button type="submit" className={s.primary} disabled={Boolean(busy)}>
        <UIIcon name="spark" size={18} /> {busy === "generating" ? "Sorteando cultos…" : louvor ? "Sortear o mês inteiro" : "Gerar simulação"}
      </button>
    </form>
    {error && <p role="alert" className={s.error}>{error}</p>}
    {notice && <p role="status" className={s.notice}>{notice}</p>}
    {preview && <>
      <header className={s.results}>
        <h3>{monthLabel.format(new Date(preview.month + "-15T12:00:00Z"))}{scope && ` · ${scope.name}`}</h3>
        <dl className={s.metrics}>
          <div><dt>Escalas</dt><dd>{rosters.length}</dd></div>
          <div><dt>Vagas preenchidas</dt><dd>{positions.length - open}</dd></div>
          <div data-tone={open ? "pending" : "ready"}><dt>Vagas abertas</dt><dd>{open}</dd></div>
          {revision && <div><dt>Fixadas</dt><dd>{locked}</dd></div>}
        </dl>
        {preview.responses !== undefined && preview.members !== undefined &&
          <p>{preview.responses} de {preview.members} integrantes responderam à pesquisa.</p>}
        {waitingForAvailability && <p role="status" className={s.availability}>
          Faltam respostas de disponibilidade do mês para sugerir nomes. Confira a pesquisa mensal e gere a simulação novamente.
        </p>}
        {!revision && <p role="status" className={s.compatibility}>Esta API oferece a prévia das escalas existentes. O salvamento do mês e a edição na simulação dependem da atualização do servidor.</p>}
      </header>
      {(rosters.length > 0 || onlyOpen) && <label className={s.checkbox}>
        <input type="checkbox" checked={onlyOpen} onChange={event => setOnlyOpen(event.target.checked)} /> Mostrar só escalas com vagas abertas
      </label>}
      {days.size === 0 && <p className={s.empty}>{onlyOpen ? "Nenhuma escala com vaga aberta." : "Nenhuma escala encontrada para este mês."}</p>}
      <div className={s.days}>
        {[...days].map(([day, records]) => <section className={s.day} key={day}>
          <h3><time dateTime={day}>{dateLabel.format(new Date(day + "T12:00:00Z"))}</time></h3>
          <div className={s.rosters}>{records.map(roster => {
            const editable = rosterEditable(roster);
            return <article key={roster.id} className={s.roster}>
              <header className={s.rosterHeader}>
                <div>
                  <p><time dateTime={roster.serviceAt}>{clock.format(new Date(roster.serviceAt)).replace(":00", "h").replace(":", "h")}</time>{roster.moduleName && ` · ${roster.moduleName}`}</p>
                  <h4>{roster.title}</h4>
                </div>
                {!editable && <span className={s.badge}>{roster.status === "PUBLISHED" ? "Publicada" :
                  roster.status === "CANCELLED" || roster.status === "CANCELED" ? "Cancelada" : "Somente leitura"}</span>}
              </header>
              {revision && editable && Boolean(roster.capacity?.length) && <details className={s.capacity}>
                <summary>Ajustar quantidade neste culto</summary>
                <div>{roster.capacity?.map(group => {
                  const key = capacityKey(roster.id, group.id);
                  return <label key={key}>{group.label}
                    <input type="number" min={group.minimumCount} max={MONTHLY_CAPACITY_MAX} step={1}
                      value={quantities[key] ?? group.count} disabled={Boolean(busy)}
                      onChange={event => {
                        const value = event.target.value;
                        setQuantities(current => {
                          const updated = { ...current };
                          if (value === String(group.count)) delete updated[key];
                          else updated[key] = value;
                          return updated;
                        });
                      }} />
                  </label>;
                })}</div>
              </details>}
              {roster.positions.length > 0 ? <ul className={s.positions}>{roster.positions.map(position =>
                <PositionRow key={position.slotId} position={position} value={monthlySlotChoice(position, edits)}
                  editable={Boolean(revision) && editable && !position.readOnly} busy={Boolean(busy)}
                  onChange={value => setEdits(current => ({ ...current, [position.slotId]: value }))}
                  legacyApply={!revision && editable && !position.readOnly ? () => void applyLegacy(position) : undefined} />,
              )}</ul> : <p className={s.noPositions}>{editable ? "Nenhuma vaga para preencher neste culto." : "Este culto foi preservado."}</p>}
            </article>;
          })}</div>
        </section>)}
      </div>
      {revision && rosters.some(rosterEditable) && <div className={s.actions} aria-label="Ações da simulação">
        {hasQuantityChanges && <p>{invalidQuantity ? "Confira as quantidades de vagas antes de recalcular."
          : "Recalcule para aplicar as novas quantidades antes de salvar."}</p>}
        <button type="button" className={s.secondary} disabled={Boolean(busy) || (invalidQuantity && !stale)} onClick={() => void recalculate(stale)}>
          {busy === "recalculating" ? "Recalculando…" : stale ? "Atualizar simulação" : "Recalcular vagas abertas"}
        </button>
        <button type="button" className={s.primary} disabled={Boolean(busy) || stale || hasQuantityChanges}
          onClick={() => void save()}>{busy === "saving" ? "Salvando…" : "Salvar mês como rascunho"}</button>
      </div>}
    </>}
  </section>;
}

function capacityKey(rosterId: string, groupId: string) {
  return JSON.stringify([rosterId, groupId]);
}

function PositionRow({ position, value, editable, busy, onChange, legacyApply }: {
  position: MonthlyPosition;
  value: MonthlyDraftChoice;
  editable: boolean;
  busy: boolean;
  onChange: (choice: MonthlyDraftChoice) => void;
  legacyApply?: () => void;
}) {
  const { choice, locked } = value;
  const candidates = (position.candidates ?? []).filter(item => item.personId && item.personName &&
    (!position.requiresCouple || item.partnerPersonId));
  const options = new Map(candidates.map(item => [monthlyChoiceKey(item), item]));
  const selected = choice ? monthlyChoiceKey(choice) : "";
  if (choice && !options.has(selected)) options.set(selected, choice);
  return <li className={s.position} data-open={!choice || undefined}>
    <div>
      <strong>{position.roleLabel}</strong>{position.requiresCouple && <span className={s.couple}>Casal</span>}
      <p>{choice ? [choice.personName, choice.partnerName].filter(Boolean).join(" e ") : monthlyVacancyMessage(position)}</p>
    </div>
    {editable && <div className={s.positionActions}>
      {options.size > 0 && <select aria-label={`Escolher integrante ou casal para ${position.roleLabel}`} value={selected}
        disabled={busy} onChange={event => {
          const next = options.get(event.target.value) ?? null;
          onChange({ choice: next, locked: Boolean(next) });
        }}>
        <option value="">Deixar vaga em aberto</option>
        {[...options].map(([key, item]) => <option key={key} value={key}>{[item.personName, item.partnerName].filter(Boolean).join(" e ")}</option>)}
      </select>}
      {choice && <label className={s.checkbox}>
        <input type="checkbox" checked={locked} disabled={busy} onChange={event => onChange({ choice, locked: event.target.checked })} />
        {locked ? "Nome fixado" : "Fixar escolha"}
      </label>}
    </div>}
    {legacyApply && choice && <button type="button" className={s.secondary} disabled={busy} onClick={legacyApply}>Aceitar sugestão</button>}
  </li>;
}
