"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost, loadStoredToken } from "../lib/api";
import { dasError, formatBRL, parseAmountCents, readDasRows, type DasRecord } from "../lib/das-operations";
import styles from "./treasury-panel.module.css";

type Tab = "recebido" | "receber" | "compromisso" | "liquidar";

type Position = {
  receivedRevenueCents: number;
  receivableOpenCents: number;
  settledCashCents: number;
  committedExpenseCents: number;
  availableCents: number;
  grossRevenueCents: number;
  feeCents: number;
  netRevenueCents: number;
};

const ILLUSTRATION: Position = {
  receivedRevenueCents: 10000,
  receivableOpenCents: 8000,
  settledCashCents: 10000,
  committedExpenseCents: 5000,
  availableCents: 5000,
  grossRevenueCents: 18000,
  feeCents: 0,
  netRevenueCents: 18000,
};

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function matches(account: DasRecord, kind: "cash" | "revenue" | "receivable" | "expense" | "payable" | "fee") {
  const code = str(account.code);
  const type = str(account.type);
  if (kind === "cash") return type === "ASSET" && /^1\.1(\.|$)/.test(code);
  if (kind === "receivable") return type === "ASSET" && /^1\.2(\.|$)/.test(code);
  if (kind === "payable") return type === "LIABILITY" && /^2\.1(\.|$)/.test(code);
  if (kind === "fee") return type === "EXPENSE" && /^5\.9(\.|$)/.test(code);
  if (kind === "expense") return type === "EXPENSE" && !/^5\.9(\.|$)/.test(code);
  return type === "REVENUE";
}

