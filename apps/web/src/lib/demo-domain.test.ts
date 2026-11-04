import { describe, expect, it } from "vitest";
import {
  STEP_ORDER, beginAdmission, advanceAdmission, createVisitor, isEligible,
  isPersonList, nextStep, seed, selectVisible, setCredential,
  type Person, type Role, type Step,
} from "./demo-domain";

function existing(id: string): Person {
  const person = seed().find((p) => p.id === id);
  if (!person) throw new Error("Fixture ausente: " + id);
  return person;
}
function success<T>(result: { ok: true; value: T } | { ok: false; code: string }): T {
  if (!result.ok) throw new Error("Operação falhou: " + result.code);
  return result.value;
}

describe("Demo F2: dados e imutabilidade", () => {
  it("inicia com quatro pessoas exclusivamente fictícias", () => {
    const people = seed();
    expect(people).toHaveLength(4);
    expect(people.every((p) => p.email.endsWith(".test"))).toBe(true);
  });
  it("retorna cópias independentes para evitar mutações entre resets", () => {
    const a = seed();
    const b = seed();
    a[0].checklist.pastor = false;
    a[0].name = "Alterado";
    expect(b[0].checklist.pastor).toBe(true);
    expect(b[0].name).toBe("Ana Demo");
  });
  it("não altera a fonte original ao iniciar um protocolo", () => {
    const visitor = existing("p-003");
    const result = success(beginAdmission(visitor, "SECRETARIA", "BATISMO"));
    expect(visitor.status).toBe("VISITOR");
    expect(result.status).toBe("PENDING_ADMISSION");
    expect(result.checklist).not.toBe(visitor.checklist);
  });
});

describe("Demo F2: persistência local", () => {
  it("aceita somente registros completos, com campos válidos", () => {
    expect(isPersonList(seed())).toBe(true);
    expect(isPersonList([])).toBe(true);
  });
  it.each([
    null,
    { people: [] },
    [{ id: "1", name: "Sem dados" }],
    [{ ...existing("p-001"), checklist: null }],
    [{ ...existing("p-001"), checklist: { modality: true } }],
    [{ ...existing("p-001"), status: "UNKNOWN" }],
    [{ ...existing("p-001"), credential: "PENDING" }],
    [{ ...existing("p-001"), modality: "INVENTADO" }],
    [{ ...existing("p-001"), email: 7 }],
    [{ ...existing("p-001"), name: "" }],
    Array.from({ length: 201 }, (_, i) => ({ ...existing("p-001"), id: String(i) })),
  ])("rejeita estrutura malformada no armazenamento %#", (value) => {
    expect(isPersonList(value)).toBe(false);
  });
});

describe("Demo F2: visibilidade ilustrativa por perfil", () => {
  it.each(["SECRETARIA", "PASTOR"] as Role[])("%s consulta nomes e famílias", (role) => {
    expect(selectVisible(seed(), role, "Família Exemplo")).toHaveLength(2);
  });
  it("faz pesquisa sem diferenciar maiúsculas e espaços laterais", () => {
    expect(selectVisible(seed(), "SECRETARIA", "  ANA  ").map((p) => p.id)).toEqual(["p-001"]);
  });
  it("membro visualiza apenas a pessoa fictícia vinculada, mesmo pesquisando", () => {
    expect(selectVisible(seed(), "MEMBRO", "Ana").map((p) => p.id)).toEqual(["p-002"]);
    expect(selectVisible(seed(), "MEMBRO", "", "p-inexistente")).toEqual([]);
  });
});

