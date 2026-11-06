import { seedPhase1Mass } from "./seed-phase1";
import { PrismaClient } from "@prisma/client";
import {
  generateOpaqueCredentialToken,
  PILOT_CHURCH_SLUG,
  PILOT_ORG_SLUG,
} from "@idbrf/shared";

const prisma = new PrismaClient();

/**
 * Seeds locais podem usar "admin" somente em DEV/CI.
 * HML rodando em NODE_ENV=production exige hash Argon2id exclusivo,
 * fornecido via secret HML_DEMO_PASSWORD_HASH (nunca no GitHub).
 */
const DEMO_PASSWORD_HASH = (() => {
  const secretHash = process.env.HML_DEMO_PASSWORD_HASH?.trim();
  if (secretHash) {
    if (!secretHash.startsWith("$argon2id$")) throw new Error("Hash demo HML inválido");
    return secretHash;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed em produção bloqueado sem HML_DEMO_PASSWORD_HASH");
  }
  return "$argon2id$v=19$m=19456,t=2,p=1$Orwb01GobNLUv7ZiWJ0tbA$YzvnXjzMn5ffs7FYEHuw3xfoTmkQsD0KZXcBDS/fsgQ";
})();

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

  // F6: Ana também secretaria na congregação destino (church switch grants).
  await upsertChurchGrant({
    prisma,
    userId: adminUser.id,
    roleId: secretaria.id,
    organizationId: org.id,
    churchId: churchDest.id,
  });

  await upsertChurchGrant({
    prisma,
    userId: memberUser.id,
    roleId: membro.id,
    organizationId: org.id,
    churchId: church.id,
  });

  const platformRole = await prisma.role.findUniqueOrThrow({
    where: { code: "PLATFORM_ADMIN" },
  });

  const platformPerson = await prisma.person.upsert({
    where: { id: "demoPersonPlatform01" },
    update: {
      displayName: "Paula Demo Platform",
      email: "platform.demo@example.test",
      homeChurchId: church.id,
      organizationId: org.id,
      status: "ACTIVE",
      kind: "MEMBER",
    },
    create: {
      id: "demoPersonPlatform01",
      organizationId: org.id,
      homeChurchId: church.id,
      displayName: "Paula Demo Platform",
      email: "platform.demo@example.test",
      status: "ACTIVE",
      kind: "MEMBER",
    },
  });

  const platformUser = await prisma.user.upsert({
    where: { email: "platform.demo@example.test" },
    update: {
      personId: platformPerson.id,
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
    create: {
      personId: platformPerson.id,
      email: "platform.demo@example.test",
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
  });

  // PLATFORM_ADMIN org-wide (churchId null) — auditoria cross-church F6.
  await upsertOrgWideGrant({
    prisma,
    userId: platformUser.id,
    roleId: platformRole.id,
    organizationId: org.id,
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

  const atmosferaMinistry = await prisma.ministry.findUniqueOrThrow({
    where: { churchId_slug: { churchId: church.id, slug: "atmosfera" } },
  });

  const cmsSeeds = [
    {
      id: "demoCmsHome01",
      kind: "HOME_BLOCK" as const,
      slug: "home-boas-vindas",
      title: "Bem-vindo à casa (demo)",
      summary: "Bloco institucional fictício da home.",
      body: "Conteúdo sintético — sem dados reais.",
      sortOrder: 1,
      ministryId: null as string | null,
    },
    {
      id: "demoCmsBanner01",
      kind: "BANNER" as const,
      slug: "banner-culto-familia",
      title: "Culto em Família (banner demo)",
      summary: "Destaque de agenda",
      body: null,
      sortOrder: 1,
      ministryId: null as string | null,
      imageUrl: "/images/events/culto-familia-demo.jpg",
    },
    {
      id: "demoCmsNews01",
      kind: "NEWS" as const,
      slug: "aviso-voluntariado-atmosfera",
      title: "Voluntariado Atmosfera (demo)",
      summary: "Abertas as manifestações de interesse.",
      body: "Formulário público /public/volunteer-interests — dados fictícios.",
      sortOrder: 2,
      ministryId: atmosferaMinistry.id,
    },
    {
      id: "demoCmsPage01",
      kind: "PAGE" as const,
      slug: "sobre-nos",
      title: "Sobre nós (demo)",
      summary: "Página institucional sintética.",
      body: "História e missão fictícias da congregação piloto.",
      sortOrder: 0,
      ministryId: null as string | null,
    },
    {
      id: "demoCmsMinistryJovens01",
      kind: "MINISTRY_CONTENT" as const,
      slug: "jovens-trilhas",
      title: "Trilhas de Jovens (demo)",
      summary: "Conteúdo ligado ao ministério jovens.",
      body: "Material sintético de formação.",
      sortOrder: 1,
      ministryId: jovensMinistry.id,
    },
  ];

  for (const c of cmsSeeds) {
    await prisma.cmsContent.upsert({
      where: { churchId_slug: { churchId: church.id, slug: c.slug } },
      update: {
        title: c.title,
        summary: c.summary,
        body: c.body,
        kind: c.kind,
        sortOrder: c.sortOrder,
        ministryId: c.ministryId,
        status: "PUBLICADO",
        publishedAt: new Date("2026-11-05T12:00:00.000Z"),
        imageUrl: "imageUrl" in c ? c.imageUrl : null,
      },
      create: {
        id: c.id,
        organizationId: org.id,
        churchId: church.id,
        ministryId: c.ministryId,
        kind: c.kind,
        slug: c.slug,
        title: c.title,
        summary: c.summary,
        body: c.body,
        imageUrl: "imageUrl" in c ? c.imageUrl ?? null : null,
        sortOrder: c.sortOrder,
        status: "PUBLICADO",
        publishedAt: new Date("2026-11-05T12:00:00.000Z"),
        createdByUserId: adminUser.id,
        updatedByUserId: adminUser.id,
      },
    });
  }

  // —— F4 financeiro sintético (sem dados reais) ——
  const tesourariaRole = await prisma.role.findUniqueOrThrow({
    where: { code: "TESOURARIA" },
  });

  const tesouraPerson = await prisma.person.upsert({
    where: { id: "demoPersonTesoura01" },
    update: {
      displayName: "Teresa Demo Tesouraria",
      email: "tesouraria.demo@example.test",
      homeChurchId: church.id,
      organizationId: org.id,
      kind: "MEMBER",
      status: "ACTIVE",
    },
    create: {
      id: "demoPersonTesoura01",
      organizationId: org.id,
      homeChurchId: church.id,
      displayName: "Teresa Demo Tesouraria",
      email: "tesouraria.demo@example.test",
      status: "ACTIVE",
      kind: "MEMBER",
    },
  });

  const tesoura2Person = await prisma.person.upsert({
    where: { id: "demoPersonTesoura02" },
    update: {
      displayName: "Tiago Demo Tesouraria",
      email: "tesouraria2.demo@example.test",
      homeChurchId: church.id,
      organizationId: org.id,
      kind: "MEMBER",
      status: "ACTIVE",
    },
    create: {
      id: "demoPersonTesoura02",
      organizationId: org.id,
      homeChurchId: church.id,
      displayName: "Tiago Demo Tesouraria",
      email: "tesouraria2.demo@example.test",
      status: "ACTIVE",
      kind: "MEMBER",
    },
  });

  const tesouraUser = await prisma.user.upsert({
    where: { email: "tesouraria.demo@example.test" },
    update: {
      personId: tesouraPerson.id,
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
    create: {
      id: "demoUserTesoura01",
      personId: tesouraPerson.id,
      email: "tesouraria.demo@example.test",
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
  });

  const tesoura2User = await prisma.user.upsert({
    where: { email: "tesouraria2.demo@example.test" },
    update: {
      personId: tesoura2Person.id,
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
    create: {
      id: "demoUserTesoura02",
      personId: tesoura2Person.id,
      email: "tesouraria2.demo@example.test",
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
  });

  const tesoura3Person = await prisma.person.upsert({
    where: { id: "demoPersonTesoura03" },
    update: {
      displayName: "Tânia Demo Tesouraria",
      email: "tesouraria3.demo@example.test",
      homeChurchId: church.id,
      organizationId: org.id,
      kind: "MEMBER",
      status: "ACTIVE",
    },
    create: {
      id: "demoPersonTesoura03",
      organizationId: org.id,
      homeChurchId: church.id,
      displayName: "Tânia Demo Tesouraria",
      email: "tesouraria3.demo@example.test",
      status: "ACTIVE",
      kind: "MEMBER",
    },
  });

  const tesoura3User = await prisma.user.upsert({
    where: { email: "tesouraria3.demo@example.test" },
    update: {
      personId: tesoura3Person.id,
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
    create: {
      id: "demoUserTesoura03",
      personId: tesoura3Person.id,
      email: "tesouraria3.demo@example.test",
      passwordHash: DEMO_PASSWORD_HASH,
      status: "ACTIVE",
    },
  });

  await upsertChurchGrant({
    prisma,
    userId: tesouraUser.id,
    roleId: tesourariaRole.id,
    organizationId: org.id,
    churchId: church.id,
  });
  await upsertChurchGrant({
    prisma,
    userId: tesoura2User.id,
    roleId: tesourariaRole.id,
    organizationId: org.id,
    churchId: church.id,
  });
  await upsertChurchGrant({
    prisma,
    userId: tesoura3User.id,
    roleId: tesourariaRole.id,
    organizationId: org.id,
    churchId: church.id,
  });

  const accCaixa = await prisma.ledgerAccount.upsert({
    where: {
      churchId_code: { churchId: church.id, code: "1.1.01" },
    },
    update: { name: "Caixa (demo)", active: true },
    create: {
      id: "demoLedgerAccCaixa",
      organizationId: org.id,
      churchId: church.id,
      code: "1.1.01",
      name: "Caixa (demo)",
      type: "ASSET",
    },
  });

  const accBanco = await prisma.ledgerAccount.upsert({
    where: {
      churchId_code: { churchId: church.id, code: "1.1.02" },
    },
    update: { name: "Banco (demo)", active: true },
    create: {
      id: "demoLedgerAccBanco",
      organizationId: org.id,
      churchId: church.id,
      code: "1.1.02",
      name: "Banco (demo)",
      type: "ASSET",
    },
  });

  const accOfertas = await prisma.ledgerAccount.upsert({
    where: {
      churchId_code: { churchId: church.id, code: "4.1.01" },
    },
    update: { name: "Ofertas (demo)", active: true },
    create: {
      id: "demoLedgerAccOfertas",
      organizationId: org.id,
      churchId: church.id,
      code: "4.1.01",
      name: "Ofertas (demo)",
      type: "REVENUE",
    },
  });

  const accDespesas = await prisma.ledgerAccount.upsert({
    where: {
      churchId_code: { churchId: church.id, code: "5.1.01" },
    },
    update: { name: "Despesas gerais (demo)", active: true },
    create: {
      id: "demoLedgerAccDespesas",
      organizationId: org.id,
      churchId: church.id,
      code: "5.1.01",
      name: "Despesas gerais (demo)",
      type: "EXPENSE",
    },
  });

  // Entrada PENDING com 1ª aprovação — 2ª exige outro TESOURARIA (stub dupla).
  await prisma.ledgerEntry.upsert({
    where: { id: "demoLedgerEntry01" },
    update: {
      description: "Oferta culto domingo (sintético)",
      status: "PENDING_APPROVAL",
      amountCents: 25000,
      firstApprovedByUserId: tesoura2User.id,
      secondApprovedByUserId: null,
      secondApprovedAt: null,
    },
    create: {
      id: "demoLedgerEntry01",
      organizationId: org.id,
      churchId: church.id,
      entryDate: new Date("2026-11-02"),
      description: "Oferta culto domingo (sintético)",
      status: "PENDING_APPROVAL",
      amountCents: 25000,
      createdByUserId: tesouraUser.id,
      submittedAt: new Date("2026-11-02T18:00:00.000Z"),
      firstApprovedByUserId: tesoura2User.id,
      firstApprovedAt: new Date("2026-11-02T19:00:00.000Z"),
      lines: {
        create: [
          {
            id: "demoLedgerLine01a",
            accountId: accCaixa.id,
            side: "DEBIT",
            amountCents: 25000,
            memo: "entrada caixa",
          },
          {
            id: "demoLedgerLine01b",
            accountId: accOfertas.id,
            side: "CREDIT",
            amountCents: 25000,
            memo: "receita ofertas",
          },
        ],
      },
    },
  });

  await prisma.bankImportBatch.upsert({
    where: { id: "demoBankImport01" },
    update: {
      status: "PARSED_STUB",
      stubNote: "CSV sintético seed",
      lineCount: 2,
    },
    create: {
      id: "demoBankImport01",
      organizationId: org.id,
      churchId: church.id,
      format: "CSV",
      status: "PARSED_STUB",
      filename: "extrato-sintetico-nov.csv",
      stubNote: "CSV sintético seed — sem dados bancários reais",
      lineCount: 2,
      createdByUserId: tesouraUser.id,
      lines: {
        create: [
          {
            id: "demoBankLine01",
            postedAt: new Date("2026-11-02T12:00:00.000Z"),
            amountCents: 25000,
            description: "TED oferta demo",
            externalRef: "SYN-001",
            matchStatus: "SUGGESTED",
            matchedEntryId: "demoLedgerEntry01",
          },
          {
            id: "demoBankLine02",
            postedAt: new Date("2026-11-03T12:00:00.000Z"),
            amountCents: -4500,
            description: "Tarifa bancária demo",
            externalRef: "SYN-002",
            matchStatus: "UNMATCHED",
          },
        ],
      },
    },
  });

  await prisma.reconciliation.upsert({
    where: { id: "demoReconciliation01" },
    update: {
      title: "Fechamento Nov/2026 (demo)",
      status: "OPEN",
    },
    create: {
      id: "demoReconciliation01",
      organizationId: org.id,
      churchId: church.id,
      title: "Fechamento Nov/2026 (demo)",
      periodStart: new Date("2026-11-01"),
      periodEnd: new Date("2026-11-30"),
      status: "OPEN",
      notes: "Conciliação sintética para testes de dupla aprovação",
      createdByUserId: tesouraUser.id,
    },
  });

  if (process.env.SEED_HML_MASS === "true") {
    const mass = await seedPhase1Mass(prisma, org.id, church.id, adminUser.id);
    console.log("HML Fase 1: massa sintética adicionada", mass);
  }

  console.log("Seed OK (fictício RF1 + portal B–E + F4 ledger):", {
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
      tesouraPerson.id,
      tesoura2Person.id,
      tesoura3Person.id,
    ],
    users: [
      adminUser.email,
      memberUser.email,
      pastorUser.email,
      liderJovensUser.email,
      tesouraUser.email,
      tesoura2User.email,
      tesoura3User.email,
      platformUser.email,
