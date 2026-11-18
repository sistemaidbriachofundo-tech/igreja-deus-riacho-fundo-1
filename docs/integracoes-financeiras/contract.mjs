/**
 * Especificação executável da pesquisa #99.
 * Não é runtime da API: sem rede, sem Prisma, sem credencial bancária.
 * A tesouraria continua dona do lançamento; nada daqui posta no ledger.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Segredo só para o vetor de teste. Não é chave de banco, PSP ou HML. */
export const SYNTHETIC_WEBHOOK_SECRET = "synthetic-webhook-not-a-credential";

/** Limites do padrão Pix (BCB), não de um fornecedor escolhido. */
export const PIX_LIMITS = Object.freeze({
  txidDynamicMin: 26,
  txidDynamicMax: 35,
  txidStaticMax: 25,
  txidStaticAbsentToken: "***",
  e2eidLength: 32,
  infoPagadorMax: 140,
  pageDefault: 100,
  pageMax: 1000,
  devolucaoIdMax: 35,
});

const TXID_DYNAMIC = /^[a-zA-Z0-9]{26,35}$/;
const TXID_STATIC = /^[a-zA-Z0-9]{1,25}$/;
const E2EID = /^[a-zA-Z0-9]{32}$/;
const DEVOLUCAO_ID = /^[a-zA-Z0-9]{1,35}$/;

const FORBIDDEN_KEYS = new Set([
  "password",
  "senha",
  "apikey",
  "api_key",
  "clientsecret",
  "client_secret",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "privatekey",
  "private_key",
  "certificatepem",
  "webhooksecret",
  "cvv",
  "pan",
  "cardnumber",
  "card_number",
]);

const FORBIDDEN_VALUE =
  /BEGIN (?:RSA |EC )?PRIVATE KEY|BEGIN CERTIFICATE|sk_live_|AKIA[0-9A-Z]{16}/;

export function findSecretViolations(value, path = "$") {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findSecretViolations(item, `${path}[${index}]`),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => {
      const here = `${path}.${key}`;
      const hit = FORBIDDEN_KEYS.has(key.toLowerCase()) ? [here] : [];
      return [...hit, ...findSecretViolations(child, here)];
    });
  }
  if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) {
    return [path];
  }
  return [];
}

export function inspectTxid(txid) {
  if (txid == null || txid === "" || txid === PIX_LIMITS.txidStaticAbsentToken) {
    return "ABSENT";
  }
  if (TXID_DYNAMIC.test(txid)) {
    return "DYNAMIC";
  }
  if (TXID_STATIC.test(txid)) {
    return "STATIC";
  }
  return "INVALID";
}

export function isE2eid(value) {
  return typeof value === "string" && E2EID.test(value);
}

export function isDevolucaoId(value) {
  return typeof value === "string" && DEVOLUCAO_ID.test(value);
}

/** Valor Pix do padrão (`"50.00"`) → centavos. Rejeita fração além de 2 casas. */
export function parsePixValor(valor) {
  if (typeof valor !== "string" || !/^\d{1,10}\.\d{2}$/.test(valor)) {
    return null;
  }
  const [whole, frac] = valor.split(".");
  return Number(whole) * 100 + Number(frac);
}

export function canPostToLedger(classification) {
  return classification === "CONFIRMED_BY_TREASURER";
}

export function classifyByText(text) {
  const hint =
    typeof text === "string" && text.trim().length > 0 ? "UNTRUSTED_TEXT" : null;
  return {
    classification: "REVIEW",
    ledgerPostingAllowed: false,
    hint,
  };
}

function textHint(infoPagador) {
  if (typeof infoPagador !== "string" || infoPagador.length === 0) {
    return null;
  }
  return infoPagador.length > PIX_LIMITS.infoPagadorMax
    ? "TEXT_OVER_LIMIT"
    : "UNTRUSTED_TEXT";
}

/**
 * Concilia um Pix recebido (webhook ou consulta) com uma cobrança em aberto.
 * `endToEndId` é a chave do dinheiro. `txid` é a referência. Texto não confirma.
 */
