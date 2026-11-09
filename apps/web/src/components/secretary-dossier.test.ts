import { describe, expect, it, vi } from "vitest";
import {
  PATCHABLE_PERSON_FIELDS,
  UNSUPPORTED_PERSON_FIELDS,
  assertSupportedPatch,
  buildPersonPatch,
  classifyDossierError,
  fichaReducer,
  initialFichaState,
  loadPersonDossier,
  savePersonDossier,
  toEditable,
  type DossierClient,
  type EditablePersonFields,
  type PersonDossier,
  type PersonPatchBody,
  type PersonRecord,
} from "./secretary-dossier";

const baseline: EditablePersonFields = {
  isMinor: false,
  legalGuardianPersonId: "",
  householdId: "h-demo",
};

function person(overrides: Partial<PersonRecord> = {}): PersonRecord {
  return {
    id: "p-ana",
    displayName: "Ana Demo",
    email: "ana.demo@example.test",
    status: "ACTIVE",
    householdId: "h-demo",
    kind: "MEMBER",
    isMinor: false,
    legalGuardianPersonId: null,
    photo: { status: "NONE", hasStorageKey: false },
    ...overrides,
  };
}

function dossier(record = person()): PersonDossier {
  return {
    person: record,
    legalGuardian: null,
    dependents: [],
    household: { id: "h-demo", label: "Família Demo", members: [{ id: record.id, displayName: record.displayName, isMinor: false }] },
    memberships: [{ id: "m-ana", status: "ACTIVE", joinedAt: "2026-01-01T00:00:00.000Z", notes: "observação fictícia" }],
    admissionHistory: [],
  };
}

function ready(record = person()) {
  return fichaReducer(initialFichaState, {
    type: "load-ok",
    data: { person: record, dossier: dossier(record) },
    elapsedMs: 12,
  });
}

describe("contrato de PATCH da ficha", () => {
  it("grava somente menor, responsável e família", () => {
    expect(PATCHABLE_PERSON_FIELDS).toEqual(["isMinor", "legalGuardianPersonId", "householdId"]);
    expect(UNSUPPORTED_PERSON_FIELDS.map((field) => field.key)).toEqual([
      "displayName", "email", "status", "kind", "notes",
    ]);
  });

  it("envia apenas o campo permitido que mudou", () => {
    const patch = buildPersonPatch({ ...baseline, householdId: "h-exemplo" }, baseline);
    expect(patch).toEqual({ householdId: "h-exemplo" });
    expect(patch).not.toHaveProperty("displayName");
    expect(patch).not.toHaveProperty("email");
    expect(patch).not.toHaveProperty("notes");
  });

  it("não chama alteração quando nada mudou e normaliza vazio para nulo", () => {
    expect(buildPersonPatch(baseline, baseline)).toBeNull();
    expect(buildPersonPatch({ ...baseline, legalGuardianPersonId: "  adult-1  ", householdId: "  " }, baseline)).toEqual({
      legalGuardianPersonId: "adult-1",
      householdId: null,
    });
  });

  it("recusa campo fora do contrato mesmo que o chamador o force", () => {
    expect(() => assertSupportedPatch({ displayName: "Nome novo" } as PersonPatchBody)).toThrow(/contrato de PATCH/);
  });
});

describe("erros de abrir, salvar e reabrir", () => {
  it.each([
    [401, "session"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "conflict"],
    [400, "validation"],
  ] as const)("classifica status %s como %s", (status, kind) => {
    const error = new Error(JSON.stringify({
      statusCode: status,
      message: status === 404 ? "Pessoa não encontrada neste escopo" : "detalhe",
      error: "HTTP",
    }));
    expect(classifyDossierError(error)).toMatchObject({ kind, status });
  });

  it("diferencia conflito de sessão e preserva a mensagem de validação", () => {
    const conflict = classifyDossierError(new Error('{"statusCode":409,"message":"versão 409 da ficha"}'));
    expect(conflict.kind).toBe("conflict");
    expect(conflict.message).toMatch(/409/);
    expect(conflict.message).not.toMatch(/sessão expirou/i);
    const validation = classifyDossierError(new Error(JSON.stringify({
      statusCode: 400,
      message: "Menor de idade exige responsável legal (legalGuardianPersonId)",
    })));
    expect(validation).toMatchObject({
      kind: "validation",
      message: "Menor de idade exige responsável legal (legalGuardianPersonId)",
    });
    expect(classifyDossierError(new Error("jwt expired")).kind).toBe("session");
  });

  it("falha de save mantém o formulário e não marca falha de releitura", () => {
    const typed = { ...baseline, householdId: "h-exemplo", legalGuardianPersonId: "  adult-1" };
    const failure = classifyDossierError(new Error('{"statusCode":409,"message":"conflito"}'));
    const next = fichaReducer(
      fichaReducer(ready(), { type: "edit", form: typed }),
      { type: "save-fail", failure },
    );
    expect(next.form).toEqual(typed);
    expect(next.saveError?.kind).toBe("conflict");
    expect(next.refreshError).toBeNull();
    expect(next.phase).toBe("ready");
  });

  it("falha ao reabrir depois de gravar não apaga o valor confirmado nem vira falha de save", () => {
    const updated = person({ householdId: "h-exemplo" });
    const afterSave = fichaReducer(ready(), { type: "save-ok", person: updated });
    const next = fichaReducer(afterSave, {
      type: "reopen-fail",
      context: "after-save",
      elapsedMs: 40,
      failure: { kind: "unknown", status: 503, message: "releitura indisponível" },
    });
    expect(next.form).toEqual(toEditable(updated));
    expect(next.saveError).toBeNull();
    expect(next.refreshError?.message).toMatch(/não é falha de salvamento/);
    expect(next.refreshError?.message).toMatch(/releitura indisponível/);
  });

  it("reabertura manual que falha conserva o que foi digitado", () => {
    const typed = { ...baseline, isMinor: true, legalGuardianPersonId: "adult-9" };
    const editing = fichaReducer(ready(), { type: "edit", form: typed });
    const next = fichaReducer(fichaReducer(editing, { type: "reopening" }), {
      type: "reopen-fail",
      context: "manual",
      elapsedMs: 8,
      failure: { kind: "not_found", status: 404, message: "Pessoa não encontrada neste escopo" },
    });
    expect(next.form).toEqual(typed);
    expect(next.refreshError?.message).toMatch(/formulário digitado foi mantido/);
    expect(next.saveError).toBeNull();
  });
});

