import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PIX_LIMITS,
  SYNTHETIC_WEBHOOK_SECRET,
  acceptSignedWebhook,
  applyPixReceipt,
  applySettlementEvent,
  canPostToLedger,
  classifyByText,
  extractOfxExternalRefs,
  findSecretViolations,
  ingestStatementLines,
  inspectTxid,
  isDevolucaoId,
  isE2eid,
  parsePixValor,
  projectCardCycle,
  signWebhook,
  validateProviderCatalog,
} from "./contract.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));

test("limites do padrão Pix batem com o catálogo e não escolhem fornecedor", () => {
  const catalog = fixture("hipoteses-provedores.json");
  assert.deepEqual(validateProviderCatalog(catalog), []);
  assert.equal(catalog.pixApiLimits.txidStaticMax, PIX_LIMITS.txidStaticMax);
  assert.equal(catalog.pixApiLimits.infoPagadorMax, PIX_LIMITS.infoPagadorMax);
  assert.equal(catalog.pixApiLimits.pageDefault, PIX_LIMITS.pageDefault);
  assert.equal(catalog.pixApiLimits.devolucaoIdMax, PIX_LIMITS.devolucaoIdMax);
  assert.equal(catalog.pixApiLimits.webhookAuth, "mTLS");
  assert.equal(inspectTxid("SYNPIXCOB20261109000000001"), "DYNAMIC");
  assert.equal("SYNPIXCOB20261109000000001".length, 26);
  assert.equal(inspectTxid("A".repeat(25)), "STATIC");
  assert.equal(inspectTxid("A".repeat(36)), "INVALID");
  assert.equal(inspectTxid("***"), "ABSENT");
  assert.equal(inspectTxid(null), "ABSENT");
  assert.equal(isE2eid("E00000000202611091200SYNTHETIC01"), true);
  assert.equal("E00000000202611091200SYNTHETIC01".length, 32);
  assert.equal(isE2eid("E00000000202611091200SYNTHETIC0"), false);
  assert.equal(isDevolucaoId("SYNDEV202611090000000000000000001"), true);
  assert.equal(isDevolucaoId("SYNDEV-COM-HIFEN"), false);
  assert.equal(parsePixValor("50.00"), 5000);
  assert.equal(parsePixValor("50.001"), null);
  assert.equal(parsePixValor(50), null);
});

test("Pix com txid e valor iguais só sugere; replay do e2eid não credita de novo", () => {
  const pix = fixture("pix-eventos.json");
  const match = pix.events.find((event) => event.id === "match");
  assert.equal(parsePixValor(match.valor), match.amountCents);

  const first = applyPixReceipt({
    event: match,
    charges: pix.charges,
    seenE2eids: [],
  });
  assert.equal(first.decision.disposition, "SUGGESTED_BY_REFERENCE");
  assert.equal(first.decision.classification, "SUGGESTED");
  assert.equal(first.decision.ledgerPostingAllowed, false);
  assert.equal(first.decision.webhookWouldFire, true);
  assert.equal(first.decision.textHint, "UNTRUSTED_TEXT");
  assert.equal(canPostToLedger(first.decision.classification), false);
  assert.equal(first.charges[0].linkedE2eid, match.e2eid);

  const replay = applyPixReceipt({
    event: match,
    charges: first.charges,
    seenE2eids: first.seenE2eids,
  });
  assert.equal(replay.decision.disposition, "IDEMPOTENT_REPLAY");
  assert.equal(replay.charges[0].linkedE2eid, match.e2eid);
  assert.equal(replay.seenE2eids.length, 1);

  const secondMoney = applyPixReceipt({
    event: {
      ...match,
      e2eid: "E00000000202611091202SYNTHETIC02",
    },
    charges: first.charges,
    seenE2eids: first.seenE2eids,
  });
  assert.equal(secondMoney.decision.reason, "TXID_ALREADY_LINKED");
  assert.equal(secondMoney.decision.ledgerPostingAllowed, false);
  assert.equal(secondMoney.charges[0].linkedE2eid, match.e2eid);
});