export function reconcilePixReceipt({ event, openCharges, seenE2eids }) {
  const errors = [];
  if (!isE2eid(event?.e2eid)) {
    errors.push("E2EID_INVALID");
  }
  if (event?.infoPagador && event.infoPagador.length > PIX_LIMITS.infoPagadorMax) {
    errors.push("INFO_PAGADOR_OVER_LIMIT");
  }
  if (!Number.isInteger(event?.amountCents)) {
    errors.push("AMOUNT_NOT_CENTS");
  }
  if (errors.includes("E2EID_INVALID")) {
    return {
      disposition: "REJECTED",
      classification: "REJECTED",
      ledgerPostingAllowed: false,
      webhookWouldFire: false,
      errors,
    };
  }
  if (seenE2eids.includes(event.e2eid)) {
    return {
      disposition: "IDEMPOTENT_REPLAY",
      classification: "UNCHANGED",
      ledgerPostingAllowed: false,
      webhookWouldFire: inspectTxid(event.txid) !== "ABSENT",
      errors,
    };
  }
  if (errors.includes("AMOUNT_NOT_CENTS")) {
    return {
      disposition: "REJECTED",
      classification: "REJECTED",
      ledgerPostingAllowed: false,
      webhookWouldFire: false,
      errors,
    };
  }

  const txidState = inspectTxid(event.txid);
  const hint = textHint(event.infoPagador);
  const base = {
    ledgerPostingAllowed: false,
    textHint: hint,
    webhookWouldFire: txidState === "DYNAMIC" || txidState === "STATIC",
    errors,
  };

  if (event.amountCents < 0) {
    return {
      ...base,
      disposition: "REVIEW",
      classification: "REVIEW",
      reason: "DEBIT_OR_DEVOLUTION",
    };
  }
  if (txidState === "ABSENT") {
    return {
      ...base,
      disposition: "REVIEW",
      classification: "REVIEW",
      reason: "NO_TXID",
      webhookWouldFire: false,
    };
  }
  if (txidState === "INVALID") {
    return {
      ...base,
      disposition: "REVIEW",
      classification: "REVIEW",
      reason: "TXID_INVALID",
      webhookWouldFire: false,
      errors: [...errors, "TXID_INVALID"],
    };
  }

  const charge = (openCharges ?? []).find((item) => item.txid === event.txid);
  if (!charge) {
    return {
      ...base,
      disposition: "REVIEW",
      classification: "REVIEW",
      reason: "TXID_UNKNOWN",
    };
  }
  const expectedKind = txidState === "DYNAMIC" ? "COB" : "STATIC";
  if (charge.kind !== expectedKind) {
    return {
      ...base,
      disposition: "REVIEW",
      classification: "REVIEW",
      reason: "TXID_KIND_MISMATCH",
    };
  }
  if (charge.amountCents !== event.amountCents) {
    return {
      ...base,
      disposition: "REVIEW",
      classification: "REVIEW",
      reason: "AMOUNT_MISMATCH",
    };
  }
  if (charge.linkedE2eid && charge.linkedE2eid !== event.e2eid) {
    return {
      ...base,
      disposition: "REVIEW",
      classification: "REVIEW",
      reason: "TXID_ALREADY_LINKED",
    };
  }
  return {
    ...base,
    disposition: "SUGGESTED_BY_REFERENCE",
    classification: "SUGGESTED",
    reason: "TXID_AND_AMOUNT",
    match: {
      txid: event.txid,
      e2eid: event.e2eid,
      amountCents: event.amountCents,
    },
  };
}

export function applyPixReceipt({ event, charges, seenE2eids }) {
  const decision = reconcilePixReceipt({
    event,
    openCharges: charges,
    seenE2eids,
  });
  if (
    decision.disposition === "REJECTED" ||
    decision.disposition === "IDEMPOTENT_REPLAY"
  ) {
    return { decision, charges, seenE2eids };
  }
  const nextSeen = [...seenE2eids, event.e2eid];
  const nextCharges =
    decision.disposition === "SUGGESTED_BY_REFERENCE"
      ? charges.map((charge) =>
          charge.txid === event.txid
            ? { ...charge, linkedE2eid: event.e2eid }
            : charge,
        )
      : charges;
  return { decision, charges: nextCharges, seenE2eids: nextSeen };
}

function tagValue(block, tag) {
  const closed = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i").exec(block);
  if (closed?.[1] !== undefined) {
    return closed[1].trim();
  }
  const open = new RegExp(`<${tag}>([^\\n<]*)`, "i").exec(block);
  return open?.[1] !== undefined ? open[1].trim() : null;
}

/**
 * Lê FITID/CHECKNUM de um OFX sintético para o contrato de dedupe.
 * O parser de produção continua sendo `parseOfxLines` em `@idbrf/shared`.
 */
