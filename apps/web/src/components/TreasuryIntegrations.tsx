"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { readEventPaymentAccounts, type EventPaymentAccount } from "../lib/event-management";
import type { TreasuryAccount } from "../lib/treasury-overview";
import { AppNavLink } from "./AppShell";
import ui from "./ui/ui.module.css";
import s from "./treasury-panel.module.css";

type Adapter = { code: string; mode: "file" | "mock" | "api"; live: boolean };
const providers = [{ code: "BRB", label: "BRB" }, { code: "SICOOB", label: "Sicoob" }, { code: "MERCADO_PAGO", label: "Mercado Pago" }];

export function TreasuryIntegrations({ token, accounts, accountsPending, onStatement }: {
  token: string;
  accounts: TreasuryAccount[];
  accountsPending: boolean;
  onStatement: () => void;
}) {
  const [adapters, setAdapters] = useState<Adapter[]>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentAccounts, setPaymentAccounts] = useState<EventPaymentAccount[]>();
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [collectorId, setCollectorId] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all([
      apiGet<Adapter[]>("/ledger/bank-adapters", token),
      apiGet<unknown>("/events/receiving-accounts", token, { fresh: true }),
    ]).then(([providers, payment]) => {
      if (live) { setAdapters(providers); setPaymentAccounts(readEventPaymentAccounts(payment) ?? []); }
    }).catch(problem => {
      if (live) setError(dasError(problem));
    });
    return () => { live = false; };
  }, [token, revision]);

  function selectAccount(id: string) {
    const account = paymentAccounts?.find(row => row.id === id);
    setSelectedId(id);
    setEnabled(account?.provider === "MERCADO_PAGO");
    setCollectorId(account?.collectorId ?? "");
    setNotice("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiPatch("/ledger/receiving-accounts/" + encodeURIComponent(selectedId) + "/mercado-pago", token, {
        enabled, collectorId: enabled ? collectorId.trim() || null : null,
      });
      setNotice("Configuração de recebimento atualizada.");
      setRevision(value => value + 1);
    } catch (problem) { setError(dasError(problem)); }
    finally { setBusy(false); }
  }

  async function simulate(code: string) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await apiPost("/ledger/bank-adapters/" + encodeURIComponent(code) + "/mock-probe", token, {});
      setNotice("Simulação concluída. A integração permanece no modo de teste.");
    } catch (problem) { setError(dasError(problem)); }
    finally { setBusy(false); }
  }

  return <section className={s.card} aria-label="Contas e integrações">
    <h2>Contas e integrações</h2>
    {!adapters && !error && <p role="status">Consultando as integrações da Tesouraria…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <dl>
      {providers.map(provider => {
        const adapter = adapters?.find(row => row.code === provider.code);
        const status = adapter?.live ? "API disponível" : adapter ? "Importação por arquivo" : adapters ? "Conexão sem configuração" : "Status indisponível";
        return <div key={provider.code}><dt><strong>{provider.label}</strong></dt><dd>{status}
          {adapter?.mode === "mock" && provider.code !== "MERCADO_PAGO" && <>{" "}<button type="button" disabled={busy}
            className={ui.workspaceSecondary} onClick={() => void simulate(provider.code)}>Simular {provider.label}</button></>}
        </dd></div>;
      })}
    </dl>
    <p><button type="button" className={ui.workspaceSecondary} onClick={onStatement}>Abrir importação de extratos</button>{" "}
      <AppNavLink className={ui.workspaceSecondary} href="/app/eventos-gestao/">Configurar conta de recebimento por lote</AppNavLink></p>
    {Boolean(paymentAccounts?.length) && <form className={s.card} onSubmit={save}>
      <h3>Recebimento de eventos pelo Mercado Pago</h3>
      <label>Conta da igreja <select value={selectedId} onChange={event => selectAccount(event.target.value)} required>
        <option value="">Escolha uma conta</option>
        {paymentAccounts?.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select></label>
      {selectedId && <>
        <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Habilitar Mercado Pago para esta conta</label>
        {enabled && <label>Identificador do recebedor <input value={collectorId} maxLength={64} pattern="[A-Za-z0-9_-]+"
          onChange={event => setCollectorId(event.target.value)} /></label>}
      </>}
      <button type="submit" className={ui.workspacePrimary} disabled={busy || !selectedId}>Salvar configuração</button>
    </form>}
    <h3>Contas do plano financeiro</h3>
    {accountsPending ? <p role="status">Consultando contas…</p> : accounts.length
      ? <ul>{accounts.filter(account => account.active !== false).map(account => <li key={account.id}>{account.name} · {account.code}</li>)}</ul>
      : <p>Sem contas disponíveis para esta seleção.</p>}
  </section>;
}