test("valor divergente, txid ausente e texto livre ficam em revisão", () => {
  const pix = fixture("pix-eventos.json");
  const mismatch = pix.events.find((event) => event.id === "amount-mismatch");
  const divergent = applyPixReceipt({
    event: mismatch,
    charges: pix.charges,
    seenE2eids: [],
  });
  assert.equal(divergent.decision.reason, "AMOUNT_MISMATCH");
  assert.equal(divergent.charges[0].linkedE2eid, null);

  const noTxid = pix.events.find((event) => event.id === "no-txid");
  const unnamed = applyPixReceipt({
    event: noTxid,
    charges: pix.charges,
    seenE2eids: [],
  });
  assert.equal(unnamed.decision.reason, "NO_TXID");
  assert.equal(unnamed.decision.webhookWouldFire, false);
  assert.equal(unnamed.decision.classification, "REVIEW");
  assert.match(noTxid.infoPagador, /dizimo/i);

  const absent = pix.events.find((event) => event.id === "static-absent");
  const staticQr = applyPixReceipt({
    event: absent,
    charges: pix.charges,
    seenE2eids: [],
  });
  assert.equal(staticQr.decision.reason, "NO_TXID");
  assert.equal(staticQr.decision.webhookWouldFire, false);

  const byText = classifyByText("DIZIMO culto de domingo");
  assert.equal(byText.classification, "REVIEW");
  assert.equal(byText.ledgerPostingAllowed, false);
  assert.equal(canPostToLedger("SUGGESTED"), false);
  assert.equal(canPostToLedger("CONFIRMED_BY_TREASURER"), true);
});

test("e2eid inválido é rejeitado e não entra na caixa de idempotência", () => {
  const pix = fixture("pix-eventos.json");
  const result = applyPixReceipt({
    event: { ...pix.events[0], e2eid: "CURTO" },
    charges: pix.charges,
    seenE2eids: [],
  });
  assert.equal(result.decision.disposition, "REJECTED");
  assert.deepEqual(result.seenE2eids, []);
  assert.equal(result.decision.ledgerPostingAllowed, false);
});

test("OFX sintético preserva FITID e a reimportação não duplica a linha", () => {
  const ofx = readFileSync(join(root, "fixtures", "extrato-sintetico.ofx"), "utf8");
  const parsed = extractOfxExternalRefs(ofx);
  assert.deepEqual(
    parsed.map((line) => [line.externalRef, line.amountCents]),
    [
      ["SYN-OFX-PIX-001", 5000],
      ["SYN-OFX-CARD-001", 9750],
    ],
  );

  const sheet = fixture("extrato-linhas.json");
  const ingested = ingestStatementLines(
    sheet.existingExternalRefs,
    sheet.incoming,
  );
  assert.deepEqual(ingested.duplicates, ["SYN-OFX-PIX-001"]);
  assert.equal(ingested.accepted.length, 2);
  assert.equal(ingested.accepted[0].externalRef, "SYN-OFX-CARD-001");
  assert.equal(ingested.accepted[0].classification, "REVIEW");
  assert.equal(ingested.accepted[1].reason, "NO_EXTERNAL_REF");
  assert.equal(
    ingested.accepted.every((line) => line.ledgerPostingAllowed === false),
    true,
  );

  const firstPass = ingestStatementLines([], parsed);
  const secondPass = ingestStatementLines(
    firstPass.externalRefs,
    parsed,
  );
  assert.equal(firstPass.accepted.length, 2);
  assert.equal(secondPass.accepted.length, 0);
  assert.equal(secondPass.duplicates.length, 2);
});

test("cartão separa venda, recebível e liquidação sem apagar o bruto", () => {
  const card = fixture("cartao-ciclo.json");
  const plain = projectCardCycle(card.sale);
  assert.equal(plain.sale.grossCents, 10000);
  assert.equal(plain.totals.mdrCents, 250);
  assert.equal(plain.totals.anticipationFeeCents, 0);
  assert.equal(plain.totals.netCents, 9750);
  assert.deepEqual(
    plain.receivables.map((row) => row.netCents),
    [4875, 4875],
  );

  const early = projectCardCycle(card.sale, {
    anticipateInstallments: card.anticipation.installments,
    anticipationFeeCentsByInstallment: { 2: 50 },
  });
  assert.equal(early.sale.grossCents, 10000);
  assert.equal(early.receivables[1].status, "ANTICIPATED");
  assert.equal(early.receivables[1].anticipationFeeCents, 50);
  assert.equal(early.totals.netCents, 9700);
  assert.equal(early.totals.mdrCents + early.totals.anticipationFeeCents, 300);

  const payout = card.settlementWithoutAnticipation;
  let state = { events: [], payouts: [] };
  const beforeSale = applySettlementEvent({
    state,
    receivables: [],
    event: {
      eventId: payout.eventId,
      payout: {
        id: payout.payoutId,
        netCents: payout.netCents,
        receivableIds: payout.receivableIds,
      },
    },
  });
  assert.equal(beforeSale.effect, "UNMATCHED");
  assert.equal(beforeSale.state.payouts.length, 1);
  state = beforeSale.state;

  const replay = applySettlementEvent({
    state,
    receivables: plain.receivables,
    event: {
      eventId: payout.eventId,
      payout: {
        id: payout.payoutId,
        netCents: payout.netCents,
        receivableIds: payout.receivableIds,
      },
    },
  });
  assert.equal(replay.effect, "IDEMPOTENT_REPLAY");
  assert.equal(replay.state, state);

  const linked = applySettlementEvent({
    state,
    receivables: plain.receivables,
    event: {
      eventId: "SYN-EVT-PAYOUT-0001-RETRY",
      payout: {
        id: payout.payoutId,
        netCents: payout.netCents,
        receivableIds: payout.receivableIds,
      },
    },
  });
  assert.equal(linked.effect, "SUGGESTED");
  assert.equal(linked.ledgerPostingAllowed, false);
  assert.equal(linked.grossPreservedCents, 10000);
  assert.equal(linked.state.payouts.length, 1);
  assert.equal(linked.state.payouts[0].netCents, 9750);

  const doubled = applySettlementEvent({
    state: linked.state,
    receivables: plain.receivables,
    event: {
      eventId: "SYN-EVT-PAYOUT-0001-DUP",
      payout: {
        id: payout.payoutId,
        netCents: payout.netCents,
        receivableIds: payout.receivableIds,
      },
    },
  });
  assert.equal(doubled.effect, "REVIEW");
  assert.equal(doubled.reason, "PAYOUT_ALREADY_LINKED");
  assert.equal(doubled.state.payouts.length, 1);
  assert.equal(doubled.state.payouts[0].netCents, 9750);

  const anticipated = applySettlementEvent({
    state: { events: [], payouts: [] },
    receivables: early.receivables,
    event: {
      eventId: card.settlementWithAnticipation.eventId,
      payout: {
        id: card.settlementWithAnticipation.payoutId,
        netCents: card.settlementWithAnticipation.netCents,
        receivableIds: card.settlementWithAnticipation.receivableIds,
      },
    },
  });
  assert.equal(anticipated.effect, "SUGGESTED");
  assert.equal(anticipated.grossPreservedCents, 10000);
  assert.equal(anticipated.state.payouts[0].netCents, 9700);
});

