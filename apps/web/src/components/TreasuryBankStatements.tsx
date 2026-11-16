"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { isBankStatementAccount } from "@idbrf/shared";
import { ApiRequestError, apiGet, apiPost, apiPostFormJson } from "../lib/api";
import { dasError, formatBRL } from "../lib/das-operations";
import type { TreasuryAccount, TreasuryEntry } from "../lib/treasury-overview";
import ui from "./ui/ui.module.css";
import styles from "./treasury-panel.module.css";

type BankLine = {
  id: string;
  postedAt: string;
  amountCents: number;
  description: string;
  matchedEntryId: string | null;
};

type BankBatch = {
  id: string;
  accountId: string;
  filename: string;
  createdAt: string;
  lineCount: number;
  lines: BankLine[];
  alreadyImported?: boolean;
  skippedLineCount?: number;
};

function shortDate(value: string) {
  return value.slice(0, 10).split("-").reverse().join("/");
}

function bankLineError(error: unknown) {
  if (error instanceof ApiRequestError && [400, 409, 413].includes(error.status ?? 0)) {
    if (error.status === 413) return "O arquivo ultrapassa 2 MB. Exporte um período menor.";
    try {
      const { message } = JSON.parse(error.message) as { message?: unknown };
      if (typeof message === "string") return message;
    } catch {
      return dasError(error);
    }
  }
  return dasError(error);
}

function bankCandidates(line: BankLine, batch: BankBatch, entries: TreasuryEntry[]) {
  const postedAt = line.postedAt.slice(0, 10);
  return entries.filter(entry => entry.status === "APPROVED" && entry.lines.reduce((total, part) =>
    part.accountId === batch.accountId ? total + (part.side === "DEBIT" ? part.cents : -part.cents) : total,
  0) === line.amountCents).sort((a, b) =>
    Number(b.entryDate.slice(0, 10) === postedAt) - Number(a.entryDate.slice(0, 10) === postedAt));
}

