import { describe, expect, it } from "vitest";
import {
  initialMembers, isMembersDataset, summarize, filterMembers, createMember,
  openAdmission, advanceAdmission, updateMemberNotes, setMemberCard,
  type Member,
} from "./church-synthetic";

function success(result: ReturnType<typeof createMember>): Member[] {
  if (!result.ok) throw new Error(result.message);
  return result.members;
}

describe("base operacional sintética da igreja", () => {
  it("oferece pessoas fictícias em estados diversos", () => {
    const people = initialMembers();
    expect(people).toHaveLength(19);
    expect(people.every((p) => p.email.endsWith("@example.test"))).toBe(true);
    expect(summarize(people)).toMatchObject({ total: 19, active: 11, pending: 4, visitors: 3, issued: 7 });
  });
  it("retorna clones independentes do seed", () => {
    const first = initialMembers();
    first[0].name = "Alterada";
    expect(initialMembers()[0].name).toBe("Marina Oliveira");
  });
  it("valida dados persistidos e bloqueia duplicidade de identificador", () => {
    expect(isMembersDataset(initialMembers())).toBe(true);
    const duplicate = initialMembers();
    duplicate[0] = { ...duplicate[0], id: duplicate[1].id };
    expect(isMembersDataset(duplicate)).toBe(false);
    expect(isMembersDataset([{ id: "x", name: "Incompleto" }])).toBe(false);
    expect(isMembersDataset(null)).toBe(false);
  });
  it("filtra nome, família e ministério sem diferenciar maiúsculas", () => {
    const rows = initialMembers();
    expect(filterMembers(rows, "  MARINA  ").map((p) => p.name)).toEqual(["Marina Oliveira"]);
    expect(filterMembers(rows, "LOUVOR")).toHaveLength(2);
    expect(filterMembers(rows, "", "VISITOR")).toHaveLength(3);
    expect(filterMembers(rows, "inexistente")).toHaveLength(0);
  });
});

describe("operações de cadastro", () => {
  const data = { name: " Pessoa Fictícia ", email: "PESSOA20@example.test", family: " Família Esperança ", phone: "" };
  it("inclui pessoa como visitante sem modificar o array original", () => {
    const before = initialMembers();
    const after = success(createMember(before, data, "RF1-0020"));
    expect(before).toHaveLength(19);
    expect(after).toHaveLength(20);
    expect(after.at(-1)).toMatchObject({
      name: "Pessoa Fictícia", email: "pessoa20@example.test",
      family: "Família Esperança", status: "VISITOR", card: "NONE",
    });
  });
  it.each(["", "ana@outlook.com", "ana@example.com"])("não permite e-mail real ou inválido: %s", (email) => {
    const result = createMember(initialMembers(), { ...data, email }, "RF1-0020");
    expect(result.ok).toBe(false);
  });
  it("recusa email duplicado em letras diferentes", () => {
    const result = createMember(initialMembers(), { ...data, email: "PESSOA01@EXAMPLE.TEST" }, "RF1-0020");
    expect(result).toMatchObject({ ok: false });
  });
  it("recusa identificador duplicado", () => {
    const result = createMember(initialMembers(), data, "RF1-0001");
    expect(result).toMatchObject({ ok: false });
  });
  it("permite salvar observações sintéticas sem alterar a pessoa original", () => {
    const before = initialMembers();
    const result = success(updateMemberNotes(before, "RF1-0001", "  Atendimento realizado  "));
    expect(result[0].notes).toBe("Atendimento realizado");
    expect(before[0].notes).toBe("");
  });
});

describe("admissão da Secretaria com aprovação pastoral", () => {
  it("abre protocolo apenas para visitante", () => {
    const original = initialMembers();
    const rows = success(openAdmission(original, "RF1-0016", "BATISMO"));
    expect(rows[15]).toMatchObject({ status: "PENDING_ADMISSION", stage: "DOCUMENTS", modality: "BATISMO" });
    expect(original[15].status).toBe("VISITOR");
    expect(openAdmission(rows, "RF1-0016", "BATISMO")).toMatchObject({ ok: false });
    expect(openAdmission(original, "RF1-0001", "BATISMO")).toMatchObject({ ok: false });
  });
  it("preserva ordem DOCUMENTS → SECRETARIA → PASTOR", () => {
    let rows = success(openAdmission(initialMembers(), "RF1-0016", "TRANSFERENCIA"));
    expect(advanceAdmission(rows, "RF1-0016", "PASTOR")).toMatchObject({ ok: false });
    rows = success(advanceAdmission(rows, "RF1-0016", "SECRETARIA"));
    expect(rows[15].stage).toBe("SECRETARIA");
    rows = success(advanceAdmission(rows, "RF1-0016", "SECRETARIA"));
    expect(rows[15].stage).toBe("PASTOR");
    expect(advanceAdmission(rows, "RF1-0016", "SECRETARIA")).toMatchObject({ ok: false });
    rows = success(advanceAdmission(rows, "RF1-0016", "PASTOR"));
    expect(rows[15]).toMatchObject({ status: "ACTIVE", stage: "COMPLETE" });
  });
  it("não autoriza emissões durante admissão pendente", () => {
    const rows = initialMembers();
    expect(setMemberCard(rows, "RF1-0012", "ISSUE")).toMatchObject({ ok: false });
    expect(setMemberCard(rows, "RF1-0016", "ISSUE")).toMatchObject({ ok: false });
  });
  it("não modifica pessoas inexistentes", () => {
    expect(openAdmission(initialMembers(), "RF1-9999", "BATISMO")).toMatchObject({ ok: false });
    expect(advanceAdmission(initialMembers(), "RF1-9999", "PASTOR")).toMatchObject({ ok: false });
  });
});

describe("carteirinhas sintéticas", () => {
  it("emite somente para membresia ativa e aprovada", () => {
    const rows = initialMembers();
    const issued = success(setMemberCard(rows, "RF1-0006", "ISSUE"));
    expect(issued[5].card).toBe("ACTIVE");
    expect(rows[5].card).toBe("NONE");
    expect(setMemberCard(issued, "RF1-0006", "ISSUE")).toMatchObject({ ok: false });
  });
  it("revoga apenas identificações ativas", () => {
    const rows = initialMembers();
    expect(setMemberCard(rows, "RF1-0006", "REVOKE")).toMatchObject({ ok: false });
    const revoked = success(setMemberCard(rows, "RF1-0001", "REVOKE"));
    expect(revoked[0].card).toBe("REVOKED");
    expect(setMemberCard(revoked, "RF1-0001", "REVOKE")).toMatchObject({ ok: false });
  });
  it("bloqueia emissão para membro inativo", () => {
    expect(setMemberCard(initialMembers(), "RF1-0019", "ISSUE")).toMatchObject({ ok: false });
  });
});
