import { HttpException, HttpStatus } from "@nestjs/common";
import { AdmissionsService } from "./admissions.service";
import type { AuthUser } from "../auth/types/auth-user";

const pilot = {
  organizationId: "org1",
  churchId: "church-rf1",
  organizationSlug: "igreja-de-deus",
  churchSlug: "riacho-fundo-1",
  churchName: "Riacho Fundo I (demo)",
};

const secretaria: AuthUser = {
  userId: "u-sec",
  personId: "p-sec",
  email: "ana.demo@example.test",
  grants: [
    {
      roleCode: "SECRETARIA",
      organizationId: "org1",
      churchId: "church-rf1",
    },
  ],
};

const pastor: AuthUser = {
  userId: "u-pas",
  personId: "p-pas",
  email: "paulo.demo@example.test",
  grants: [
    {
      roleCode: "PASTOR",
      organizationId: "org1",
      churchId: "church-rf1",
    },
  ],
};

const member: AuthUser = {
  userId: "u-mem",
  personId: "p-mem",
  email: "bruno.demo@example.test",
  grants: [
    {
      roleCode: "MEMBRO",
      organizationId: "org1",
      churchId: "church-rf1",
    },
  ],
};

const otherChurch: AuthUser = {
  userId: "u-other",
  personId: "p-other",
  email: "other.demo@example.test",
  grants: [
    {
      roleCode: "SECRETARIA",
      organizationId: "org1",
      churchId: "church-other",
    },
  ],
};

interface Row {
  id: string;
  [key: string]: unknown;
}

function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) {
    return true;
  }
  return Object.entries(where).every(([key, expected]) => {
    if (
      expected &&
      typeof expected === "object" &&
      !Array.isArray(expected) &&
      !(expected instanceof Date)
    ) {
      const cond = expected as Record<string, unknown>;
      if (Array.isArray(cond.in)) {
        return cond.in.includes(row[key]);
      }
      if (Array.isArray(cond.notIn)) {
        return !cond.notIn.includes(row[key]);
      }
      if ("not" in cond) {
        return row[key] !== cond.not;
      }
    }
    return row[key] === expected;
  });
}

function createHarness() {
  const persons: Row[] = [];
  const memberships: Row[] = [];
  const admissions: Row[] = [];
  const households: Row[] = [
    {
      id: "hh1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      label: "Família Demo",
    },
  ];
  const audits: Array<Record<string, unknown>> = [];
  let n = 1;
  const nextId = (prefix: string) => `${prefix}_${n++}`;

  function attach(row: Row) {
    const membership =
      memberships.find((item) => item.id === row.membershipId) ?? null;
    return { ...row, membership };
  }

  const api = {
    person: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        persons.find((row) => matches(row, where)) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = {
          status: "ACTIVE",
          email: null,
          householdId: null,
          ...data,
          id: nextId("per"),
        };
        persons.push(row);
        return row;
      },
    },
    household: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        households.find((row) => matches(row, where)) ?? null,
    },
    churchMembership: {
      findUnique: async ({
        where,
      }: {
        where: { personId_churchId: { personId: string; churchId: string } };
      }) =>
        memberships.find(
          (row) =>
            row.personId === where.personId_churchId.personId &&
            row.churchId === where.personId_churchId.churchId,
        ) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = {
          status: "PENDING_ADMISSION",
          ...data,
          id: nextId("mem"),
        };
        memberships.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = memberships.find((item) => item.id === where.id);
        if (!row) {
          throw new Error("membership missing");
        }
        Object.assign(row, data);
        return row;
      },
    },
    admission: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = admissions.find((item) => matches(item, where));
        return row ? attach(row) : null;
      },
      findMany: async ({
        where,
      }: {
        where: Record<string, unknown>;
      }) =>
        admissions
          .filter((row) => matches(row, where))
          .map((row) => attach(row))
          .reverse(),
      create: async ({ data }: { data: Row }) => {
        const now = new Date();
        const row: Row = {
          modality: null,
          notes: null,
          modalityRecordedAt: null,
          documentsCompletedAt: null,
          secretariaDecidedAt: null,
          pastorDecidedAt: null,
          rejectionReason: null,
          createdAt: now,
          updatedAt: now,
          ...data,
          id: nextId("adm"),
        };
        admissions.push(row);
        return attach(row);
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = admissions.find((item) => item.id === where.id);
        if (!row) {
          throw new Error("admission missing");
        }
        Object.assign(row, data, { updatedAt: new Date() });
        return attach(row);
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: object) => Promise<unknown>) => fn(api),
  };

  const service = new AdmissionsService(
    api as never,
    { getPilotChurch: async () => pilot } as never,
  );

  return { service, persons, memberships, admissions, audits };
}

function bodyOf(error: unknown): {
  statusCode: number;
  code?: string;
  message: string;
} {
  expect(error).toBeInstanceOf(HttpException);
  const response = (error as HttpException).getResponse();
  return response as { statusCode: number; code?: string; message: string };
}

