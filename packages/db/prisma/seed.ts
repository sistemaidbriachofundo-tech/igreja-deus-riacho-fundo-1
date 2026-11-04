import { PrismaClient } from "@prisma/client";
import {
  generateOpaqueCredentialToken,
  PILOT_CHURCH_SLUG,
  PILOT_ORG_SLUG,
} from "@idbrf/shared";

const prisma = new PrismaClient();

/**
 * Seed fictício apenas — sem dados reais da igreja.
 * Senha demo: "admin" (hash placeholder SHA-256 hex — trocar por Argon2id em F1 IAM completo).
 * Piloto hard-scoped: só Riacho Fundo I (sem multi-congregação).
 */
const DEMO_PASSWORD_HASH =
  "sha256:8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"; // "admin" — só demo

const ROLE_DEFS = [
  {
    code: "PLATFORM_ADMIN",
    name: "Administrador da plataforma",
    description: "Configuração e usuários — sem notas pastorais por padrão",
  },
  {
    code: "SECRETARIA",
    name: "Secretaria",
    description: "Membresia e documentos no escopo da congregação",
  },
  {
    code: "PASTOR",
    name: "Pastor / cuidado",
    description: "Casos atribuídos; leituras sensíveis auditadas",
  },
  {
    code: "TESOURARIA",
    name: "Tesouraria",
    description: "Contas e conciliação — sem registros pastorais",
  },
  {
    code: "LIDER_MINISTERIO",
    name: "Líder de ministério",
    description: "Equipe e escalas do ministério",
  },
  {
    code: "MEMBRO",
    name: "Membro",
    description: "Acesso ao próprio cadastro e agenda",
  },
] as const;

