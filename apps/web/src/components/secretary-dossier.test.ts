import { describe, expect, it, vi } from "vitest";
import {
  PATCHABLE_PERSON_FIELDS,
  REGULATED_PERSON_FIELDS,
  assertSupportedPatch,
  buildMembershipNotesPatch,
  buildPersonPatch,
  classifyDossierError,
  fichaReducer,
  initialFichaState,
  loadAdmissionDocuments,
  loadPersonDossier,
  savePersonDossier,
  toEditable,
  type DossierClient,
  type DossierVersions,
  type EditablePersonFields,
  type PersonDossier,
  type PersonPatchBody,
  type PersonRecord,
} from "./secretary-dossier";

const baseline: EditablePersonFields = {
  displayName: "Ana Demo",
  email: "ana.demo@example.test",
  isMinor: false,
  legalGuardianPersonId: "",
  householdId: "h-demo",
  notes: "observação fictícia",
};

const versions: DossierVersions = {
  personUpdatedAt: "2026-11-01T12:00:00.000Z",
  membershipId: "m-ana",
  membershipUpdatedAt: "2026-11-01T12:00:00.000Z",
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
    updatedAt: "2026-11-01T12:00:00.000Z",
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
    memberships: [{
      id: "m-ana",
      status: "ACTIVE",
      joinedAt: "2026-01-01T00:00:00.000Z",
      notes: "observação fictícia",
      updatedAt: "2026-11-01T12:00:00.000Z",
    }],
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

describe("contrato de PATCH da ficha 360", () => {
  it("grava nome, e-mail, menor, responsável, família e versão", () => {
    expect(PATCHABLE_PERSON_FIELDS).toEqual([
      "displayName",
      "email",
      "isMinor",
      "legalGuardianPersonId",
      "householdId",
      "expectedUpdatedAt",
    ]);
    expect(REGULATED_PERSON_FIELDS.map((field) => field.key)).toEqual(["status", "kind"]);
  });

  it("envia o campo alterado e a versão lida da API", () => {
    const patch = buildPersonPatch({ ...baseline, householdId: "h-exemplo" }, baseline, versions.personUpdatedAt);
    expect(patch).toEqual({
      householdId: "h-exemplo",
      expectedUpdatedAt: "2026-11-01T12:00:00.000Z",
    });
    expect(patch).not.toHaveProperty("notes");
    expect(patch).not.toHaveProperty("status");
  });

  it("grava nome e e-mail sintético e limpa e-mail vazio", () => {
    expect(buildPersonPatch({
      ...baseline,
      displayName: "  Ana   Demo 2 ",
      email: "ANA.NOVA@example.test",
    }, baseline, versions.personUpdatedAt)).toEqual({
      displayName: "Ana Demo 2",
      email: "ana.nova@example.test",
      expectedUpdatedAt: "2026-11-01T12:00:00.000Z",
    });
    expect(buildPersonPatch({ ...baseline, email: "  " }, baseline, null)).toEqual({ email: null });
  });

  it("não chama alteração quando nada mudou e normaliza vazio para nulo", () => {
    expect(buildPersonPatch(baseline, baseline, versions.personUpdatedAt)).toBeNull();
    expect(buildPersonPatch({
      ...baseline,
      legalGuardianPersonId: "  adult-1  ",
      householdId: "  ",
    }, baseline, versions.personUpdatedAt)).toEqual({
      legalGuardianPersonId: "adult-1",
      householdId: null,
      expectedUpdatedAt: "2026-11-01T12:00:00.000Z",
    });
  });

  it("manda a observação ao vínculo, com a versão do vínculo", () => {
    const notes = buildMembershipNotesPatch({ ...baseline, notes: "  nova observação  " }, baseline, versions);
    expect(notes).toEqual({
      membershipId: "m-ana",
      body: { notes: "nova observação", expectedUpdatedAt: "2026-11-01T12:00:00.000Z" },
    });
    expect(buildMembershipNotesPatch({ ...baseline, notes: "" }, baseline, versions)?.body.notes).toBeNull();
    expect(buildMembershipNotesPatch(baseline, baseline, versions)).toBeNull();
    expect(buildMembershipNotesPatch(
      { ...baseline, notes: "outra" },
      baseline,
      { ...versions, membershipId: null },
    )).toBeNull();
  });

  it("recusa situação, tipo e telefone mesmo que o chamador os force", () => {
    expect(() => assertSupportedPatch({ status: "INACTIVE" } as PersonPatchBody)).toThrow(/contrato de PATCH/);
    expect(() => assertSupportedPatch({ phone: "61999990000" } as PersonPatchBody)).toThrow(/contrato de PATCH/);
    expect(assertSupportedPatch({
      displayName: "Nome novo",
      expectedUpdatedAt: "2026-11-01T12:00:00.000Z",
    })).toEqual({
      displayName: "Nome novo",
      expectedUpdatedAt: "2026-11-01T12:00:00.000Z",
    });
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
    const conflict = classifyDossierError(new Error('{"statusCode":409,"message":"A ficha foi alterada por outra gravação. Reabra antes de salvar.","code":"PERSON_VERSION_CONFLICT"}'));
    expect(conflict.kind).toBe("conflict");
    expect(conflict.status).toBe(409);
    expect(conflict.message).not.toMatch(/409/);
    expect(conflict.message).toMatch(/outra gravação/);
    expect(conflict.message).not.toMatch(/sessão expirou/i);
    const validation = classifyDossierError(new Error(JSON.stringify({
      statusCode: 400,
      message: "Menor de idade exige responsável legal (legalGuardianPersonId)",
    })));
    expect(validation).toMatchObject({
      kind: "validation",
      message: "Menor de idade exige responsável legal",
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
    expect(next.form?.householdId).toBe("h-exemplo");
    expect(next.saveError).toBeNull();
    expect(next.refreshError?.message).toMatch(/Os dados foram salvos/);
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

  it("grava parcial da pessoa e conserva a observação que a API recusou", () => {
    const updated = person({ displayName: "Ana Demo 2", updatedAt: "2026-11-02T00:00:00.000Z" });
    const editing = fichaReducer(ready(), {
      type: "edit",
      form: { ...baseline, displayName: "Ana Demo 2", notes: "nota nova" },
    });
    const next = fichaReducer(editing, {
      type: "save-partial",
      person: updated,
      failure: { kind: "conflict", status: 409, message: "observação em conflito" },
    });
    expect(next.form?.displayName).toBe("Ana Demo 2");
    expect(next.form?.notes).toBe("nota nova");
    expect(next.baseline?.displayName).toBe("Ana Demo 2");
    expect(next.baseline?.notes).toBe("observação fictícia");
    expect(next.versions.personUpdatedAt).toBe("2026-11-02T00:00:00.000Z");
    expect(next.saveError?.kind).toBe("conflict");
  });
});

describe("cliente da ficha", () => {
  it("abre com GET da pessoa e do prontuário e não pede caso pastoral", async () => {
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
    expect(calls.some((path) => path.includes("pastoral"))).toBe(false);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.data.dossier.dependents).toEqual([]);
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("lista documentos pelo caminho existente e não inventa anexo quando a API recusa", async () => {
    const calls: string[] = [];
    const client: DossierClient = {
      get: (async (path: string) => {
        calls.push(path);
        if (path.includes("adm-2")) throw new Error('{"statusCode":403,"message":"Sem permissão para documentos de admissão"}');
        return { documents: [{ id: "doc-1", displayName: "comprovante-ficticio.pdf", contentType: "application/pdf", byteSize: 120, createdAt: "2026-11-01T00:00:00.000Z" }] };
      }) as DossierClient["get"],
      patch: vi.fn() as DossierClient["patch"],
    };
    const lists = await loadAdmissionDocuments(client, "t", ["adm-1", "adm-2"]);
    expect(calls).toEqual([
      "/admissions/adm-1/documents",
      "/admissions/adm-2/documents",
    ]);
    expect(lists[0]?.documents).toHaveLength(1);
    expect(lists[1]?.failure?.kind).toBe("forbidden");
    expect(lists[1]?.documents).toEqual([]);
  });

  it("propaga 403 de membro e líder e 404 sem inventar a ficha", async () => {
    const forbidden: DossierClient = {
      get: (async () => { throw new Error('{"statusCode":403,"message":"Sem permissão para consultar esta pessoa"}'); }) as DossierClient["get"],
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
    expect(denied).toMatchObject({ ok: false, failure: { kind: "forbidden", status: 403 } });
    expect(absent).toMatchObject({ ok: false, failure: { kind: "not_found" } });
  });

  it("salva nome na pessoa e observação no vínculo, depois relê o valor gravado", async () => {
    const record = person({ displayName: "Ana Demo 2", updatedAt: "2026-11-02T00:00:00.000Z" });
    const calls: Array<{ path: string; body: unknown }> = [];
    const store = { displayName: "Ana Demo", notes: "observação fictícia" };
    const client: DossierClient = {
      get: (async (path: string) => {
        if (path.endsWith("/dossier")) {
          return dossier(person({ displayName: store.displayName, updatedAt: "2026-11-02T00:00:00.000Z" }));
        }
        return person({ displayName: store.displayName, updatedAt: "2026-11-02T00:00:00.000Z" });
      }) as DossierClient["get"],
      patch: (async (path: string, _token: string, body: unknown) => {
        calls.push({ path, body });
        if (path.startsWith("/persons/")) {
          store.displayName = (body as { displayName: string }).displayName;
          return record;
        }
        store.notes = (body as { notes: string }).notes;
        return { id: "m-ana", notes: store.notes };
      }) as DossierClient["patch"],
    };
    const saved = await savePersonDossier(
      client,
      "t",
      "p-ana",
      { ...baseline, displayName: "Ana Demo 2", notes: "nota persistida" },
      baseline,
      versions,
    );
    expect(saved).toMatchObject({ ok: true, person: { displayName: "Ana Demo 2" } });
    expect(calls).toEqual([
      {
        path: "/persons/p-ana",
        body: {
          displayName: "Ana Demo 2",
          expectedUpdatedAt: "2026-11-01T12:00:00.000Z",
        },
      },
      {
        path: "/memberships/m-ana",
        body: {
          notes: "nota persistida",
          expectedUpdatedAt: "2026-11-01T12:00:00.000Z",
        },
      },
    ]);
    const reloaded = await loadPersonDossier(client, "t", "p-ana");
    expect(reloaded.ok && reloaded.data.person.displayName).toBe("Ana Demo 2");
    expect(store.notes).toBe("nota persistida");
  });

  it("recusa e-mail real antes de chamar a API e devolve 409 sem descartar o formulário", async () => {
    const patch = vi.fn();
    const client: DossierClient = {
      get: vi.fn() as DossierClient["get"],
      patch: patch as DossierClient["patch"],
    };
    const blocked = await savePersonDossier(
      client,
      "t",
      "p-ana",
      { ...baseline, email: "ana@igreja.example" },
      baseline,
      versions,
    );
    expect(blocked).toMatchObject({ ok: false, failure: { kind: "validation" } });
    expect(patch).not.toHaveBeenCalled();

    const unchanged = await savePersonDossier(client, "t", "p-ana", baseline, baseline, versions);
    expect(unchanged).toEqual({ ok: false, unchanged: true });

    const conflictClient: DossierClient = {
      get: vi.fn() as DossierClient["get"],
      patch: (async () => {
        throw new Error('{"statusCode":409,"message":"A ficha foi alterada por outra gravação. Reabra antes de salvar."}');
      }) as DossierClient["patch"],
    };
    const conflict = await savePersonDossier(
      conflictClient,
      "t",
      "p-elisa",
      { ...baseline, isMinor: true, legalGuardianPersonId: "adult-1" },
      baseline,
      versions,
    );
    expect(conflict).toMatchObject({ ok: false, failure: { kind: "conflict", status: 409 } });
    if (conflict.ok || !("failure" in conflict)) throw new Error("esperado conflito");
    const kept = fichaReducer(
      fichaReducer(ready(), { type: "edit", form: { ...baseline, displayName: "Ana Demo 2" } }),
      { type: "save-fail", failure: conflict.failure },
    );
    expect(kept.form?.displayName).toBe("Ana Demo 2");
  });

  it("reabre com os dados persistidos depois do save", () => {
    const updated = person({ displayName: "Ana Demo 2", householdId: "h-exemplo", isMinor: false });
    const reopened = fichaReducer(
      fichaReducer(ready(), { type: "save-ok", person: { ...updated, dedupeAlerts: [{ personId: "p-homonimo" }] } }),
      {
        type: "reopen-ok",
        context: "after-save",
        elapsedMs: 55,
        data: {
          person: updated,
          dossier: {
            ...dossier(updated),
            memberships: [{ ...dossier().memberships[0], notes: "nota persistida" }],
          },
        },
      },
    );
    expect(reopened.form?.displayName).toBe("Ana Demo 2");
    expect(reopened.form?.householdId).toBe("h-exemplo");
    expect(reopened.form?.notes).toBe("nota persistida");
    expect(reopened.baseline?.displayName).toBe("Ana Demo 2");
    expect(reopened.notice).toMatch(/salva e reaberta/);
    expect(reopened.notice).toMatch(/outro cadastro com o mesmo nome/);
    expect(reopened.saveError).toBeNull();
    expect(reopened.refreshError).toBeNull();
    expect(reopened.saveMs).toBe(55);
  });
});

describe("formulario a partir da ficha", () => {
  it("preenche os campos editáveis com o que a API devolveu", () => {
    expect(toEditable(person(), "observação fictícia")).toEqual(baseline);
    expect(ready().versions).toEqual(versions);
  });
});