describe("AdmissionsService", () => {
  it("opens on documents when modality is informed and blocks skipping", async () => {
    const { service, memberships } = createHarness();
    const opened = await service.create(secretaria, {
      displayName: "Visitante Demo",
      email: "visitante.demo@example.test",
      modality: "BATISMO",
    });

    expect(opened.status).toBe("AWAITING_DOCUMENTS");
    expect(opened.currentStep).toBe("documents");
    expect(opened.credentialEligible).toBe(false);
    expect(opened.checklist.modalityRecorded).toBe(true);
    expect(memberships[0]?.status).toBe("PENDING_ADMISSION");

    await expect(
      service.advance(secretaria, opened.id, {
        completeStep: "pastor",
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    try {
      await service.advance(secretaria, opened.id, {
        completeStep: "pastor",
        decision: "APPROVE",
      });
      throw new Error("deveria falhar");
    } catch (error) {
      const body = bodyOf(error);
      expect(body.statusCode).toBe(409);
      expect(body.code).toBe("ADMISSION_STEP_LOCKED");
    }
  });

  it("walks modality to pastoral approval and then allows the card gate", async () => {
    const { service, memberships, audits } = createHarness();
    const opened = await service.create(secretaria, {
      displayName: "Visitante Demo",
      modality: "BATISMO",
    });

    const documents = await service.advance(secretaria, opened.id, {
      completeStep: "documents",
    });
    expect(documents.status).toBe("AWAITING_SECRETARIA");
    expect(documents.currentStep).toBe("secretaria");

    await expect(
      service.advance(pastor, documents.id, {
        completeStep: "secretaria",
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });

    const queued = await service.advance(secretaria, documents.id, {
      completeStep: "secretaria",
      decision: "APPROVE",
      notes: "Documentos conferidos",
    });
    expect(queued.status).toBe("AWAITING_PASTOR");
    expect(queued.credentialEligible).toBe(false);

    await expect(
      service.advance(secretaria, queued.id, {
        completeStep: "pastor",
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });

    const approved = await service.advance(pastor, queued.id, {
      completeStep: "pastor",
      decision: "APPROVE",
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.checklist.pastorApproved).toBe(true);
    expect(approved.credentialEligible).toBe(true);
    expect(approved.currentStep).toBe("pastor");
    expect(memberships[0]?.status).toBe("ACTIVE");
    expect(audits.map((entry) => entry.action)).toEqual([
      "admission.create",
      "admission.advance",
      "admission.secretaria_approve",
      "admission.pastor_approve",
    ]);
    expect(audits.at(-1)?.actorUserId).toBe(pastor.userId);

    const again = service.advance(pastor, approved.id, {
      completeStep: "pastor",
      decision: "APPROVE",
    });
    await expect(again).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
  });

  it("keeps membership pending and credentialEligible false when the pastor rejects", async () => {
    const { service, memberships, audits } = createHarness();
    let current = await service.create(secretaria, {
      displayName: "Visitante Demo",
      modality: "TRANSFERENCIA",
    });
    current = await service.advance(secretaria, current.id, {
      completeStep: "documents",
    });
    current = await service.advance(secretaria, current.id, {
      completeStep: "secretaria",
      decision: "APPROVE",
    });
    const rejected = await service.advance(pastor, current.id, {
      completeStep: "pastor",
      decision: "REJECT",
      rejectionReason: "Pendência pastoral (demo)",
    });

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.credentialEligible).toBe(false);
    expect(rejected.checklist.pastorApproved).toBe(false);
    expect(rejected.checklist.secretariaApproved).toBe(true);
    expect(memberships[0]?.status).toBe("PENDING_ADMISSION");
    expect(audits.at(-1)?.action).toBe("admission.pastor_reject");
  });

  it("forbids member, other church, and pastor opening a protocol", async () => {
    const { service } = createHarness();
    await expect(
      service.create(member, { displayName: "Visitante Demo" }),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    await expect(
      service.list(otherChurch),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    await expect(
      service.create(pastor, { displayName: "Visitante Demo", modality: "BATISMO" }),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it("lists only the pastoral queue for PASTOR and hides drafts", async () => {
    const { service } = createHarness();
    const draft = await service.create(secretaria, {
      displayName: "Rascunho Demo",
    });
    expect(draft.status).toBe("DRAFT");
    expect(draft.currentStep).toBe("modality");

    const waiting = await service.create(secretaria, {
      displayName: "Fila Demo",
      modality: "OUTRO",
    });
    const documented = await service.advance(secretaria, waiting.id, {
      completeStep: "documents",
    });
    const queued = await service.advance(secretaria, documented.id, {
      completeStep: "secretaria",
      decision: "APPROVE",
    });

    const pastoral = await service.list(pastor);
    expect(pastoral.admissions.map((item) => item.id)).toEqual([queued.id]);

    await expect(service.getById(pastor, draft.id)).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });

    const office = await service.list(secretaria);
    expect(office.admissions).toHaveLength(2);
  });

  it("rejects invalid payloads and a second open protocol", async () => {
    const { service } = createHarness();
    await expect(service.create(secretaria, {})).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    await expect(
      service.create(secretaria, { displayName: "X", modality: "CATEQUESE" }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

    const opened = await service.create(secretaria, {
      personId: undefined,
      displayName: "Visitante Demo",
      email: "visitante.demo@example.test",
    });
    const personId = opened.personId;
    await expect(
      service.create(secretaria, { personId }),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    try {
      await service.create(secretaria, { personId });
    } catch (error) {
      expect(bodyOf(error).code).toBe("ADMISSION_ALREADY_OPEN");
    }
  });

  it("links an admission to a legacy ACTIVE membership without making the card eligible", async () => {
    const harness = createHarness();
    harness.persons.push({
      id: "per_legacy",
      organizationId: pilot.organizationId,
      displayName: "Legado Demo",
      email: "legado.demo@example.test",
    });
    harness.memberships.push({
      id: "mem_legacy",
      personId: "per_legacy",
      churchId: pilot.churchId,
      organizationId: pilot.organizationId,
      status: "ACTIVE",
    });

    const opened = await harness.service.create(secretaria, {
      personId: "per_legacy",
      modality: "RECONCILIACAO",
    });
    expect(opened.membershipId).toBe("mem_legacy");
    expect(opened.credentialEligible).toBe(false);
    expect(harness.memberships[0]?.status).toBe("ACTIVE");
  });
});
