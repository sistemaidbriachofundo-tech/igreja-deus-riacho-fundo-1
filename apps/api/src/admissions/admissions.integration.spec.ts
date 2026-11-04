import { PrismaClient } from "@prisma/client";
import { PILOT_CHURCH_SLUG, PILOT_ORG_SLUG } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { CredentialsService } from "../credentials/credentials.service";
import { PilotService } from "../pilot/pilot.service";
import { PrismaService } from "../prisma/prisma.service";
import { AdmissionsService } from "./admissions.service";

/**
 * Integração contra Postgres (CI exporta DATABASE_URL e aplica migrations).
 * Sem banco, o bloco é ignorado — os testes unitários cobrem as regras.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("admissions + credential gate (postgres)", () => {
  const prisma = new PrismaClient();
  const pilot = new PilotService(prisma as unknown as PrismaService);
  const admissions = new AdmissionsService(
    prisma as unknown as PrismaService,
    pilot,
  );
  const credentials = new CredentialsService(
    prisma as unknown as PrismaService,
    pilot,
  );

  const runId = `m1it${Date.now().toString(36)}`;
  const visitorEmail = `${runId}.visitante@example.test`;
  let secretaria: AuthUser;
  let pastor: AuthUser;
  let organizationId = "";
  let churchId = "";
  let userIds: string[] = [];
  let personIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const org = await prisma.organization.upsert({
      where: { slug: PILOT_ORG_SLUG },
      update: {},
      create: { name: "Igreja de Deus (demo)", slug: PILOT_ORG_SLUG },
    });
    const church = await prisma.church.upsert({
      where: {
        organizationId_slug: {
          organizationId: org.id,
          slug: PILOT_CHURCH_SLUG,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        name: "Riacho Fundo I (demo)",
        slug: PILOT_CHURCH_SLUG,
      },
    });
    organizationId = org.id;
    churchId = church.id;

    const secretariaRole = await prisma.role.upsert({
      where: { code: "SECRETARIA" },
      update: {},
      create: { code: "SECRETARIA", name: "Secretaria" },
    });
    const pastorRole = await prisma.role.upsert({
      where: { code: "PASTOR" },
      update: {},
      create: { code: "PASTOR", name: "Pastor" },
    });

    const secPerson = await prisma.person.create({
      data: {
        organizationId,
        homeChurchId: churchId,
        displayName: "Integração Demo Secretária",
        email: `${runId}.sec@example.test`,
        status: "ACTIVE",
      },
    });
    const pasPerson = await prisma.person.create({
      data: {
        organizationId,
        homeChurchId: churchId,
        displayName: "Integração Demo Pastor",
        email: `${runId}.pas@example.test`,
        status: "ACTIVE",
      },
    });
    personIds = [secPerson.id, pasPerson.id];

    const secUser = await prisma.user.create({
      data: {
        personId: secPerson.id,
        email: `${runId}.sec@example.test`,
        status: "ACTIVE",
      },
    });
    const pasUser = await prisma.user.create({
      data: {
        personId: pasPerson.id,
        email: `${runId}.pas@example.test`,
        status: "ACTIVE",
      },
    });
    userIds = [secUser.id, pasUser.id];

    await prisma.grant.createMany({
      data: [
        {
          userId: secUser.id,
          roleId: secretariaRole.id,
          organizationId,
          churchId,
        },
        {
          userId: pasUser.id,
          roleId: pastorRole.id,
          organizationId,
          churchId,
        },
      ],
    });

    secretaria = {
      userId: secUser.id,
      personId: secPerson.id,
      email: secUser.email,
      grants: [
        { roleCode: "SECRETARIA", organizationId, churchId },
      ],
    };
    pastor = {
      userId: pasUser.id,
      personId: pasPerson.id,
      email: pasUser.email,
      grants: [{ roleCode: "PASTOR", organizationId, churchId }],
    };
  });

  afterAll(async () => {
    if (userIds.length) {
      await prisma.memberCredential.deleteMany({
        where: { issuedByUserId: { in: userIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { actorUserId: { in: userIds } },
      });
    }
    await prisma.admission.deleteMany({
      where: { person: { email: visitorEmail } },
    });
    await prisma.churchMembership.deleteMany({
      where: { person: { email: visitorEmail } },
    });
    if (userIds.length) {
      await prisma.grant.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (personIds.length) {
      await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    }
    await prisma.person.deleteMany({ where: { email: visitorEmail } });
    await prisma.$disconnect();
  });

  it("persists the step order, pastoral audit, and credential gate", async () => {
    const opened = await admissions.create(secretaria, {
      displayName: "Visitante Integração Demo",
      email: visitorEmail,
      modality: "BATISMO",
    });
    expect(opened.credentialEligible).toBe(false);
    expect(opened.status).toBe("AWAITING_DOCUMENTS");

    const membership = await prisma.churchMembership.findUniqueOrThrow({
      where: { id: opened.membershipId! },
    });
    expect(membership.status).toBe("PENDING_ADMISSION");

    try {
      await credentials.issue(secretaria, membership.id);
      throw new Error("emissão deveria falhar antes da aprovação pastoral");
    } catch (error) {
      expect(error).toMatchObject({ status: 409 });
      const body = (error as { getResponse?: () => { code?: string } }).getResponse?.();
      expect(body?.code).toBe("CREDENTIAL_NOT_ELIGIBLE");
    }

    await expect(
      admissions.advance(pastor, opened.id, { completeStep: "pastor", decision: "APPROVE" }),
    ).rejects.toMatchObject({ status: 409 });

    let current = await admissions.advance(secretaria, opened.id, {
      completeStep: "documents",
    });
    current = await admissions.advance(secretaria, current.id, {
      completeStep: "secretaria",
      decision: "APPROVE",
    });
    await expect(
      admissions.advance(secretaria, current.id, {
        completeStep: "pastor",
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({ status: 403 });

    const approved = await admissions.advance(pastor, current.id, {
      completeStep: "pastor",
      decision: "APPROVE",
    });
    expect(approved.credentialEligible).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: {
        resourceId: approved.id,
        action: "admission.pastor_approve",
      },
    });
    expect(audit?.actorUserId).toBe(pastor.userId);
    expect(audit?.churchId).toBe(churchId);

    const active = await prisma.churchMembership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    expect(active.status).toBe("ACTIVE");

    const card = await credentials.issue(secretaria, membership.id);
    expect(card.qrPayload).not.toContain(visitorEmail);
    expect(card.membershipId).toBe(membership.id);

    const verified = await credentials.lookupByOpaqueToken(card.qrPayload);
    expect(verified.status).toBe("ACTIVE");
    expect(verified.displayName).toBe("Visitante Integração Demo");

    const revoked = await credentials.revoke(secretaria, card.id);
    expect(revoked.status).toBe("REVOKED");
  });
});
