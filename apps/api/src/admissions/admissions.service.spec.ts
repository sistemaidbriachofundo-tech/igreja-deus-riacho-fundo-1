import { AdmissionsService } from "./admissions.service";
import type { AuthUser } from "../auth/types/auth-user";

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

  it("blocks pastor advance without secretaria approval", async () => {
    const admission = {
      id: "adm1",
      personId: "p1",
      membershipId: "m1",
      organizationId: "org1",
      churchId: "church-rf1",
      status: "AWAITING_SECRETARIA",
      modality: "BATISMO",
      currentStep: "secretaria",
      modalityRecorded: true,
      documentsComplete: true,
      secretariaApproved: false,
      pastorApproved: false,
      notes: null,
      rejectionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const prisma = {
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
    };

    const service = new AdmissionsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.advance(pastor, "adm1", {
        completeStep: "pastor",
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ADMISSION_STEP_LOCKED" }),
    });
  });

  it("approves pastor and marks credentialEligible", async () => {
    const admission = {
      id: "adm1",
      personId: "p1",
      membershipId: "m1",
      organizationId: "org1",
      churchId: "church-rf1",
      status: "AWAITING_PASTOR",
      modality: "BATISMO",
      currentStep: "pastor",
      modalityRecorded: true,
      documentsComplete: true,
      secretariaApproved: true,
      pastorApproved: false,
      notes: null,
      rejectionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updated = {
      ...admission,
      status: "APPROVED",
      pastorApproved: true,
      updatedAt: new Date(),
    };

    const tx = {
      admissionProtocol: {
        findFirst: jest.fn().mockResolvedValue(admission),
        update: jest.fn().mockResolvedValue(updated),
      },
      churchMembership: { update: jest.fn() },
      person: { update: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const service = new AdmissionsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const dto = await service.advance(pastor, "adm1", {
      completeStep: "pastor",
      decision: "APPROVE",
    });

    expect(dto.status).toBe("APPROVED");
    expect(dto.credentialEligible).toBe(true);
    expect(tx.churchMembership.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { status: "ACTIVE" },
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("refuses secretaria step for membro-only actor", async () => {
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

    const admission = {
      id: "adm1",
      personId: "p1",
      membershipId: "m1",
      organizationId: "org1",
      churchId: "church-rf1",
      status: "AWAITING_SECRETARIA",
      modality: "BATISMO",
      currentStep: "secretaria",
      modalityRecorded: true,
      documentsComplete: true,
      secretariaApproved: false,
      pastorApproved: false,
      notes: null,
      rejectionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const prisma = {
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
    };

    const service = new AdmissionsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.advance(member, "adm1", {
        completeStep: "secretaria",
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ADMISSION_ROLE_REQUIRED" }),
    });

    // silence unused
    expect(secretaria.email).toBeTruthy();
  });
});
