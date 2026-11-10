import { describe, expect, it } from "vitest";
import { financeApproval } from "./FinanceBoard";

describe("aprovação da tesouraria", () => {
  const entry = {
    status: "PENDING_APPROVAL",
    createdByUserId: "criador",
    firstApprovedByUserId: "",
  };

  it("impede o autor e exige outra pessoa na segunda aprovação", () => {
    expect(financeApproval("criador", entry).canApprove).toBe(false);
    expect(financeApproval("primeira", entry).canApprove).toBe(true);
    expect(financeApproval("primeira", { ...entry, firstApprovedByUserId: "primeira" }).canApprove).toBe(false);
    expect(financeApproval("segunda", { ...entry, firstApprovedByUserId: "primeira" }).text).toContain("segunda");
  });
});