describe("Demo F2: cadastro de visitante", () => {
  it("cadastra visitante com nome, email e família tratados", () => {
    const base = seed();
    const people = success(createVisitor(base, "SECRETARIA", {
      name: "  Elisa Exemplo  ", email: "  ELISA@EXAMPLE.TEST  ", household: "  Família E  ",
    }, "p-005"));
    expect(people).toHaveLength(5);
    expect(base).toHaveLength(4);
    expect(people[4]).toMatchObject({
      id: "p-005", name: "Elisa Exemplo", email: "elisa@example.test",
      household: "Família E", status: "VISITOR", credential: "NONE",
    });
    expect(nextStep(people[4])).toBe("modality");
  });
  it("permite email vazio e define família padrão", () => {
    const people = success(createVisitor(seed(), "SECRETARIA", {
      name: "Nome Fictício", email: "", household: "",
    }, "p-005"));
    expect(people[4].household).toBe("Sem família vinculada");
  });
  it.each(["PASTOR", "MEMBRO"] as Role[])("bloqueia inclusão pelo perfil %s", (role) => {
    const result = createVisitor(seed(), role, { name: "Nome", email: "", household: "" }, "p-005");
    expect(result).toEqual({ ok: false, code: "ROLE_REQUIRED" });
  });
  it("detecta email repetido apesar de caixa e espaços", () => {
    const result = createVisitor(seed(), "SECRETARIA", {
      name: "Outro", email: "  ANA@EXAMPLE.TEST ", household: "",
    }, "p-006");
    expect(result).toEqual({ ok: false, code: "DUPLICATE_EMAIL" });
  });
  it.each([
    { name: " ", email: "" },
    { name: "Maria", email: "email-invalido" },
  ])("recusa dados inválidos: %#", (input) => {
    expect(createVisitor(seed(), "SECRETARIA", { ...input, household: "" }, "p-010")).toMatchObject({ ok: false, code: "INVALID_PERSON" });
  });
  it("recusa ID já utilizado", () => {
    expect(createVisitor(seed(), "SECRETARIA", { name: "Outra pessoa", email: "", household: "" }, "p-001"))
      .toEqual({ ok: false, code: "INVALID_PERSON" });
  });
});

describe("Demo F2: jornada de admissão", () => {
  it("preserva a ordem formal do checklist", () => {
    expect(STEP_ORDER).toEqual(["modality", "documents", "secretaria", "pastor"]);
  });
  it("a Secretaria abre protocolo para visitante", () => {
    const person = success(beginAdmission(existing("p-003"), "SECRETARIA", "TRANSFERENCIA"));
    expect(person.modality).toBe("TRANSFERENCIA");
    expect(person.status).toBe("PENDING_ADMISSION");
    expect(person.checklist).toEqual({ modality: true, documents: false, secretaria: false, pastor: false });
    expect(nextStep(person)).toBe("documents");
  });
  it.each(["MEMBRO", "PASTOR"] as Role[])("não permite abrir protocolo com perfil %s", (role) => {
    expect(beginAdmission(existing("p-003"), role, "BATISMO")).toEqual({ ok: false, code: "ROLE_REQUIRED" });
  });
  it("não inicia admissão para membro já ativo", () => {
    expect(beginAdmission(existing("p-001"), "SECRETARIA", "BATISMO")).toEqual({ ok: false, code: "INVALID_STATE" });
  });
  it("não reinicia protocolo já iniciado", () => {
    expect(beginAdmission(existing("p-004"), "SECRETARIA", "BATISMO")).toEqual({ ok: false, code: "INVALID_STATE" });
  });
  it("não aprova pastor antes da Secretaria", () => {
    expect(advanceAdmission(existing("p-004"), "PASTOR", "pastor")).toEqual({ ok: false, code: "STEP_LOCKED" });
  });
  it("não permite concluir modalidade pela ação de avanço", () => {
    const p = existing("p-003");
    expect(advanceAdmission(p, "SECRETARIA", "modality")).toEqual({ ok: false, code: "INVALID_STATE" });
  });
  it("documentos são conferidos pela Secretaria", () => {
    const p = success(beginAdmission(existing("p-003"), "SECRETARIA", "BATISMO"));
    expect(advanceAdmission(p, "PASTOR", "documents")).toEqual({ ok: false, code: "ROLE_REQUIRED" });
    const next = success(advanceAdmission(p, "SECRETARIA", "documents"));
    expect(next.checklist.documents).toBe(true);
    expect(nextStep(next)).toBe("secretaria");
    expect(p.checklist.documents).toBe(false);
  });
  it("bloqueia aprovação pastoral por membro ou Secretaria", () => {
    const p = success(advanceAdmission(existing("p-004"), "SECRETARIA", "secretaria"));
    expect(advanceAdmission(p, "SECRETARIA", "pastor")).toEqual({ ok: false, code: "ROLE_REQUIRED" });
    expect(advanceAdmission(p, "MEMBRO", "pastor")).toEqual({ ok: false, code: "ROLE_REQUIRED" });
  });
  it("apenas o Pastor conclui a admissão, tornando a membresia ativa", () => {
    const p = success(advanceAdmission(existing("p-004"), "SECRETARIA", "secretaria"));
    const approved = success(advanceAdmission(p, "PASTOR", "pastor"));
    expect(approved.status).toBe("ACTIVE");
    expect(approved.checklist.pastor).toBe(true);
    expect(nextStep(approved)).toBeNull();
    expect(isEligible(approved)).toBe(true);
  });
  it("não permite nova alteração de um protocolo já aprovado", () => {
    const p = success(advanceAdmission(success(advanceAdmission(existing("p-004"), "SECRETARIA", "secretaria")), "PASTOR", "pastor"));
    expect(advanceAdmission(p, "PASTOR", "pastor")).toEqual({ ok: false, code: "INVALID_STATE" });
  });
  it("ignora registro inexistente sem alterar dados", () => {
    expect(beginAdmission(undefined, "SECRETARIA", "BATISMO")).toEqual({ ok: false, code: "INVALID_STATE" });
    expect(advanceAdmission(undefined, "PASTOR", "pastor")).toEqual({ ok: false, code: "INVALID_STATE" });
  });
});

