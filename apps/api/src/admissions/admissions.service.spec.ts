import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { AdmissionsService } from "./admissions.service";
import type { AuthUser } from "../auth/types/auth-user";
import { BusinessException } from "../common/business.exception";

describe("AdmissionsService", () => {
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
    userId: "u-pastor",
    personId: "p-pastor",
    email: "pastor.demo@example.test",
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

  const baseAdmission = {
    id: "adm1",
    personId: "p1",
    membershipId: "m1",
    organizationId: "org1",
    churchId: "church-rf1",
    status: "DRAFT",
    modality: null as string | null,
    currentStep: "modality",
    modalityRecorded: false,
    documentsComplete: false,
    secretariaApproved: false,
    pastorApproved: false,
    notes: null as string | null,
    rejectionReason: null as string | null,
    createdAt: new Date("2026-11-04T10:00:00Z"),
    updatedAt: new Date("2026-11-04T10:00:00Z"),
  };

  function serviceWith(
    prisma: Record<string, unknown>,
  ): AdmissionsService {
    return new AdmissionsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
  }

  it("list and getById for secretaria", async () => {
    const prisma = {
      admissionProtocol: {
        findMany: jest.fn().mockResolvedValue([baseAdmission]),
        findFirst: jest.fn().mockResolvedValue(baseAdmission),
      },
    };
    const service = serviceWith(prisma);
    const listed = await service.list(secretaria, "DRAFT");
    expect(listed.admissions).toHaveLength(1);
    expect(listed.admissions[0]?.credentialEligible).toBe(false);

    await expect(service.getById(secretaria, "adm1")).resolves.toMatchObject({
      id: "adm1",
    });
  });

  it("forbids list for membro", async () => {
    const service = serviceWith({ admissionProtocol: { findMany: jest.fn() } });
    await expect(service.list(member)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("getById 404", async () => {
    const service = serviceWith({
      admissionProtocol: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.getById(pastor, "x")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("create with new person + modality", async () => {
    const tx = {
      person: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: "p-new" }),
      },
      household: { findFirst: jest.fn() },
      admissionProtocol: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          ...baseAdmission,
          id: "adm-new",
          personId: "p-new",
          status: "AWAITING_DOCUMENTS",
          modality: "BATISMO",
          currentStep: "documents",
          modalityRecorded: true,
        }),
      },
      churchMembership: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "m-new", status: "PENDING_ADMISSION" }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = serviceWith(prisma);
    const dto = await service.create(secretaria, {
      displayName: "Carla",
      modality: "BATISMO",
    });
    expect(dto.status).toBe("AWAITING_DOCUMENTS");
    expect(tx.person.create).toHaveBeenCalled();
  });

  it("create rejects missing person, minor without guardian, duplicate, active membership", async () => {
    const mk = (tx: Record<string, unknown>) =>
      serviceWith({
        $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) =>
          fn(tx),
        ),
      });

    await expect(
      mk({
        person: { findFirst: jest.fn().mockResolvedValue(null) },
      }).create(secretaria, { personId: "ghost" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      mk({
        person: {
          findFirst: jest.fn().mockResolvedValue({
            id: "kid",
            isMinor: true,
            legalGuardianPersonId: null,
          }),
        },
      }).create(secretaria, { personId: "kid" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      mk({
        person: { findFirst: jest.fn(), create: jest.fn() },
      }).create(secretaria, {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      mk({
        person: {
          findFirst: jest.fn().mockResolvedValue({
            id: "p1",
            isMinor: false,
            legalGuardianPersonId: null,
          }),
        },
        admissionProtocol: {
          findFirst: jest.fn().mockResolvedValue({ id: "open" }),
        },
      }).create(secretaria, { personId: "p1" }),
    ).rejects.toBeInstanceOf(BusinessException);

    await expect(
      mk({
        person: {
          findFirst: jest.fn().mockResolvedValue({
            id: "p1",
            isMinor: false,
            legalGuardianPersonId: null,
          }),
        },
        admissionProtocol: { findFirst: jest.fn().mockResolvedValue(null) },
        churchMembership: {
          findUnique: jest.fn().mockResolvedValue({ id: "m1", status: "ACTIVE" }),
        },
      }).create(secretaria, { personId: "p1" }),
    ).rejects.toBeInstanceOf(BusinessException);

    await expect(
      mk({}).create(member, { displayName: "X" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("create validates household when creating person", async () => {
    const tx = {
      person: { create: jest.fn() },
      household: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = serviceWith({
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    });
    await expect(
      service.create(secretaria, {
        displayName: "X",
        householdId: "missing",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  async function advanceCase(
    admission: typeof baseAdmission,
    actor: AuthUser,
    input: {
      completeStep: string;
      decision?: string;
      modality?: string;
      notes?: string;
      rejectionReason?: string;
    },
    updatedOverride: Partial<typeof baseAdmission> = {},
  ) {
    const updated = { ...admission, ...updatedOverride };
    const tx = {
      admissionProtocol: {
        findFirst: jest.fn().mockResolvedValue(admission),
        update: jest.fn().mockResolvedValue(updated),
      },
      churchMembership: { update: jest.fn() },
      person: { update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = serviceWith({
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    });
    return {
      service,
      tx,
      result: await service.advance(actor, admission.id, input as never),
    };
  }

  it("blocks pastor advance without secretaria approval", async () => {
    const admission = {
      ...baseAdmission,
      status: "AWAITING_SECRETARIA",
      modality: "BATISMO",
      currentStep: "secretaria",
      modalityRecorded: true,
      documentsComplete: true,
    };
    const service = serviceWith({
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          admissionProtocol: {
            findFirst: jest.fn().mockResolvedValue(admission),
            update: jest.fn(),
          },
          churchMembership: { update: jest.fn() },
          person: { update: jest.fn() },
          auditLog: { create: jest.fn() },
        }),
      ),
    });
    await expect(
      service.advance(pastor, "adm1", {
        completeStep: "pastor",
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ADMISSION_STEP_LOCKED" }),
    });
  });

  it("approves pastor and marks membership ACTIVE", async () => {
    const admission = {
      ...baseAdmission,
      status: "AWAITING_PASTOR",
      modality: "BATISMO",
      currentStep: "pastor",
      modalityRecorded: true,
      documentsComplete: true,
      secretariaApproved: true,
    };
    const { result, tx } = await advanceCase(
      admission,
      pastor,
      { completeStep: "pastor", decision: "APPROVE" },
      {
        status: "APPROVED",
        pastorApproved: true,
        membershipId: "m1",
        personId: "p1",
      },
    );
    expect(result.status).toBe("APPROVED");
    expect(result.credentialEligible).toBe(true);
    expect(tx.churchMembership.update).toHaveBeenCalled();
  });

  it("advances modality → documents → secretaria", async () => {
    const modality = await advanceCase(
      baseAdmission,
      secretaria,
      { completeStep: "modality", modality: "BATISMO" },
      {
        modalityRecorded: true,
        modality: "BATISMO",
        status: "AWAITING_DOCUMENTS",
        currentStep: "documents",
      },
    );
    expect(modality.result.status).toBe("AWAITING_DOCUMENTS");

    const docsAdmission = {
      ...baseAdmission,
      modalityRecorded: true,
      modality: "BATISMO",
      status: "AWAITING_DOCUMENTS",
      currentStep: "documents",
    };
    const docs = await advanceCase(
      docsAdmission,
      secretaria,
      { completeStep: "documents" },
      {
        documentsComplete: true,
        status: "AWAITING_SECRETARIA",
        currentStep: "secretaria",
      },
    );
    expect(docs.result.status).toBe("AWAITING_SECRETARIA");

    const secAdmission = {
      ...docsAdmission,
      documentsComplete: true,
      status: "AWAITING_SECRETARIA",
      currentStep: "secretaria",
    };
    const sec = await advanceCase(
      secAdmission,
      secretaria,
      { completeStep: "secretaria", decision: "APPROVE" },
      {
        secretariaApproved: true,
        status: "AWAITING_PASTOR",
        currentStep: "pastor",
      },
    );
    expect(sec.result.status).toBe("AWAITING_PASTOR");
  });

  it("cancels open protocol and blocks closed / non-secretaria", async () => {
    const tx = {
      admissionProtocol: {
        findFirst: jest.fn().mockResolvedValue({
          ...baseAdmission,
          status: "AWAITING_DOCUMENTS",
        }),
        update: jest.fn().mockResolvedValue({
          ...baseAdmission,
          status: "CANCELLED",
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = serviceWith({
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    });
    const result = await service.cancel(secretaria, "adm1", "desistência demo");
    expect(result.status).toBe("CANCELLED");
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "admission.cancel" }),
      }),
    );

    await expect(service.cancel(member, "adm1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const closedTx = {
      admissionProtocol: {
        findFirst: jest.fn().mockResolvedValue({
          ...baseAdmission,
          status: "APPROVED",
        }),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const closedService = serviceWith({
      $transaction: jest.fn(
        async (fn: (t: typeof closedTx) => Promise<unknown>) => fn(closedTx),
      ),
    });
    await expect(closedService.cancel(secretaria, "adm1")).rejects.toMatchObject(
      {
        response: expect.objectContaining({ code: "ADMISSION_CLOSED" }),
      },
    );
  });

  it("rejects closed protocol, missing decision, wrong roles, REJECT path", async () => {
    const closed = { ...baseAdmission, status: "APPROVED" };
    await expect(
      advanceCase(closed, secretaria, { completeStep: "documents" }),
    ).rejects.toBeInstanceOf(BusinessException);

    const awaitingSec = {
      ...baseAdmission,
      modalityRecorded: true,
      documentsComplete: true,
      status: "AWAITING_SECRETARIA",
      currentStep: "secretaria",
    };
    await expect(
      advanceCase(awaitingSec, secretaria, { completeStep: "secretaria" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      advanceCase(awaitingSec, member, {
        completeStep: "secretaria",
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ADMISSION_ROLE_REQUIRED" }),
    });

    const awaitingPastor = {
      ...awaitingSec,
      secretariaApproved: true,
      status: "AWAITING_PASTOR",
      currentStep: "pastor",
    };
    await expect(
      advanceCase(awaitingPastor, secretaria, {
        completeStep: "pastor",
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ADMISSION_ROLE_REQUIRED" }),
    });

    const reject = await advanceCase(
      awaitingSec,
      secretaria,
      { completeStep: "secretaria", decision: "REJECT", rejectionReason: "docs" },
      { status: "REJECTED", rejectionReason: "docs" },
    );
    expect(reject.result.status).toBe("REJECTED");

    await expect(
      advanceCase(baseAdmission, secretaria, { completeStep: "modality" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const service = serviceWith({
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          admissionProtocol: {
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
          },
        }),
      ),
    });
    await expect(
      service.advance(secretaria, "missing", { completeStep: "modality" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