export function TreasuryBankStatements({ token, accounts, entries }: {
  token: string;
  accounts: TreasuryAccount[];
  entries: TreasuryEntry[];
}) {
  const [batches, setBatches] = useState<BankBatch[]>([]);
  const [batch, setBatch] = useState<BankBatch | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [visible, setVisible] = useState(25);
  const running = useRef(false);
  const eligibleAccounts = accounts.filter(isBankStatementAccount);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const result = await apiGet<{ batches: BankBatch[] }>("/ledger/imports?bankStatements=true", token);
        if (current) {
          setBatches(existing => [...existing, ...result.batches.filter(row =>
            row.accountId && !existing.some(item => item.id === row.id))]);
        }
      } catch (error) {
        if (current) setFailure(bankLineError(error));
      }
    }
    void load();
    return () => { current = false; };
  }, [token]);

  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setNotice("");
    setFailure("");
    try {
      await action();
    } catch (error) {
      setFailure(bankLineError(error));
    } finally {
      running.current = false;
      setPending(false);
    }
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size || !/\.ofx$/i.test(file.name)) {
      setNotice("");
      setFailure("Selecione um arquivo .ofx exportado pelo banco.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice("");
      setFailure("O arquivo ultrapassa 2 MB. Exporte um período menor.");
      return;
    }
    void run(async () => {
      const imported = await apiPostFormJson<BankBatch>("/ledger/imports/ofx", token, data);
      setBatches(existing => [imported, ...existing.filter(row => row.id !== imported.id)]);
      setBatch(imported);
      setVisible(25);
      form.reset();
      const skipped = imported.skippedLineCount ?? 0;
      const importedCount = imported.lineCount + (imported.lineCount === 1 ? " movimento importado." : " movimentos importados.");
      setNotice(imported.alreadyImported ? "Este extrato já estava registrado para a conta escolhida." :
        importedCount + (skipped ? " " + skipped + (skipped === 1 ? " movimento já importado." : " movimentos já importados.") : ""));
    });
  }

  function openBatch(row: BankBatch) {
    void run(async () => {
      setBatch(await apiGet<BankBatch>("/ledger/imports/" + encodeURIComponent(row.id), token));
      setVisible(25);
    });
  }

  function match(line: BankLine, entryId?: string) {
    if (!batch) return;
    void run(async () => {
      const updated = await apiPost<BankLine>("/ledger/bank-lines/" + encodeURIComponent(line.id) + (entryId ? "/match" : "/unmatch"),
        token, entryId ? { entryId } : undefined);
      setBatch({ ...batch, lines: batch.lines.map(item => item.id === line.id ? { ...item, matchedEntryId: updated.matchedEntryId } : item) });
      setNotice(entryId ? "Vínculo registrado." : "Vínculo desfeito.");
    });
  }

  return (
    <details className={styles.bankStatements}>
      <summary>Importar extrato bancário</summary>
      <p className={styles.note}>Exporte o OFX no banco, escolha a conta que corresponde ao arquivo e confira os movimentos. O saldo segue os lançamentos aprovados.</p>
      {eligibleAccounts.length ? <form onSubmit={upload}>
        <label>Conta bancária
          <select name="accountId" defaultValue="" required disabled={pending}>
            <option value="" disabled>Selecione a conta</option>
            {eligibleAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
        <label>Arquivo OFX<input type="file" name="file" accept=".ofx,application/x-ofx" required disabled={pending} /></label>
        <button type="submit" className={ui.workspacePrimary} disabled={pending}>{pending ? "Aguarde…" : "Importar OFX"}</button>
      </form> : <p className={styles.note}>Cadastre uma conta bancária ativa para importar.</p>}
      {failure && <p role="alert">{failure}</p>}
      {notice && <p role="status">{notice}</p>}
      {batches.length > 0 && <details>
        <summary>Extratos importados ({batches.length})</summary>
        <ul>{batches.map(row => <li key={row.id}>
          <button type="button" className={ui.workspaceQuiet} onClick={() => openBatch(row)} disabled={pending}>{row.filename}</button>
          <small>{accounts.find(account => account.id === row.accountId)?.name ?? "Conta bancária"} · {shortDate(row.createdAt)} · {row.lineCount} mov.</small>
        </li>)}</ul>
      </details>}
      {batch && <section aria-label="Movimentos bancários importados">
        <h3>{batch.filename}</h3>
        <p className={styles.note}>{accounts.find(account => account.id === batch.accountId)?.name ?? "Conta bancária"}</p>
        <ul>{batch.lines.slice(0, visible).map(line => {
          const candidates = bankCandidates(line, batch, entries)
            .filter(entry => !batch.lines.some(other => other.matchedEntryId === entry.id));
          const matched = entries.find(entry => entry.id === line.matchedEntryId);
          return <li key={line.id}>
            <strong>{line.description}</strong>
            <small>{shortDate(line.postedAt)} · {formatBRL(line.amountCents)}</small>
            {line.matchedEntryId ? <>
              <small>Vinculado{matched ? " · " + matched.description : ""}</small>
              <button type="button" className={ui.workspaceQuiet} disabled={pending} onClick={() => match(line)}>Desfazer vínculo</button>
            </> : candidates.length ? <form onSubmit={event => {
              event.preventDefault();
              const entryId = new FormData(event.currentTarget).get("entryId");
              if (typeof entryId === "string" && entryId) match(line, entryId);
            }}>
              <label>Lançamento correspondente
                <select name="entryId" defaultValue="" required disabled={pending}>
                  <option value="" disabled>Selecione um lançamento</option>
                  {candidates.map(entry => <option key={entry.id} value={entry.id}>{shortDate(entry.entryDate)} · {entry.description}</option>)}
                </select>
              </label>
              <button type="submit" className={ui.workspaceSecondary} disabled={pending}>Vincular</button>
            </form> : <small>Aguardando lançamento correspondente nesta conta.</small>}
          </li>;
        })}</ul>
        {batch.lines.length > visible && <button type="button" className={ui.workspaceSecondary} onClick={() => setVisible(value => value + 25)}>Mostrar mais movimentos</button>}
      </section>}
    </details>
  );
}