describe("Demo F2: emissão e revogação de carteirinha", () => {
  it("não habilita emissão para visitante ou admissão pendente", () => {
    for (const id of ["p-003", "p-004"]) {
      expect(isEligible(existing(id))).toBe(false);
      expect(setCredential(existing(id), "SECRETARIA", "ACTIVE")).toEqual({ ok: false, code: "NOT_ELIGIBLE" });
    }
  });
  it("não basta ACTIVE sem aprovações", () => {
    const forged: Person = { ...existing("p-001"), checklist: { ...existing("p-001").checklist, pastor: false } };
    expect(isEligible(forged)).toBe(false);
    expect(setCredential(forged, "SECRETARIA", "ACTIVE")).toEqual({ ok: false, code: "NOT_ELIGIBLE" });
  });
  it.each(["PASTOR", "MEMBRO"] as Role[])("impede emissão pelo perfil %s", (role) => {
    expect(setCredential(existing("p-001"), role, "ACTIVE")).toEqual({ ok: false, code: "ROLE_REQUIRED" });
  });
  it("Secretaria emite para membro aprovado", () => {
    const initial = existing("p-001");
    const result = success(setCredential(initial, "SECRETARIA", "ACTIVE"));
    expect(result.credential).toBe("ACTIVE");
    expect(result.token).toMatch(/^IDBRF-DEMO-/);
    expect(initial.credential).toBe("NONE");
  });
  it("não permite emitir uma segunda carteirinha já ativa", () => {
    expect(setCredential(existing("p-002"), "SECRETARIA", "ACTIVE")).toEqual({ ok: false, code: "CARD_ALREADY_ACTIVE" });
  });
  it("revoga apenas uma carteirinha ativa", () => {
    expect(setCredential(existing("p-001"), "SECRETARIA", "REVOKED")).toEqual({ ok: false, code: "CARD_NOT_ACTIVE" });
    const revoked = success(setCredential(existing("p-002"), "SECRETARIA", "REVOKED"));
    expect(revoked.credential).toBe("REVOKED");
    expect(revoked.token).toBe(existing("p-002").token);
    expect(setCredential(revoked, "SECRETARIA", "REVOKED")).toEqual({ ok: false, code: "CARD_NOT_ACTIVE" });
  });
  it("não permite revogar como membro", () => {
    expect(setCredential(existing("p-002"), "MEMBRO", "REVOKED")).toEqual({ ok: false, code: "ROLE_REQUIRED" });
  });
  it("permite reemitir após revogação com membresia ainda aprovada", () => {
    const p = success(setCredential(existing("p-002"), "SECRETARIA", "REVOKED"));
    expect(success(setCredential(p, "SECRETARIA", "ACTIVE")).credential).toBe("ACTIVE");
  });
  it("rejeita pessoa inexistente", () => {
    expect(setCredential(undefined, "SECRETARIA", "ACTIVE")).toEqual({ ok: false, code: "INVALID_PERSON" });
  });
});

describe("Demo F2: fluxo completo da jornada", () => {
  it("da visitante fictícia até a emissão e revogação com papéis específicos", () => {
    let person = existing("p-003");
    person = success(beginAdmission(person, "SECRETARIA", "BATISMO"));
    expect(setCredential(person, "SECRETARIA", "ACTIVE")).toMatchObject({ ok: false });
    for (const step of ["documents", "secretaria"] as Step[]) {
      person = success(advanceAdmission(person, "SECRETARIA", step));
    }
    expect(setCredential(person, "SECRETARIA", "ACTIVE")).toMatchObject({ ok: false });
    person = success(advanceAdmission(person, "PASTOR", "pastor"));
    person = success(setCredential(person, "SECRETARIA", "ACTIVE"));
    expect(person.credential).toBe("ACTIVE");
    person = success(setCredential(person, "SECRETARIA", "REVOKED"));
    expect(person.credential).toBe("REVOKED");
  });
});