test("liquidação com líquido divergente não vira saldo", () => {
  const card = fixture("cartao-ciclo.json");
  const plain = projectCardCycle(card.sale);
  const result = applySettlementEvent({
    state: { events: [], payouts: [] },
    receivables: plain.receivables,
    event: {
      eventId: "SYN-EVT-PAYOUT-DIFF",
      payout: {
        id: "SYN-PAYOUT-DIFF",
        netCents: 9749,
        receivableIds: card.settlementWithoutAnticipation.receivableIds,
      },
    },
  });
  assert.equal(result.effect, "REVIEW");
  assert.equal(result.reason, "NET_MISMATCH");
  assert.equal(result.state.payouts[0].netCents, null);
  assert.equal(result.ledgerPostingAllowed, false);
});

test("webhook assinado é idempotente e assinatura errada não entra na caixa", () => {
  const eventId = "SYN-EVT-PIX-0001";
  const resourceId = "E00000000202611091200SYNTHETIC01";
  const status = "RECEIVED";
  const signature = signWebhook({
    secret: SYNTHETIC_WEBHOOK_SECRET,
    eventId,
    resourceId,
    status,
  });
  const first = acceptSignedWebhook({
    secret: SYNTHETIC_WEBHOOK_SECRET,
    eventId,
    resourceId,
    status,
    signature,
    inbox: [],
  });
  assert.equal(first.accepted, true);
  assert.equal(first.idempotentReplay, false);

  const replay = acceptSignedWebhook({
    secret: SYNTHETIC_WEBHOOK_SECRET,
    eventId,
    resourceId,
    status,
    signature,
    inbox: first.inbox,
  });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.inbox, undefined);

  const forged = acceptSignedWebhook({
    secret: SYNTHETIC_WEBHOOK_SECRET,
    eventId,
    resourceId,
    status,
    signature: "00".repeat(32),
    inbox: first.inbox,
  });
  assert.equal(forged.accepted, false);
  assert.equal(forged.reason, "BAD_SIGNATURE");
  assert.deepEqual(first.inbox, [eventId]);
});

test("fixtures não carregam segredo e o contrato não abre rede", () => {
  const names = [
    "hipoteses-provedores.json",
    "pix-eventos.json",
    "extrato-linhas.json",
    "cartao-ciclo.json",
  ];
  for (const name of names) {
    const body = fixture(name);
    assert.deepEqual(findSecretViolations(body), [], name);
    assert.equal(body.synthetic, true);
  }
  const ofx = readFileSync(join(root, "fixtures", "extrato-sintetico.ofx"), "utf8");
  assert.equal(findSecretViolations(ofx).length, 0);
  assert.doesNotMatch(ofx, /BEGIN CERTIFICATE/);
  const source = readFileSync(join(root, "contract.mjs"), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /https?\.request/);
  assert.doesNotMatch(source, /@prisma\/client/);
  assert.doesNotMatch(source, /from\s+["'][^"']*prisma/);
  assert.match(source, /synthetic-webhook-not-a-credential/);
});