export function TreasuryPanel() {
  const enabled = process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const [tab, setTab] = useState<Tab>("recebido");
  const [token, setToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<DasRecord[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("hml-oferta-0001");
  const [entryDate, setEntryDate] = useState("2026-11-09");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");

  useEffect(() => {
    const stored = loadStoredToken();
    setToken(stored);
    if (!enabled || !stored) return;
    let cancelled = false;
    void apiGet<unknown>("/ledger/accounts", stored)
      .then((payload) => {
        if (!cancelled) setAccounts(readDasRows(payload, "accounts"));
      })
      .catch((error) => {
        if (!cancelled) setMessage(dasError(error));
      });
    void apiGet<{ position: Position }>("/treasury/position", stored)
      .then((payload) => {
        if (!cancelled) setPosition(payload.position);
      })
      .catch((error) => {
        if (!cancelled) setMessage(dasError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const live = position ?? null;
  const canPost = enabled && Boolean(token) && !busy;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canPost) return;
    const cents = parseAmountCents(amount);
    if (!cents || description.trim().length < 4 || !primary || !secondary || primary === secondary) {
      setMessage("Informe descrição, valor positivo e duas contas diferentes do plano sintético.");
      return;
    }
    const path =
      tab === "recebido"
        ? "/treasury/cash-receipts"
        : tab === "receber"
          ? "/treasury/receivables"
          : tab === "compromisso"
            ? "/treasury/commitments"
            : "/treasury/settlements";
    const body =
      tab === "recebido" || tab === "receber"
        ? {
            idempotencyKey,
            entryDate,
            description: description.trim(),
            grossCents: cents,
            ...(tab === "recebido"
              ? { cashAccountId: primary, revenueAccountId: secondary }
              : { receivableAccountId: primary, revenueAccountId: secondary }),
          }
        : {
            idempotencyKey,
            entryDate,
            description: description.trim(),
            amountCents: cents,
            ...(tab === "compromisso"
              ? { expenseAccountId: primary, payableAccountId: secondary }
              : { payableAccountId: primary, cashAccountId: secondary }),
          };
    setBusy(true);
    setMessage("");
    try {
      const result = await apiPost<{ idempotentReplay: boolean; reason: string }> (path, token, body);
      setMessage(
        result.idempotentReplay
          ? "A mesma chave devolveu o lançamento já gravado. Nada foi duplicado."
          : "Rascunho gravado na HML. Ele só entra na posição depois da dupla aprovação já existente no ledger.",
      );
      const next = await apiGet<{ position: Position }>("/treasury/position", token);
      setPosition(next.position);
    } catch (error) {
      setMessage(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  const primaryKind = tab === "recebido" ? "cash" : tab === "receber" ? "receivable" : tab === "compromisso" ? "expense" : "payable";
  const secondaryKind = tab === "compromisso" ? "payable" : tab === "liquidar" ? "cash" : "revenue";
  const primaryLabel =
    tab === "recebido" ? "Conta de caixa 1.1" : tab === "receber" ? "Conta a receber 1.2" : tab === "compromisso" ? "Conta de despesa" : "Conta a pagar 2.1";
  const secondaryLabel =
    tab === "compromisso" ? "Conta a pagar 2.1" : tab === "liquidar" ? "Conta de caixa 1.1" : "Conta de receita";

  return (
    <section className={styles.panel} aria-labelledby="treasury-title">
      <header className={styles.header}>
        <p className={styles.kicker}>TESOURARIA · HML SINTÉTICA</p>
        <h1 id="treasury-title">Recebido, a receber, caixa e compromisso</h1>
        <p className={styles.lede}>
          Quatro medidas separadas. O disponível é o caixa liquidado menos a despesa comprometida.
          Despesa já paga não é subtraída de novo. Nenhum Pix, cartão ou banco é acionado.
        </p>
      </header>

      <p className={styles.banner} role="status">
        Banco, Pix e maquininha estão bloqueados. A matriz do PR #101 ainda não está integrada:
        esta tela usa o papel TESOURARIA da main. A chave única no banco também está bloqueada para o integrador.
      </p>

      <div className={styles.metrics}>
        <article className={styles.metric}>
          <span>Receita recebida</span>
          <strong>{live ? formatBRL(live.receivedRevenueCents) : "Sem consulta"}</strong>
          <small>Caixa que entrou contra receita ou baixa de recebível, só se o lançamento estiver aprovado.</small>
        </article>
        <article className={styles.metric}>
          <span>A receber</span>
          <strong>{live ? formatBRL(live.receivableOpenCents) : "Sem consulta"}</strong>
          <small>Saldo em aberto nas contas 1.2. Não é caixa e não repete a receita.</small>
        </article>
        <article className={styles.metric}>
          <span>Caixa liquidado</span>
          <strong>{live ? formatBRL(live.settledCashCents) : "Sem consulta"}</strong>
          <small>Saldo das contas 1.1 depois dos estornos.</small>
        </article>
        <article className={styles.metric}>
          <span>Despesa comprometida</span>
          <strong>{live ? formatBRL(live.committedExpenseCents) : "Sem consulta"}</strong>
          <small>Contas 2.1 aprovadas e ainda não pagas. Rascunho não compromete.</small>
        </article>
      </div>

      <section className={styles.illustration} aria-label="Ilustração do contrato" data-synthetic="illustration">
        <span>Ilustração do contrato · não é saldo da igreja</span>
        <p className={styles.note}>
          Oferta à vista de R$ 100,00, dízimo a receber de R$ 80,00 e conta comprometida de R$ 50,00.
          O disponível ilustrado é R$ 50,00: caixa menos compromisso. O bruto de R$ 180,00 não é somado ao recebido.
        </p>
        <dl>
          <div><dt>Recebido</dt><dd>{formatBRL(ILLUSTRATION.receivedRevenueCents)}</dd></div>
          <div><dt>A receber</dt><dd>{formatBRL(ILLUSTRATION.receivableOpenCents)}</dd></div>
          <div><dt>Caixa liquidado</dt><dd>{formatBRL(ILLUSTRATION.settledCashCents)}</dd></div>
          <div><dt>Comprometido</dt><dd>{formatBRL(ILLUSTRATION.committedExpenseCents)}</dd></div>
          <div><dt>Disponível</dt><dd>{formatBRL(ILLUSTRATION.availableCents)}</dd></div>
          <div><dt>Bruto reconhecido</dt><dd>{formatBRL(ILLUSTRATION.grossRevenueCents)}</dd></div>
        </dl>
      </section>

      <div className={styles.tabs} role="tablist" aria-label="Tipo de lançamento sintético">
        {([
          ["recebido", "Receita recebida"],
          ["receber", "Reconhecer recebível"],
          ["compromisso", "Comprometer despesa"],
          ["liquidar", "Liquidar compromisso"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <form className={`${styles.card} ${styles.form}`} onSubmit={onSubmit}>
        <p className={`${styles.note} ${styles.wide}`}>
          O lançamento nasce como rascunho. Duas pessoas diferentes aprovam no fluxo de ledger já existente.
          A segunda tentativa com a mesma chave não cria outro lançamento.
          {!enabled && " A gravação fica desligada enquanto a homologação da interface não está habilitada."}
          {enabled && !token && " Entre com uma conta sintética de tesouraria para consultar a API. Nenhuma conta é inventada aqui."}
        </p>
        <label>Chave de idempotência
          <input value={idempotencyKey} onChange={(event) => setIdempotencyKey(event.target.value)} minLength={8} maxLength={80} required />
        </label>
        <label>Data
          <input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} required />
        </label>
        <label className={styles.wide}>Descrição sintética
          <input value={description} onChange={(event) => setDescription(event.target.value)} minLength={4} maxLength={180} required />
        </label>
        <label>Valor em reais
          <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100,00" required />
        </label>
        <label>{primaryLabel}
          <select value={primary} onChange={(event) => setPrimary(event.target.value)} required>
            <option value="">Selecione uma conta da API</option>
            {accounts.filter((account) => matches(account, primaryKind)).map((account) => (
              <option key={str(account.id)} value={str(account.id)}>{str(account.code)} · {str(account.name)}</option>
            ))}
          </select>
        </label>
        <label>{secondaryLabel}
          <select value={secondary} onChange={(event) => setSecondary(event.target.value)} required>
            <option value="">Selecione uma conta da API</option>
            {accounts.filter((account) => matches(account, secondaryKind)).map((account) => (
              <option key={str(account.id)} value={str(account.id)}>{str(account.code)} · {str(account.name)}</option>
            ))}
          </select>
        </label>
        <button className={styles.wide} type="submit" disabled={!canPost}>
          Gravar rascunho sintético
        </button>
        {message && <p className={`${styles.status} ${styles.wide}`} role="status">{message}</p>}
      </form>
    </section>
  );
}
