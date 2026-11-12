import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formatBRL } from "../lib/das-operations";
import { TreasuryPanel, TreasuryPositionCards, approvalCopy, type TreasuryPosition } from "./TreasuryPanel";

const original = process.env.NEXT_PUBLIC_HML_ENABLED;

const position: TreasuryPosition = {
  receivedRevenueCents: 10000,
  receivableOpenCents: 0,
  settledCashCents: 10000,
  committedExpenseCents: 5000,
  availableCents: 5000,
  grossRevenueCents: 10000,
  feeCents: 0,
  netRevenueCents: 10000,
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_HML_ENABLED = "true";
});

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_HML_ENABLED;
  else process.env.NEXT_PUBLIC_HML_ENABLED = original;
});

describe("TreasuryPanel", () => {
  it("não publica saldo antes da consulta", () => {
    const html = renderToStaticMarkup(<TreasuryPanel />);
    expect(html).toContain("Consultando lançamentos");
    expect(html).not.toContain("Dados de teste");
    expect(html).not.toContain("R$");
    expect(html).not.toContain("Sem consulta");
  });

  it("não oferece gravação quando a homologação da interface está desligada", () => {
    process.env.NEXT_PUBLIC_HML_ENABLED = "false";
    const html = renderToStaticMarkup(<TreasuryPanel />);
    expect(html).not.toContain("Gravar rascunho");
    expect(html).toContain("Nenhum valor foi exibido");
    expect(html).toContain("disabled");
    expect(html).not.toContain("R$");
  });

  it("falha da API não vira zero", () => {
    const html = renderToStaticMarkup(
      <TreasuryPositionCards state={{ kind: "error", message: "A posição não foi consultada." }} />,
    );
    expect(html).toContain("Nenhum valor foi exibido");
    expect(html).not.toContain("R$");
    expect(html).not.toContain("0,00");
  });

  it("posição pronta mostra inclusive o zero consultado", () => {
    const html = renderToStaticMarkup(<TreasuryPositionCards state={{ kind: "ready", position }} />);
    expect(html).toContain(formatBRL(10000));
    expect(html).toContain(formatBRL(0));
    expect(html).toContain(formatBRL(5000));
    expect(html).not.toContain("Sem consulta");
  });

  it("separa quem pode aprovar", () => {
    const pending = {
      id: "e1",
      entryDate: "2026-11-02",
      description: "Oferta",
      status: "PENDING_APPROVAL",
      amountCents: 25000,
      createdByUserId: "criador",
      firstApprovedByUserId: null,
    };
    expect(approvalCopy("criador", pending).canApprove).toBe(false);
    expect(approvalCopy("outra", pending).canApprove).toBe(true);
    expect(approvalCopy("primeira", { ...pending, firstApprovedByUserId: "primeira" }).canApprove).toBe(false);
    expect(approvalCopy("segunda", { ...pending, firstApprovedByUserId: "primeira" }).canApprove).toBe(true);
  });
});