export function extractOfxExternalRefs(text) {
  const blocks = text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi);
  const lines = [];
  for (const match of blocks) {
    const block = match[1] ?? "";
    const fitid = tagValue(block, "FITID");
    const checknum = tagValue(block, "CHECKNUM");
    const externalRef = (fitid || checknum || "").trim() || null;
    const amount = tagValue(block, "TRNAMT");
    lines.push({
      externalRef,
      amountCents: amount == null ? null : parsePixValor(normalizeOfxAmount(amount)),
      description: [tagValue(block, "NAME"), tagValue(block, "MEMO")]
        .filter(Boolean)
        .join(" — "),
    });
  }
  return lines;
}

function normalizeOfxAmount(raw) {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return "";
  }
  const negative = cleaned.startsWith("-");
  const abs = negative ? cleaned.slice(1) : cleaned;
  const [whole, frac = ""] = abs.split(".");
  const cents = `${frac}00`.slice(0, 2);
  return `${negative ? "-" : ""}${whole}.${cents}`;
}

export function ingestStatementLines(existingExternalRefs, lines) {
  const seen = new Set(existingExternalRefs);
  const accepted = [];
  const duplicates = [];
  for (const line of lines) {
    if (line.externalRef && seen.has(line.externalRef)) {
      duplicates.push(line.externalRef);
      continue;
    }
    if (line.externalRef) {
      seen.add(line.externalRef);
    }
    const classification = line.referenceMatch === true ? "SUGGESTED" : "REVIEW";
    accepted.push({
      ...line,
      classification,
      ledgerPostingAllowed: false,
      reason: line.externalRef
        ? classification === "SUGGESTED"
          ? "REFERENCE"
          : "TEXT_OR_UNMATCHED"
        : "NO_EXTERNAL_REF",
    });
  }
  return { accepted, duplicates, externalRefs: [...seen] };
}

export function projectCardCycle(sale, options = {}) {
  if (!Number.isInteger(sale.grossCents) || sale.grossCents <= 0) {
    throw new TypeError("grossCents inteiro positivo");
  }
  if (!Number.isInteger(sale.installments) || sale.installments < 1) {
    throw new TypeError("installments inteiro >= 1");
  }
  if (!Number.isInteger(sale.mdrBps) || sale.mdrBps < 0) {
    throw new TypeError("mdrBps inteiro >= 0");
  }
  const totalFee = Math.floor((sale.grossCents * sale.mdrBps) / 10_000);
  const baseGross = Math.floor(sale.grossCents / sale.installments);
  const grossRemainder = sale.grossCents - baseGross * sale.installments;
  const baseFee = Math.floor(totalFee / sale.installments);
  const feeRemainder = totalFee - baseFee * sale.installments;
  const anticipated = new Set(options.anticipateInstallments ?? []);
  const anticipationFees = options.anticipationFeeCentsByInstallment ?? {};

  const receivables = [];
  for (let installment = 1; installment <= sale.installments; installment += 1) {
    const gross =
      baseGross + (installment === sale.installments ? grossRemainder : 0);
    const mdr = baseFee + (installment === sale.installments ? feeRemainder : 0);
    const extra = anticipated.has(installment)
      ? (anticipationFees[installment] ?? 0)
      : 0;
    if (!Number.isInteger(extra) || extra < 0 || extra > gross - mdr) {
      throw new TypeError("antecipação inválida");
    }
    receivables.push({
      id: `${sale.acquirerTransactionId}:${installment}`,
      installment,
      grossCents: gross,
      mdrCents: mdr,
      anticipationFeeCents: extra,
      netCents: gross - mdr - extra,
      status: anticipated.has(installment) ? "ANTICIPATED" : "OPEN",
    });
  }

  const sum = (pick) => receivables.reduce((total, row) => total + pick(row), 0);
  return {
    sale: {
      id: sale.acquirerTransactionId,
      grossCents: sale.grossCents,
      status: sale.status,
    },
    receivables,
    totals: {
      grossCents: sale.grossCents,
      mdrCents: sum((row) => row.mdrCents),
      anticipationFeeCents: sum((row) => row.anticipationFeeCents),
      netCents: sum((row) => row.netCents),
    },
  };
}

