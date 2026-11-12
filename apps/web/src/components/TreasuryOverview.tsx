import { formatBRL } from "../lib/das-operations";
import { compactMoney, summarizeTreasury, treasuryChannels } from "../lib/treasury-overview";
import { UIIcon } from "./AppShell";
import type { TreasuryPosition } from "./TreasuryPanel";
import s from "./treasury-overview.module.css";

type Summary = ReturnType<typeof summarizeTreasury>;

export function TreasuryOverview({ position, summary, onBank, onDeposits, onReconciliation }: {
  position: TreasuryPosition;
  summary: Summary;
  onBank: (id: string) => void;
  onDeposits: () => void;
  onReconciliation: () => void;
}) {
  const series = [...treasuryChannels, { id: "outras", name: "Outras entradas" } as const]
    .filter(item => item.id !== "outras" || summary.recognized.outras !== 0);
  const max = Math.max(1, ...series.map(item => Math.abs(summary.recognized[item.id])));
  const periodGross = series.reduce((sum, item) => sum + summary.recognized[item.id], 0);
  const dayMax = Math.max(1, ...summary.byDay.map(([, value]) => Math.abs(value)));
  const bankTotal = summary.banks.reduce((sum, bank) => sum + bank.balance, 0);

  return (
    <div className={s.overview}>
      <section className={s.position} aria-label="Consolidação financeira atual">
        <div className={s.available}>
          <span className={s.positionLabel}><UIIcon name="wallet" size={19} /> Disponível após compromissos</span>
          <strong>{formatBRL(position.availableCents)}</strong>
        </div>
        <dl>
          <div><dt>Caixa liquidado</dt><dd>{formatBRL(position.settledCashCents)}</dd></div>
          <div><dt>Despesas e taxas já pagas</dt><dd>{position.settledCostCents === undefined ? "—" : formatBRL(position.settledCostCents)}</dd></div>
          <div><dt>Contas a pagar</dt><dd>{formatBRL(position.committedExpenseCents)}</dd></div>
          <div><dt>A liquidar ou depositar</dt><dd>{formatBRL(position.receivableOpenCents)}</dd></div>
        </dl>
      </section>

      <section className={s.bankSection} aria-labelledby="bank-accounts-title">
        <header className={s.sectionHeading}>
          <div><h2 id="bank-accounts-title">Contas e saldos</h2><p>Posição atual dos lançamentos aprovados</p></div>
          <span>Consolidado <strong>{formatBRL(bankTotal)}</strong></span>
        </header>
        {summary.banks.length ? <div className={s.bankGrid}>
          {summary.banks.map(bank => (
            <button className={s.bank} key={bank.id} type="button" onClick={() => onBank(bank.id)} aria-label={`Ver extrato de ${bank.name}, saldo ${formatBRL(bank.balance)}`}>
              <span className={s.bankTop}><span className={s.bankIcon}><UIIcon name="wallet" size={18} /></span><UIIcon name="arrow" size={17} /></span>
              <span>{bank.name}</span>
              <strong>{formatBRL(bank.balance)}</strong>
            </button>
          ))}
        </div> : <p>Nenhuma conta de caixa com movimento no centro selecionado.</p>}
      </section>

      <div className={s.analyticGrid}>
        <section className={s.surface} aria-labelledby="channel-title">
          <header className={s.sectionHeading}><div><h2 id="channel-title">Entradas por canal</h2><p>Receita bruta reconhecida no período</p></div><strong>{formatBRL(periodGross)}</strong></header>
          <ul className={s.channels}>
            {series.map(channel => <li key={channel.id} data-channel={channel.id}>
              <div><span>{channel.name}</span><strong>{formatBRL(summary.recognized[channel.id])}</strong></div>
              <span className={s.track} aria-hidden="true"><span style={{ width: (100 * Math.abs(summary.recognized[channel.id]) / max) + "%" }} /></span>
            </li>)}
          </ul>
        </section>

        <section className={s.surface} aria-labelledby="settlement-title">
          <header className={s.sectionHeading}><div><h2 id="settlement-title">Valores a confirmar</h2><p>Saldo em aberto na posição atual</p></div><UIIcon name="clock" size={19} /></header>
          <div className={s.pending}>
            <div><span>Cartões a liquidar</span><strong>{formatBRL(summary.pending.cartao)}</strong></div>
            <div><span>Dinheiro de culto a depositar</span><strong>{formatBRL(summary.pending.dinheiro)}</strong></div>
          </div>
          <div className={s.transferHistory}>
            <span>Cartão creditado no banco <strong>{formatBRL(summary.reconciled.cartao)}</strong></span>
            <span>Taxas sobre cartão liquidado <strong>{formatBRL(summary.cardFees)}</strong></span>
            <span>Dinheiro depositado no período <strong>{formatBRL(summary.reconciled.dinheiro)}</strong></span>
          </div>
          <button type="button" className={s.textAction} onClick={onDeposits}>Ver entradas e depósitos <UIIcon name="arrow" size={16} /></button>
        </section>
      </div>

      <section className={s.surface} aria-labelledby="revenue-time-title">
        <header className={s.sectionHeading}><div><h2 id="revenue-time-title">Receitas por dia</h2><p>Receita bruta reconhecida no período</p></div><button type="button" className={s.textAction} onClick={onReconciliation}>Conciliações <UIIcon name="arrow" size={16} /></button></header>
        {summary.byDay.length ? <ol className={s.timeline}>
          {summary.byDay.map(([day, value]) => (
            <li key={day} aria-label={day + ", " + formatBRL(value)} title={formatBRL(value)} data-negative={value < 0}>
              <span className={s.plot}><small>{compactMoney(value)}</small><span style={{ height: (100 * Math.abs(value) / dayMax) + "%" }} /></span>
              <time dateTime={day}>{day.slice(8, 10)}/{day.slice(5, 7)}</time>
            </li>
          ))}
        </ol> : <p className={s.empty}>Sem receitas reconhecidas no período.</p>}
      </section>
    </div>
  );
}
