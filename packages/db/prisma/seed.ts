import { PrismaClient } from "@prisma/client";
import {
  generateOpaqueCredentialToken,
  PILOT_CHURCH_SLUG,
  PILOT_ORG_SLUG,
} from "@idbrf/shared";

const prisma = new PrismaClient();

/**
 * Seed fictício apenas — sem dados reais da igreja.
 * Senha demo: "admin" (Argon2id; params alinhados a apps/api hashPassword).
 * Piloto hard-scoped: só Riacho Fundo I (sem multi-congregação).
 */
const DEMO_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$Orwb01GobNLUv7ZiWJ0tbA$YzvnXjzMn5ffs7FYEHuw3xfoTmkQsD0KZXcBDS/fsgQ"; // "admin" — só demo

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

  // Segunda congregação fictícia — destino de transferências (mesmo person_id).
  const churchDest = await prisma.church.upsert({
    where: {
      organizationId_slug: {
        organizationId: org.id,
        slug: "riacho-fundo-2-demo",
      },
    },
    update: { name: "Riacho Fundo II (demo destino)" },
    create: {
      id: "demoChurchDest02",
      organizationId: org.id,
      name: "Riacho Fundo II (demo destino)",
      slug: "riacho-fundo-2-demo",
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
      kind: "MEMBER",
    },
    create: {
      id: "demoPersonRiacho01",
      organizationId: org.id,
      homeChurchId: church.id,
      householdId: household.id,
      displayName: "Ana Demo Secretária",
      email: "ana.demo@example.test",
      status: "ACTIVE",
      kind: "MEMBER",
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
      kind: "MEMBER",
    },
    create: {
      id: "demoPersonMembro01",
      organizationId: org.id,
      homeChurchId: church.id,
      householdId: household.id,
      displayName: "Bruno Demo Membro",
      email: "bruno.demo@example.test",
      status: "ACTIVE",
      kind: "MEMBER",
    },
  });

  const visitorPerson = await prisma.person.upsert({
    where: { id: "demoPersonVisit01" },
    update: {
      displayName: "Carla Demo Visitante",
      email: "carla.demo@example.test",
      homeChurchId: church.id,
      organizationId: org.id,
      kind: "VISITOR",
    },
    create: {
      id: "demoPersonVisit01",
      organizationId: org.id,
      homeChurchId: church.id,
      displayName: "Carla Demo Visitante",
      email: "carla.demo@example.test",
      status: "ACTIVE",
      kind: "VISITOR",
    },
  });

  // Menor fictício com responsável legal = Ana (secretaria demo)
  await prisma.person.upsert({
    where: { id: "demoPersonMenor01" },
    update: {
      displayName: "Eduardo Demo Menor",
      homeChurchId: church.id,
      organizationId: org.id,
      householdId: household.id,
      kind: "VISITOR",
      isMinor: true,
      legalGuardianPersonId: person.id,
    },
    create: {
      id: "demoPersonMenor01",
      organizationId: org.id,
      homeChurchId: church.id,
      householdId: household.id,
      displayName: "Eduardo Demo Menor",
      email: null,
      status: "ACTIVE",
      kind: "VISITOR",
      isMinor: true,
      legalGuardianPersonId: person.id,
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

  await upsertChurchGrant({
    prisma,
    userId: adminUser.id,
    roleId: secretaria.id,
    organizationId: org.id,
    churchId: church.id,
  });

  await upsertChurchGrant({
    prisma,
    userId: memberUser.id,
    roleId: membro.id,
    organizationId: org.id,
    churchId: church.id,
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
    update: { status: "PENDING_ADMISSION", notes: "Visitante em admissão (demo)" },
    create: {
      personId: visitorPerson.id,
      churchId: church.id,
      organizationId: org.id,
      status: "PENDING_ADMISSION",
      notes: "Visitante em admissão (demo)",
    },
  });


  const pastorPerson = await prisma.person.upsert({
    where: { id: "demoPersonPastor01" },
    update: {
      displayName: "Daniel Demo Pastor",
      email: "pastor.demo@example.test",
      homeChurchId: church.id,
      organizationId: org.id,
      kind: "MEMBER",
      status: "ACTIVE",
    },
    create: {
      id: "demoPersonPastor01",
      organizationId: org.id,
      homeChurchId: church.id,
      displayName: "Daniel Demo Pastor",
      email: "pastor.demo@example.test",
      status: "ACTIVE",
      kind: "MEMBER",
    },
  });

  const pastorUser = await prisma.user.upsert({
    where: { email: "pastor.demo@example.test" },
    update: {
      personId: pastorPerson.id,
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
    create: {
      personId: pastorPerson.id,
      email: "pastor.demo@example.test",
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
  });

  const pastorRole = await prisma.role.findUniqueOrThrow({
    where: { code: "PASTOR" },
  });

  await upsertChurchGrant({
    prisma,
    userId: pastorUser.id,
    roleId: pastorRole.id,
    organizationId: org.id,
    churchId: church.id,
  });

  await prisma.churchMembership.upsert({
    where: {
      personId_churchId: {
        personId: pastorPerson.id,
        churchId: church.id,
      },
    },
    update: { status: "ACTIVE", notes: "Pastor demo" },
    create: {
      personId: pastorPerson.id,
      churchId: church.id,
      organizationId: org.id,
      status: "ACTIVE",
      notes: "Pastor demo",
    },
  });

  // Bruno: admissão APPROVED → credentialEligible para carteirinha demo
  await prisma.admissionProtocol.upsert({
    where: { id: "demoAdmissionBruno01" },
    update: {
      personId: memberPerson.id,
      membershipId: brunoMembership.id,
      organizationId: org.id,
      churchId: church.id,
      status: "APPROVED",
      modality: "BATISMO",
      currentStep: "pastor",
      modalityRecorded: true,
      documentsComplete: true,
      secretariaApproved: true,
      pastorApproved: true,
      notes: "Admissão demo aprovada",
    },
    create: {
      id: "demoAdmissionBruno01",
      personId: memberPerson.id,
      membershipId: brunoMembership.id,
      organizationId: org.id,
      churchId: church.id,
      status: "APPROVED",
      modality: "BATISMO",
      currentStep: "pastor",
      modalityRecorded: true,
      documentsComplete: true,
      secretariaApproved: true,
      pastorApproved: true,
      notes: "Admissão demo aprovada",
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

  // F3 demo: trilha, ministério, célula
  await prisma.discipleshipTrack.upsert({
    where: { id: "demoTrack01" },
    update: { name: "Fundamentos da Fé (demo)" },
    create: {
      id: "demoTrack01",
      organizationId: org.id,
      churchId: church.id,
      name: "Fundamentos da Fé (demo)",
      description: "Trilha fictícia F3",
    },
  });

  await prisma.ministry.upsert({
    where: {
      churchId_slug: { churchId: church.id, slug: "louvor-demo" },
    },
    update: { name: "Louvor (demo)" },
    create: {
      id: "demoMinistry01",
      organizationId: org.id,
      churchId: church.id,
      name: "Louvor (demo)",
      slug: "louvor-demo",
      leaderPersonId: memberPerson.id,
      visibility: "INTERNAL",
      publishStatus: "DRAFT",
    },
  });

  const liderJovensPerson = await prisma.person.upsert({
    where: { id: "demoPersonLiderJovens" },
    update: {
      displayName: "Líder Demo Jovens",
      email: "lider.jovens.demo@example.test",
      homeChurchId: church.id,
      organizationId: org.id,
      kind: "MEMBER",
      status: "ACTIVE",
    },
    create: {
      id: "demoPersonLiderJovens",
      organizationId: org.id,
      homeChurchId: church.id,
      displayName: "Líder Demo Jovens",
      email: "lider.jovens.demo@example.test",
      status: "ACTIVE",
      kind: "MEMBER",
    },
  });

  const liderJovensUser = await prisma.user.upsert({
    where: { email: "lider.jovens.demo@example.test" },
    update: {
      personId: liderJovensPerson.id,
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
    create: {
      personId: liderJovensPerson.id,
      email: "lider.jovens.demo@example.test",
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
  });

  const portalMinistries = [
    {
      id: "demoMinistryJovens",
      slug: "jovens",
      name: "Ministério de Jovens",
      description: "Encontros, discipulado e comunhão da juventude (demo).",
      scheduleText: "Sábados 19h — salão jovem (demo)",
      participationInfo: "Fale com a liderança após o culto (demo).",
      leadershipPublic: [
        { displayName: "Líder Demo Jovens", roleTitle: "Coordenação" },
      ],
    },
    {
      id: "demoMinistryHomens",
      slug: "homens",
      name: "Ministério de Homens",
      description: "Comunhão e formação de homens (demo).",
      scheduleText: "Mensal — 1º sábado (demo)",
      participationInfo: "Inscrição via secretaria (demo).",
      leadershipPublic: [
        { displayName: "Líder Demo Homens", roleTitle: "Coordenação" },
      ],
    },
    {
      id: "demoMinistryAdolescentes",
      slug: "adolescentes",
      name: "Ministério de Adolescentes",
      description: "Geração adolescente — encontros e cuidado (demo).",
      scheduleText: "Sextas 19h30 (demo)",
      participationInfo: "Responsável legal acompanha menores (demo).",
      leadershipPublic: [
        { displayName: "Líder Demo Adolescentes", roleTitle: "Coordenação" },
      ],
    },
    {
      id: "demoMinistryMulheres",
      slug: "mulheres",
      name: "Ministério de Mulheres",
      description: "Encontros e discipulado de mulheres (demo).",
      scheduleText: "Quinzenal — terças 20h (demo)",
      participationInfo: "Participe dos círculos (demo).",
      leadershipPublic: [
        { displayName: "Líder Demo Mulheres", roleTitle: "Coordenação" },
      ],
    },
    {
      id: "demoMinistryAtmosfera",
      slug: "atmosfera",
      name: "Atmosfera (voluntariado)",
      description:
        "Equipes de hospitalidade e voluntariado nos cultos (demo).",
      scheduleText: "Escalas semanais via roster (demo)",
      participationInfo:
        "Manifeste interesse pelo formulário público (Frente E).",
      leadershipPublic: [
        { displayName: "Líder Demo Atmosfera", roleTitle: "Coordenação" },
      ],
    },
  ] as const;

  for (const m of portalMinistries) {
    await prisma.ministry.upsert({
      where: { churchId_slug: { churchId: church.id, slug: m.slug } },
      update: {
        name: m.name,
        description: m.description,
        scheduleText: m.scheduleText,
        participationInfo: m.participationInfo,
        leadershipPublic: [...m.leadershipPublic],
        coverImageUrl: `/images/ministries/${m.slug}-demo.jpg`,
        galleryUrls: [`/images/ministries/${m.slug}-gallery-1-demo.jpg`],
        visibility: "PUBLIC",
        publishStatus: "PUBLISHED",
        publishedAt: new Date("2026-11-05T12:00:00.000Z"),
        leaderPersonId:
          m.slug === "jovens" ? liderJovensPerson.id : memberPerson.id,
      },
      create: {
        id: m.id,
        organizationId: org.id,
        churchId: church.id,
        name: m.name,
        slug: m.slug,
        description: m.description,
        scheduleText: m.scheduleText,
        participationInfo: m.participationInfo,
        leadershipPublic: [...m.leadershipPublic],
        coverImageUrl: `/images/ministries/${m.slug}-demo.jpg`,
        galleryUrls: [`/images/ministries/${m.slug}-gallery-1-demo.jpg`],
        visibility: "PUBLIC",
        publishStatus: "PUBLISHED",
        publishedAt: new Date("2026-11-05T12:00:00.000Z"),
        leaderPersonId:
          m.slug === "jovens" ? liderJovensPerson.id : memberPerson.id,
      },
    });
  }

  const liderRole = await prisma.role.findUniqueOrThrow({
    where: { code: "LIDER_MINISTERIO" },
  });

  const jovensMinistry = await prisma.ministry.findUniqueOrThrow({
    where: { churchId_slug: { churchId: church.id, slug: "jovens" } },
  });

  await upsertChurchGrant({
    prisma,
    userId: liderJovensUser.id,
    roleId: liderRole.id,
    organizationId: org.id,
    churchId: church.id,
    ministryId: jovensMinistry.id,
  });

  await prisma.churchMembership.upsert({
    where: {
      personId_churchId: {
        personId: liderJovensPerson.id,
        churchId: church.id,
      },
    },
    update: { status: "ACTIVE", notes: "Líder jovens demo" },
    create: {
      personId: liderJovensPerson.id,
      churchId: church.id,
      organizationId: org.id,
      status: "ACTIVE",
      notes: "Líder jovens demo",
    },
  });

  await prisma.portalEvent.upsert({
    where: {
      churchId_slug: { churchId: church.id, slug: "encontro-jovens-demo" },
    },
    update: {
      name: "Encontro de Jovens (demo)",
      status: "PUBLISHED",
      featuredOnHome: true,
      ministryId: jovensMinistry.id,
    },
    create: {
      id: "demoPortalEvent01",
      organizationId: org.id,
      churchId: church.id,
      ministryId: jovensMinistry.id,
      name: "Encontro de Jovens (demo)",
      slug: "encontro-jovens-demo",
      description: "Noite de comunhão e palavra — dados fictícios.",
      imageUrl: "/images/events/encontro-jovens-demo.jpg",
      startsAt: new Date("2026-11-15T22:00:00.000Z"),
      endsAt: new Date("2026-11-16T01:00:00.000Z"),
      locationText: "Salão jovem — Riacho Fundo I (demo)",
      status: "PUBLISHED",
      featuredOnHome: true,
      publishedAt: new Date("2026-11-05T12:00:00.000Z"),
    },
  });

  await prisma.portalEvent.upsert({
    where: {
      churchId_slug: { churchId: church.id, slug: "culto-familia-demo" },
    },
    update: {
      name: "Culto em Família (demo)",
      status: "PUBLISHED",
      featuredOnHome: true,
    },
    create: {
      id: "demoPortalEvent02",
      organizationId: org.id,
      churchId: church.id,
      ministryId: null,
      name: "Culto em Família (demo)",
      slug: "culto-familia-demo",
      description: "Culto dominical institucional (demo).",
      imageUrl: "/images/events/culto-familia-demo.jpg",
      startsAt: new Date("2026-11-09T21:00:00.000Z"),
      endsAt: new Date("2026-11-09T23:00:00.000Z"),
      locationText: "Templo principal (demo)",
      status: "PUBLISHED",
      featuredOnHome: true,
      publishedAt: new Date("2026-11-05T12:00:00.000Z"),
    },
  });

  await prisma.smallGroup.upsert({
    where: { id: "demoGroup01" },
    update: { name: "Célula Centro (demo)" },
    create: {
      id: "demoGroup01",
      organizationId: org.id,
      churchId: church.id,
      name: "Célula Centro (demo)",
      leaderPersonId: memberPerson.id,
      meetsAtHint: "Terças 20h",
    },
  });

  console.log("Seed OK (fictício RF1 + portal ministries/events):", {
    org: org.slug,
    church: church.slug,
    churchDest: churchDest.slug,
    churchDestId: churchDest.id,
    household: household.id,
    persons: [
      person.id,
      memberPerson.id,
      visitorPerson.id,
      "demoPersonMenor01",
      liderJovensPerson.id,
    ],
    users: [
      adminUser.email,
      memberUser.email,
      pastorUser.email,
      liderJovensUser.email,
    ],
    memberships: [anaMembership.id, brunoMembership.id],
    f3: {
      track: "demoTrack01",
      ministry: "demoMinistry01",
      group: "demoGroup01",
    },
    portal: {
      ministries: portalMinistries.map((m) => m.slug),
      events: ["encontro-jovens-demo", "culto-familia-demo"],
    },
  });
}

/** Grant church-wide ou ministry-scoped (ministryId null = igreja). */
async function upsertChurchGrant(input: {
  prisma: PrismaClient;
  userId: string;
  roleId: string;
  organizationId: string;
  churchId: string;
  ministryId?: string | null;
}) {
  const existing = await input.prisma.grant.findFirst({
    where: {
      userId: input.userId,
      roleId: input.roleId,
      organizationId: input.organizationId,
      churchId: input.churchId,
      ministryId: input.ministryId ?? null,
    },
  });
  if (existing) {
    return existing;
  }
  return input.prisma.grant.create({
    data: {
      userId: input.userId,
      roleId: input.roleId,
      organizationId: input.organizationId,
      churchId: input.churchId,
      ministryId: input.ministryId ?? null,
    },
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
