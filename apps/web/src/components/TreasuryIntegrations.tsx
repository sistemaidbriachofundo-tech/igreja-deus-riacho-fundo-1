"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { dasError } from "../lib/das-operations";
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
  useEffect(() => {
    let live = true;
    void apiGet<Adapter[]>("/ledger/bank-adapters", token).then(result => {
      if (live) setAdapters(result);
    }).catch(problem => {
      if (live) setError(dasError(problem));
    });
    return () => { live = false; };
  }, [token]);

  return <section className={s.card} aria-label="Contas e integrações">
    <h2>Contas e integrações</h2>
    {!adapters && !error && <p role="status">Consultando as integrações da Tesouraria…</p>}
    {error && <p role="alert">{error}</p>}
    <dl>
      {providers.map(provider => {
        const adapter = adapters?.find(row => row.code === provider.code);
        const status = adapter?.live ? "API disponível" : adapter ? "Importação por arquivo" : adapters ? "Conexão sem configuração" : "Status indisponível";
        return <div key={provider.code}><dt><strong>{provider.label}</strong></dt><dd>{status}</dd></div>;
      })}
    </dl>
    <p><button type="button" className={ui.workspaceSecondary} onClick={onStatement}>Abrir importação de extratos</button>{" "}
      <AppNavLink className={ui.workspaceSecondary} href="/app/eventos-gestao/">Configurar conta de recebimento por lote</AppNavLink></p>
    <h3>Contas do plano financeiro</h3>
    {accountsPending ? <p role="status">Consultando contas…</p> : accounts.length
      ? <ul>{accounts.filter(account => account.active !== false).map(account => <li key={account.id}>{account.name} · {account.code}</li>)}</ul>
      : <p>Sem contas disponíveis para esta seleção.</p>}
  </section>;
}