/** Seed fictício apenas — sem dados reais da igreja. */
async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: PILOT_ORG_SLUG },
    update: {},
    create: {
      name: "Igreja de Deus (demo)",
      slug: PILOT_ORG_SLUG,
    },
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

  for (const role of ROLE_DEFS) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }

  const household = await prisma.household.upsert({
    where: { id: "demoHousehold01" },
    update: {
      label: "Família Demo (fictícia)",
      organizationId: org.id,
      churchId: church.id,
    },
    create: {
      id: "demoHousehold01",
      organizationId: org.id,
      churchId: church.id,
      label: "Família Demo (fictícia)",
    },
  });

  const person = await prisma.person.upsert({
    where: { id: "demoPersonRiacho01" },
    update: {
      displayName: "Ana Demo Secretária",
      email: "ana.demo@example.test",
      homeChurchId: church.id,
      organizationId: org.id,
      householdId: household.id,
      status: "ACTIVE",
    },
    create: {
      id: "demoPersonRiacho01",
      organizationId: org.id,
      homeChurchId: church.id,
      householdId: household.id,
      displayName: "Ana Demo Secretária",
      email: "ana.demo@example.test",
      status: "ACTIVE",
    },
  });

  const memberPerson = await prisma.person.upsert({
    where: { id: "demoPersonMembro01" },
    update: {
      displayName: "Bruno Demo Membro",
      email: "bruno.demo@example.test",
      homeChurchId: church.id,
      organizationId: org.id,
      householdId: household.id,
    },
    create: {
      id: "demoPersonMembro01",
      organizationId: org.id,
      homeChurchId: church.id,
      householdId: household.id,
      displayName: "Bruno Demo Membro",
      email: "bruno.demo@example.test",
      status: "ACTIVE",
    },
  });

  const visitorPerson = await prisma.person.upsert({
    where: { id: "demoPersonVisit01" },
    update: {
      displayName: "Carla Demo Visitante",
      email: "carla.demo@example.test",
      homeChurchId: church.id,
      organizationId: org.id,
    },
    create: {
      id: "demoPersonVisit01",
      organizationId: org.id,
      homeChurchId: church.id,
      displayName: "Carla Demo Visitante",
      email: "carla.demo@example.test",
      status: "ACTIVE",
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "ana.demo@example.test" },
    update: {
      personId: person.id,
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
    create: {
      personId: person.id,
      email: "ana.demo@example.test",
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
  });

  const memberUser = await prisma.user.upsert({
    where: { email: "bruno.demo@example.test" },
    update: {
      personId: memberPerson.id,
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
    create: {
      personId: memberPerson.id,
      email: "bruno.demo@example.test",
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
  });

  const secretaria = await prisma.role.findUniqueOrThrow({
    where: { code: "SECRETARIA" },
  });
  const membro = await prisma.role.findUniqueOrThrow({
    where: { code: "MEMBRO" },
  });
  const pastorRole = await prisma.role.findUniqueOrThrow({
    where: { code: "PASTOR" },
  });

  const pastorPerson = await prisma.person.upsert({
    where: { id: "demoPersonPastor01" },
    update: {
      displayName: "Paulo Demo Pastor",
      email: "paulo.demo@example.test",
      homeChurchId: church.id,
      organizationId: org.id,
      status: "ACTIVE",
    },
    create: {
      id: "demoPersonPastor01",
      organizationId: org.id,
      homeChurchId: church.id,
      displayName: "Paulo Demo Pastor",
      email: "paulo.demo@example.test",
      status: "ACTIVE",
    },
  });

  const pastorUser = await prisma.user.upsert({
    where: { email: "paulo.demo@example.test" },
    update: {
      personId: pastorPerson.id,
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
    create: {
      personId: pastorPerson.id,
      email: "paulo.demo@example.test",
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
  });

  await prisma.grant.upsert({
    where: {
      userId_roleId_organizationId_churchId: {
        userId: adminUser.id,
        roleId: secretaria.id,
        organizationId: org.id,
        churchId: church.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: secretaria.id,
      organizationId: org.id,
      churchId: church.id,
    },
  });

  await prisma.grant.upsert({
    where: {
      userId_roleId_organizationId_churchId: {
        userId: memberUser.id,
        roleId: membro.id,
        organizationId: org.id,
        churchId: church.id,
      },
    },
    update: {},
    create: {
      userId: memberUser.id,
      roleId: membro.id,
      organizationId: org.id,
      churchId: church.id,
    },
  });

  await prisma.grant.upsert({
    where: {
      userId_roleId_organizationId_churchId: {
        userId: pastorUser.id,
        roleId: pastorRole.id,
        organizationId: org.id,
        churchId: church.id,
      },
    },
    update: {},
    create: {
      userId: pastorUser.id,
      roleId: pastorRole.id,
      organizationId: org.id,
      churchId: church.id,
    },
  });

  const anaMembership = await prisma.churchMembership.upsert({
    where: {
      personId_churchId: {
        personId: person.id,
        churchId: church.id,
      },
    },
    update: { status: "ACTIVE", notes: "Secretaria demo" },
    create: {
      personId: person.id,
      churchId: church.id,
      organizationId: org.id,
      status: "ACTIVE",
      notes: "Secretaria demo",
    },
  });

  const brunoMembership = await prisma.churchMembership.upsert({
    where: {
      personId_churchId: {
        personId: memberPerson.id,
        churchId: church.id,
      },
    },
    update: { status: "ACTIVE", notes: "Membro demo" },
    create: {
      personId: memberPerson.id,
      churchId: church.id,
      organizationId: org.id,
      status: "ACTIVE",
      notes: "Membro demo",
    },
  });

  await prisma.churchMembership.upsert({
    where: {
      personId_churchId: {
        personId: visitorPerson.id,
        churchId: church.id,
      },
    },
    update: { status: "ACTIVE", notes: "Visitante → membro (demo)" },
    create: {
      personId: visitorPerson.id,
      churchId: church.id,
      organizationId: org.id,
      status: "ACTIVE",
      notes: "Visitante → membro (demo)",
    },
  });

  const existingCard = await prisma.memberCredential.findFirst({
    where: {
      membershipId: brunoMembership.id,
      status: "ACTIVE",
    },
  });

  if (!existingCard) {
    await prisma.memberCredential.create({
      data: {
        membershipId: brunoMembership.id,
        personId: memberPerson.id,
        churchId: church.id,
        organizationId: org.id,
        status: "ACTIVE",
        opaqueToken: generateOpaqueCredentialToken(),
        issuedByUserId: adminUser.id,
      },
    });
  }

  console.log("Seed OK (fictício, single-church RF1):", {
    org: org.slug,
    church: church.slug,
    household: household.id,
    persons: [person.id, memberPerson.id, visitorPerson.id],
    users: [adminUser.email, memberUser.email, pastorUser.email],
    memberships: [anaMembership.id, brunoMembership.id],
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