describe("cliente da ficha", () => {
  it("abre com GET da pessoa e do prontuário", async () => {
    const calls: string[] = [];
    const record = person();
    const client: DossierClient = {
      get: (async (path: string) => {
        calls.push(path);
        if (path.endsWith("/dossier")) return { ...dossier(record), dependents: undefined };
        return record;
      }) as DossierClient["get"],
      patch: vi.fn() as DossierClient["patch"],
    };
    const loaded = await loadPersonDossier(client, "token-teste", "p ana");
    expect(calls).toEqual(["/persons/p%20ana", "/persons/p%20ana/dossier"]);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.data.dossier.dependents).toEqual([]);
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("propaga 403 e 404 sem inventar a ficha", async () => {
    const forbidden: DossierClient = {
      get: (async () => { throw new Error('{"statusCode":403,"message":"Sem permissão"}'); }) as DossierClient["get"],
      patch: vi.fn() as DossierClient["patch"],
    };
    const missing: DossierClient = {
      get: (async (path: string) => {
        if (path.endsWith("/dossier")) return dossier();
        throw new Error('{"statusCode":404,"message":"Pessoa não encontrada neste escopo"}');
      }) as DossierClient["get"],
      patch: vi.fn() as DossierClient["patch"],
    };
    const denied = await loadPersonDossier(forbidden, "t", "p-davi");
    const absent = await loadPersonDossier(missing, "t", "p-clara");
    expect(denied).toMatchObject({ ok: false, failure: { kind: "forbidden" } });
    expect(absent).toMatchObject({ ok: false, failure: { kind: "not_found" } });
  });

  it("salva só o patch permitido e devolve conflito sem descartar a intenção", async () => {
    const record = person({ householdId: "h-exemplo" });
    const bodies: unknown[] = [];
    const patch = vi.fn(async (_path: string, _token: string, body: unknown) => {
      bodies.push(body);
      return record;
    });
    const client: DossierClient = {
      get: vi.fn() as DossierClient["get"],
      patch: patch as DossierClient["patch"],
    };
    const unchanged = await savePersonDossier(client, "t", "p-ana", baseline, baseline);
    expect(unchanged).toEqual({ ok: false, unchanged: true });
    expect(client.patch).not.toHaveBeenCalled();
    const saved = await savePersonDossier(
      client,
      "t",
      "p-ana",
      { ...baseline, householdId: "h-exemplo" },
      baseline,
    );
    expect(saved).toMatchObject({ ok: true, person: { householdId: "h-exemplo" } });
    expect(bodies).toEqual([{ householdId: "h-exemplo" }]);

    const conflictClient: DossierClient = {
      get: vi.fn() as DossierClient["get"],
      patch: (async () => { throw new Error('{"statusCode":409,"message":"conflito"}'); }) as DossierClient["patch"],
    };
    const conflict = await savePersonDossier(
      conflictClient,
      "t",
      "p-elisa",
      { ...baseline, isMinor: true, legalGuardianPersonId: "adult-1" },
      baseline,
    );
    expect(conflict).toMatchObject({ ok: false, failure: { kind: "conflict" } });
  });

  it("reabre com os dados persistidos depois do save", () => {
    const updated = person({ householdId: "h-exemplo", isMinor: false });
    const reopened = fichaReducer(ready(), {
      type: "reopen-ok",
      context: "after-save",
      elapsedMs: 55,
      data: { person: updated, dossier: dossier(updated) },
    });
    expect(reopened.form?.householdId).toBe("h-exemplo");
    expect(reopened.baseline?.householdId).toBe("h-exemplo");
    expect(reopened.notice).toMatch(/salva e reaberta/);
    expect(reopened.saveError).toBeNull();
    expect(reopened.refreshError).toBeNull();
    expect(reopened.saveMs).toBe(55);
  });
});
