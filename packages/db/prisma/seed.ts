import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seed fictício apenas — sem dados reais da igreja.
 * Senha demo: "demo-password-not-real" (hash placeholder SHA-256 hex — trocar por Argon2id em F1 IAM completo).
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
    where: { slug: "igreja-de-deus" },
    update: {},
    create: {
      name: "Igreja de Deus (demo)",
      slug: "igreja-de-deus",
    },
  });

  const church = await prisma.church.upsert({
    where: {
      organizationId_slug: {
        organizationId: org.id,
        slug: "riacho-fundo-1",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: "Riacho Fundo I (demo)",
      slug: "riacho-fundo-1",
    },
  });

  for (const role of ROLE_DEFS) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }

  const person = await prisma.person.upsert({
    where: { id: "demoPersonRiacho01" },
    update: {
      displayName: "Ana Demo Secretária",
      email: "ana.demo@example.test",
      homeChurchId: church.id,
      organizationId: org.id,
      status: "ACTIVE",
    },
    create: {
      id: "demoPersonRiacho01",
      organizationId: org.id,
      homeChurchId: church.id,
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
    },
    create: {
      id: "demoPersonMembro01",
      organizationId: org.id,
      homeChurchId: church.id,
      displayName: "Bruno Demo Membro",
      email: "bruno.demo@example.test",
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

  console.log("Seed OK (fictício):", {
    org: org.slug,
    church: church.slug,
    persons: [person.id, memberPerson.id],
    users: [adminUser.email, memberUser.email],
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