export function applySettlementEvent({ state, event, receivables }) {
  if (state.events.includes(event.eventId)) {
    return {
      state,
      effect: "IDEMPOTENT_REPLAY",
      ledgerPostingAllowed: false,
    };
  }
  const known = state.payouts.find((payout) => payout.id === event.payout.id);
  if (known?.status === "SUGGESTED") {
    return {
      state: { ...state, events: [...state.events, event.eventId] },
      effect: "REVIEW",
      reason: "PAYOUT_ALREADY_LINKED",
      ledgerPostingAllowed: false,
    };
  }

  const missing = [];
  const linked = [];
  for (const id of event.payout.receivableIds) {
    const row = receivables.find((item) => item.id === id);
    if (!row) {
      missing.push(id);
    } else {
      linked.push(row);
    }
  }

  let status = "SUGGESTED";
  let reason = "NET_MATCH";
  if (missing.length > 0) {
    status = "UNMATCHED";
    reason = "RECEIVABLE_NOT_FOUND";
  } else if (!Number.isInteger(event.payout.netCents)) {
    status = "REVIEW";
    reason = "AMOUNT_NOT_CENTS";
  } else {
    const expected = linked.reduce((total, row) => total + row.netCents, 0);
    if (expected !== event.payout.netCents) {
      status = "REVIEW";
      reason = "NET_MISMATCH";
    }
  }

  const payoutRow = {
    id: event.payout.id,
    status,
    reason,
    netCents: status === "SUGGESTED" ? event.payout.netCents : null,
    linkedIds: status === "SUGGESTED" ? linked.map((row) => row.id) : [],
  };
  const payouts = known
    ? state.payouts.map((payout) => (payout.id === known.id ? payoutRow : payout))
    : [...state.payouts, payoutRow];

  return {
    state: { events: [...state.events, event.eventId], payouts },
    effect: status,
    reason,
    ledgerPostingAllowed: false,
    grossPreservedCents:
      status === "SUGGESTED"
        ? linked.reduce((total, row) => total + row.grossCents, 0)
        : null,
    missing,
  };
}

export function signWebhook({ secret, eventId, resourceId, status }) {
  const canonical = `${eventId}:${resourceId}:${status}`;
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

export function acceptSignedWebhook({
  secret,
  eventId,
  resourceId,
  status,
  signature,
  inbox,
}) {
  const expected = signWebhook({ secret, eventId, resourceId, status });
  const given = Buffer.from(signature ?? "", "utf8");
  const wanted = Buffer.from(expected, "utf8");
  const valid = given.length === wanted.length && timingSafeEqual(given, wanted);
  if (!valid) {
    return { accepted: false, reason: "BAD_SIGNATURE", idempotentReplay: false };
  }
  if (inbox.includes(eventId)) {
    return { accepted: true, reason: "REPLAY", idempotentReplay: true };
  }
  return {
    accepted: true,
    reason: "NEW",
    idempotentReplay: false,
    inbox: [...inbox, eventId],
  };
}

const HYPOTHESIS_STATUS = new Set([
  "HYPOTHESIS_NOT_A_CHOICE",
  "AVAILABLE_TODAY_IN_REPO",
  "BLOCKED",
]);

export function validateProviderCatalog(catalog) {
  const errors = [];
  if (catalog.chosenProvider !== null) {
    errors.push("CHOSEN_PROVIDER_SET");
  }
  if (catalog.chosenAcquirer !== null) {
    errors.push("CHOSEN_ACQUIRER_SET");
  }
  if (catalog.liveIntegration !== "BLOCKED") {
    errors.push("LIVE_INTEGRATION_NOT_BLOCKED");
  }
  for (const label of catalog.codeLabelsAlreadyInRepo ?? []) {
    if (label.live !== false) {
      errors.push(`LABEL_LIVE:${label.code}`);
    }
  }
  const ids = new Set();
  for (const item of catalog.hypotheses ?? []) {
    if (ids.has(item.id)) {
      errors.push(`DUP_HYPOTHESIS:${item.id}`);
    }
    ids.add(item.id);
    if (!HYPOTHESIS_STATUS.has(item.status)) {
      errors.push(`BAD_STATUS:${item.id}`);
    }
    if (item.status === "SELECTED") {
      errors.push(`SELECTED:${item.id}`);
    }
  }
  const limits = catalog.pixApiLimits ?? {};
  if (limits.txidDynamicMin !== PIX_LIMITS.txidDynamicMin) {
    errors.push("LIMIT_TXID_MIN");
  }
  if (limits.txidDynamicMax !== PIX_LIMITS.txidDynamicMax) {
    errors.push("LIMIT_TXID_MAX");
  }
  if (limits.e2eidLength !== PIX_LIMITS.e2eidLength) {
    errors.push("LIMIT_E2EID");
  }
  if (limits.pageMax !== PIX_LIMITS.pageMax) {
    errors.push("LIMIT_PAGE");
  }
  if (limits.webhookNotifiesOnlyWithTxid !== true) {
    errors.push("WEBHOOK_TXID_RULE");
  }
  return errors;
}
