/**
 * Catálogo fictício da massa de QA.
 * E-mails só em example.test. Sem CPF, telefone, Pix real ou senha.
 */
import { createHash } from "node:crypto";

export const SEED_PREFIX = "qacomp_";
export const EMAIL_DOMAIN = "@example.test";
export const ORG_SLUG = "igreja-de-deus";
export const CHURCH_SLUG = "riacho-fundo-1";
export const ADDRESS = "Quadra fictícia 12, Bairro Demonstração, Riacho Fundo I";

const PEOPLE = [
  ["helena-carvalho", "Helena Carvalho", "carvalho", "adult", "F", "member", "#F6D7C3", "#6B3A2A", "#F4EFE6", "#1F4D4A", "cap"],
  ["joao-carvalho", "João Carvalho", "carvalho", "adult", "M", "member", "#E8B896", "#3B2416", "#F7F1E8", "#243E63", "side"],
  ["lucas-carvalho", "Lucas Carvalho", "carvalho", "child", "M", "member", "#F3D2B5", "#4A3428", "#FFF8EF", "#3E6B4F", "cap"],
  ["maria-ferreira", "Maria Ferreira", "ferreira", "adult", "F", "member", "#C68642", "#2B2118", "#F8F4EE", "#7A3048", "cap"],
  ["pedro-ferreira", "Pedro Ferreira", "ferreira", "adult", "M", "member", "#A86B4A", "#1C1C1C", "#F3EEE6", "#1F4D4A", "side"],
  ["paulo-mendes", "Paulo Mendes", "mendes", "elder", "M", "member", "#D4A574", "#C8C8C8", "#F6F3EE", "#3D3D3D", "cap"],
  ["clara-mendes", "Clara Mendes", "mendes", "adult", "F", "member", "#8D5524", "#1A120E", "#F7F1EA", "#6B2D5B", "side"],
  ["sofia-mendes", "Sofia Mendes", "mendes", "teen", "F", "member", "#E0B08A", "#4A2612", "#FFF7F0", "#8C3A3A", "cap"],
  ["ana-ribeiro", "Ana Ribeiro", "ribeiro", "young", "F", "member", "#5C3317", "#120E0C", "#F4EFE8", "#245C48", "side"],
  ["rafael-ribeiro", "Rafael Ribeiro", "ribeiro", "young", "M", "member", "#3B2212", "#0E0E0E", "#F6F1EA", "#1E3A5F", "cap"],
  ["beatriz-nunes", "Beatriz Nunes", "nunes", "adult", "F", "member", "#F6D7C3", "#7A4A32", "#F8F4EF", "#5C3D2E", "cap"],
  ["tiago-almeida", "Tiago Almeida", null, "adult", "M", "member", "#C68642", "#2A211C", "#F3EEE6", "#2F4858", "side"],
  ["camila-rocha", "Camila Rocha", null, "young", "F", "pending", "#E8B896", "#3D2418", "#FFF8F2", "#7D4E3B", "cap"],
  ["diego-martins", "Diego Martins", null, "young", "M", "member", "#8D5524", "#16120F", "#F6F1EA", "#3E4C3A", "side"],
  ["larissa-gomes", "Larissa Gomes", null, "adult", "F", "member", "#A86B4A", "#4A3428", "#F8F5F0", "#6A3A48", "cap"],
  ["andre-souza", "André Souza", null, "adult", "M", "member", "#5C3317", "#201812", "#F4EFE8", "#1F4D4A", "side"],
  ["renata-lima", "Renata Lima", null, "adult", "F", "member", "#D4A574", "#6B3A2A", "#F7F3EC", "#3D4F6F", "cap"],
  ["felipe-barbosa", "Felipe Barbosa", null, "young", "M", "member", "#3B2212", "#111111", "#F5F0E8", "#5A3A2A", "cap"],
  ["juliana-costa", "Juliana Costa", null, "adult", "F", "member", "#F3D2B5", "#8A5A3A", "#FFF8F1", "#2E5A4C", "side"],
  ["marcos-vieira", "Marcos Vieira", null, "adult", "M", "member", "#C68642", "#2C241C", "#F6F2EB", "#243E63", "side"],
  ["patricia-azevedo", "Patrícia Azevedo", null, "adult", "F", "member", "#E0B08A", "#4A2612", "#F8F4EE", "#7A3048", "cap"],
  ["henrique-dias", "Henrique Dias", null, "elder", "M", "member", "#A86B4A", "#D0D0D0", "#F4F1EB", "#3A3A3A", "cap"],
  ["elisa-cardoso", "Elisa Cardoso", null, "adult", "F", "visitor", "#F6D7C3", "#6B3A2A", "#F7F1E8", "#8C3A3A", "side"],
  ["nia-okonkwo", "Nia Okonkwo", null, "adult", "F", "member", "#3B2212", "#120E0C", "#F6F1EA", "#1F4D4A", "cap"],
  ["kenji-sato", "Kenji Sato", null, "adult", "M", "member", "#E8B896", "#1C1C1C", "#F4EFE6", "#2F4858", "side"],
  ["amira-hassan", "Amira Hassan", null, "adult", "F", "member", "#C68642", "#2B2118", "#F8F4EF", "#6B2D5B", "cap"],
  ["mateo-quispe", "Mateo Quispe", null, "young", "M", "member", "#8D5524", "#3B2416", "#F5F0E8", "#3E6B4F", "side"],
  ["ines-duarte", "Inês Duarte", null, "elder", "F", "member", "#F3D2B5", "#E4E4E4", "#F7F4EF", "#5C3D2E", "cap"],
  ["caio-benites", "Caio Benites", null, "teen", "M", "member", "#A86B4A", "#201812", "#FFF7F0", "#1E3A5F", "cap"],
  ["laila-nasser", "Laila Nasser", null, "young", "F", "member", "#5C3317", "#16120F", "#F6F1EA", "#7A3048", "side"],
  ["otavio-pires", "Otávio Pires", null, "adult", "M", "member", "#D4A574", "#4A3428", "#F4EFE8", "#243E63", "side"],
  ["yara-monteiro", "Yara Monteiro", null, "child", "F", "track", "#E0B08A", "#6B3A2A", "#FFF8F2", "#3E6B4F", "cap"],
];

const USERS = [
  ["admin", "PLATFORM_ADMIN", "paulo-mendes"],
  ["pastor", "PASTOR", "joao-carvalho"],
  ["secretaria", "SECRETARIA", "maria-ferreira"],
  ["tesouraria", "TESOURARIA", "pedro-ferreira"],
  ["editor", "EDITOR_SITE", "ana-ribeiro"],
  ["publicador", "PUBLICADOR_SITE", "beatriz-nunes"],
  ["lider", "LIDER_MINISTERIO", "helena-carvalho"],
  ["membro", "MEMBRO", "rafael-ribeiro"],
  ["convidado", "CONVIDADO", "elisa-cardoso"],
];

const ROLE_NAMES = {
  PLATFORM_ADMIN: "Administrador da plataforma",
  PASTOR: "Pastor / cuidado",
  SECRETARIA: "Secretaria",
  TESOURARIA: "Tesouraria",
  EDITOR_SITE: "Editor do site",
  PUBLICADOR_SITE: "Publicador do site",
  LIDER_MINISTERIO: "Líder de ministério",
  MEMBRO: "Membro",
  CONVIDADO: "Convidado",
};

const BANNERS = {
  mocas: ["#4A1E3D", "#E7B7C8", "#F7EDE0"],
  homens: ["#1B3A4B", "#D4AF37", "#E7EEF2"],
  familias: ["#1F4D4A", "#F0C36A", "#F7F1E8"],
  enraizados: ["#2E4A32", "#8FBF7A", "#F4EFE6"],
  acolhimento: ["#5C3D2E", "#E8B896", "#FFF8F1"],
  oficina: ["#243E63", "#F2C14E", "#F6F3EE"],
  passado: ["#3D3D3D", "#C8C8C8", "#F4F1EB"],
  cancelado: ["#5A3030", "#E0A0A0", "#F8F1F1"],
  arquivo: ["#2C3A40", "#9BB0B8", "#F3F6F7"],
  encerrada: ["#3E4C3A", "#C5D6B0", "#F6F3EC"],
};

function id(suffix) {
  return `${SEED_PREFIX}${suffix}`;
}

function emailFor(local) {
  return `${local}${EMAIL_DOMAIN}`;
}

export function opaqueToken(label) {
  return createHash("sha256").update(`qacomp-credential-v1:${label}`).digest("base64url");
}

export function checkInCode(label) {
  return createHash("sha256").update(`qacomp-checkin-v1:${label}`).digest("hex").slice(0, 32);
}

export function ticketCode(label) {
  return createHash("sha256").update(`qacomp-ticket-v1:${label}`).digest("hex").slice(0, 32);
}

function at(now, dayOffset, hourUtc) {
  const date = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  date.setUTCHours(hourUtc, 0, 0, 0);
  return date.toISOString();
}

function churchDay(now, offsetDays) {
  const date = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type).value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function birthDate(day, age) {
  const year = Number(day.slice(0, 4)) - age;
  return `${year}-${day.slice(5)}`;
}

function ageYears(age) {
  return { child: 8, teen: 15, young: 24, adult: 36, elder: 68 }[age];
}

function sensitive(value) {
  return /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(value) || /\bcpf\b/i.test(value);
}

export function buildCatalog(now = new Date()) {
  const today = churchDay(now, 0);
  const tomorrow = churchDay(now, 1);
  const people = PEOPLE.map(([slug, displayName, household, age, sex, lane, skin, hair, background, shirt, hairStyle]) => {
    const minor = age === "child" || age === "teen";
    const birthday = slug === "yara-monteiro" ? today : slug === "otavio-pires" ? tomorrow : "1990-06-15";
    return {
      slug,
      id: id(`person_${slug}`),
      displayName,
      email: minor ? null : emailFor(`qacomp-${slug}`),
      household,
      householdId: household ? id(`household_${household}`) : null,
      age,
      sex,
      lane,
      isMinor: minor,
      kind: lane === "visitor" || lane === "track" ? "VISITOR" : "MEMBER",
      birthDate: slug === "yara-monteiro" || slug === "otavio-pires" ? birthDate(birthday, ageYears(age)) : birthDate("1990-06-15", ageYears(age)),
      address: ADDRESS,
      portrait: { skin, hair, background, shirt, age, hairStyle },
      photoStorageKey: `synthetic/qa/portraits/${slug}.jpg`,
    };
  });
  const bySlug = new Map(people.map((person) => [person.slug, person]));
  for (const person of people) {
    if (person.slug === "lucas-carvalho") person.legalGuardianPersonId = bySlug.get("joao-carvalho").id;
    if (person.slug === "sofia-mendes" || person.slug === "yara-monteiro") {
      person.legalGuardianPersonId = bySlug.get("paulo-mendes").id;
    }
  }

  const households = [
    ["carvalho", "Família fictícia Carvalho"],
    ["ferreira", "Família fictícia Ferreira"],
    ["mendes", "Família fictícia Mendes"],
    ["ribeiro", "Família fictícia Ribeiro"],
    ["nunes", "Família fictícia Nunes"],
  ].map(([key, label]) => ({ id: id(`household_${key}`), label }));

  const ministry = {
    id: id("ministry_atmosfera"),
    slug: "qacomp-atmosfera",
    name: "Atmosfera — DEMONSTRAÇÃO DEV",
    description: "Ministério sintético para escalas de recepção, conexão, apoio, ofertas, estacionamento, santa ceia e louvor.",
    coverImageUrl: "/images/qa/events/qacomp-acolhimento.jpg",
  };

  const users = USERS.map(([key, role, personSlug]) => ({
    id: id(`user_${key}`),
    email: emailFor(`qacomp-${key}`),
    role,
    roleName: ROLE_NAMES[role],
    personId: bySlug.get(personSlug).id,
    personSlug,
  }));

  const churchMemberships = people.filter((person) => person.lane === "member" || person.lane === "pending").map((person) => ({
    id: id(`cm_${person.slug}`),
    personId: person.id,
    status: person.lane === "pending" ? "PENDING_ADMISSION" : "ACTIVE",
  }));

  const admissions = [
    ["helena-carvalho", "APPROVED", "secretaria", true, true],
    ["rafael-ribeiro", "APPROVED", "pastor", true, true],
    ["larissa-gomes", "AWAITING_SECRETARIA", "documents", false, false],
    ["andre-souza", "AWAITING_PASTOR", "secretaria", true, false],
    ["camila-rocha", "AWAITING_DOCUMENTS", "documents", false, false],
  ].map(([slug, status, step, secretariaApproved, pastorApproved]) => ({
    id: id(`adm_${slug}`),
    personId: bySlug.get(slug).id,
    membershipId: id(`cm_${slug}`),
    status,
    currentStep: step,
    modality: "BATISMO",
    modalityRecorded: status !== "AWAITING_DOCUMENTS",
    documentsComplete: status === "APPROVED",
    secretariaApproved,
    pastorApproved,
  }));

  const credentials = ["helena-carvalho", "rafael-ribeiro", "diego-martins"].map((slug) => ({
    id: id(`cred_${slug}`),
    personId: bySlug.get(slug).id,
    membershipId: id(`cm_${slug}`),
    status: slug === "diego-martins" ? "REVOKED" : "ACTIVE",
    opaqueToken: opaqueToken(slug),
    revoked: slug === "diego-martins",
  }));

  const banner = (key) => ({ background: BANNERS[key][0], primary: BANNERS[key][1], accent: BANNERS[key][2], shift: key.length });

  const events = [
    event(now, {
      key: "mocas", day: 21, name: "Só para Moças — DEMONSTRAÇÃO DEV", policy: "PARTICIPANT", banner: banner("mocas"),
      featured: true,
      lots: [
        ["gratis", "Lote gratuito", 0, "OPEN", "PIX", 21],
        ["pix", "Lote Pix demonstrativo", 4500, "OPEN", "PIX", 18],
      ],
      registrations: [
        reg("gratis-uma", "helena-carvalho", "gratis", 1, "CONFIRMED", "CONFIRMED_MOCK", false),
        reg("pix-pendente", "beatriz-nunes", "pix", 1, "PENDING_PAYMENT", "PENDING", false),
        reg("varias-confirmadas", "maria-ferreira", "pix", 1, "CONFIRMED", "CONFIRMED_PIX", true),
      ],
    }),
    event(now, {
      key: "homens", day: 28, name: "Encontro de Homens", policy: "REGISTRATION", banner: banner("homens"),
      lots: [["gratis", "Entrada livre", 0, "OPEN", "PIX", 28]],
      registrations: [reg("um", "joao-carvalho", "gratis", 1, "CONFIRMED", "CONFIRMED_MOCK", true)],
    }),
    event(now, {
      key: "familias", day: 35, name: "Retiro de Famílias", policy: "REGISTRATION", banner: banner("familias"),
      featured: true, retreat: true,
      lots: [
        ["gratis", "Criança acompanhada", 0, "OPEN", "PIX", 35],
        ["pix", "Família demonstrativa", 12000, "OPEN", "PIX", 30],
      ],
      registrations: [reg("familia", "joao-carvalho", "pix", 3, "CONFIRMED", "CONFIRMED_PIX", true)],
    }),
    event(now, {
      key: "enraizados", day: 42, name: "Enraizados", policy: "REGISTRATION", banner: banner("enraizados"),
      lots: [["gratis", "Inscrição livre", 0, "OPEN", "PIX", 42]],
      registrations: [reg("um", "nia-okonkwo", "gratis", 1, "CONFIRMED", "CONFIRMED_MOCK", true)],
    }),
    event(now, {
      key: "acolhimento", day: 14, name: "Acolhimento", policy: "REGISTRATION", banner: banner("acolhimento"),
      lots: [["gratis", "Acolhida", 0, "OPEN", "PIX", 14]],
      registrations: [
        reg("menor-pendente", "lucas-carvalho", "gratis", 1, "CONFIRMED", "CONFIRMED_MOCK", false, "PENDING"),
        reg("menor-autorizado", "sofia-mendes", "gratis", 1, "CONFIRMED", "CONFIRMED_MOCK", true, "AUTHORIZED"),
      ],
    }),
    event(now, {
      key: "oficina", day: 49, name: "Oficina paga", policy: "REGISTRATION", banner: banner("oficina"),
      lots: [
        ["mp", "Oficina Mercado Pago mock", 8000, "OPEN", "MERCADO_PAGO", 49],
        ["vencido", "Lote vencido", 12000, "CLOSED", "PIX", -2],
      ],
      registrations: [
        reg("pendente", "kenji-sato", "mp", 1, "PENDING_PAYMENT", "PENDING", false),
        reg("paga", "amira-hassan", "mp", 1, "CONFIRMED", "CONFIRMED_GATEWAY", true),
        reg("cancelada", "mateo-quispe", "mp", 1, "CANCELLED", "CANCELLED", false),
      ],
    }),
    event(now, {
      key: "culto-passado", day: -21, name: "Culto de gratidão — DEMONSTRAÇÃO DEV", policy: "REGISTRATION", banner: banner("passado"),
      lots: [["gratis", "Presença", 0, "CLOSED", "PIX", -21]],
      registrations: [reg("checkin", "rafael-ribeiro", "gratis", 1, "CHECKED_IN", "CONFIRMED_MOCK", true)],
    }),
    event(now, {
      key: "oficina-passada", day: -14, name: "Oficina encerrada — DEMONSTRAÇÃO DEV", policy: "REGISTRATION", banner: banner("encerrada"),
      lots: [["gratis", "Encerrada", 0, "CLOSED", "PIX", -14]],
      registrations: [reg("cancelada", "larissa-gomes", "gratis", 1, "CANCELLED", "CANCELLED", false)],
    }),
    event(now, {
      key: "cancelado", day: -10, name: "Encontro cancelado — DEMONSTRAÇÃO DEV", policy: "REGISTRATION", banner: banner("cancelado"),
      status: "CANCELLED",
      lots: [["gratis", "Cancelado", 0, "CLOSED", "PIX", -10]],
      registrations: [],
    }),
    event(now, {
      key: "arquivado", day: -40, name: "Acolhimento arquivado — DEMONSTRAÇÃO DEV", policy: "REGISTRATION", banner: banner("arquivo"),
      status: "ARCHIVED",
      lots: [["gratis", "Arquivado", 0, "CLOSED", "PIX", -40]],
      registrations: [reg("antiga", "renata-lima", "gratis", 1, "CHECKED_IN", "CONFIRMED_MOCK", true)],
    }),
  ];

  const modules = [
    ["recepcao", "Recepção", "Porta", "A", "esquerdo"],
    ["conexao", "Conexão", "Hall", "B", "direito"],
    ["apoio", "Apoio", "Nave", "C", "centro"],
    ["ofertas", "Ofertas", "Altar", "A", "esquerdo"],
    ["estacionamento", "Estacionamento", "Pátio", "D", "externo"],
    ["santa-ceia", "Santa Ceia", "Mesa", "A", "centro"],
    ["louvor", "Louvor", "Plataforma", "A", "centro"],
  ].map(([key, name, sector, zone, side], index) => ({
    id: id(`module_${key}`),
    key,
    name,
    sector,
    zone,
    side,
    sortOrder: index,
  }));

  const serviceAt = at(now, 7, 22);
  const roster = {
    id: id("roster_atmosfera"),
    title: "Escala demonstrativa de domingo",
    serviceAt,
    modules,
    slots: [
      slot("recepcao", "Recepção", "helena-carvalho", "CONFIRMED"),
      slot("conexao", "Conexão", "pedro-ferreira", "DECLINED"),
      slot("apoio", "Apoio", "tiago-almeida", "SUBSTITUTED", "diego-martins"),
      slot("ofertas", "Ofertas", "juliana-costa", "PENDING"),
      slot("estacionamento", "Estacionamento", "felipe-barbosa", "CONFIRMED"),
      slot("santa-ceia", "Santa Ceia", "maria-ferreira", "CONFIRMED"),
      slot("louvor", "Louvor", "helena-carvalho", "CONFIRMED", null, "joao-carvalho"),
    ],
  };

  const finance = {
    accounts: [
      [id("acct_caixa"), "QA.1.1.01", "Caixa demonstrativo", "ASSET"],
      [id("acct_pagar"), "QA.2.1.01", "Contas a pagar demonstrativo", "LIABILITY"],
      [id("acct_despesa"), "QA.5.1.01", "Despesa demonstrativa", "EXPENSE"],
      [id("acct_receita"), "QA.4.1.01", "Receita demonstrativa", "REVENUE"],
    ].map(([accountId, code, name, type]) => ({ id: accountId, code, name, type })),
    receiving: {
      id: id("receiving_pix"),
      ledgerAccountId: id("acct_caixa"),
      displayName: "Conta demonstrativa QA",
      pixKey: emailFor("qacomp-pix"),
    },
    expense: {
      id: id("entry_despesa"),
      description: "Despesa demonstrativa aguardando aprovação",
      amountCents: 15000,
      status: "PENDING_APPROVAL",
      entryDate: today,
      lines: [
        [id("line_despesa_d"), id("acct_despesa"), "DEBIT", 15000],
        [id("line_despesa_c"), id("acct_pagar"), "CREDIT", 15000],
      ],
    },
    offering: {
      id: id("entry_oferta"),
      description: "Oferta demonstrativa conciliada",
      amountCents: 8000,
      status: "APPROVED",
      entryDate: today,
      lines: [
        [id("line_oferta_d"), id("acct_caixa"), "DEBIT", 8000],
        [id("line_oferta_c"), id("acct_receita"), "CREDIT", 8000],
      ],
    },
    imports: [
      ["brb", "BRB", "brb-demonstrativo.ofx", id("line_brb"), 8000, "MATCHED", id("entry_oferta")],
      ["sicoob", "SICOOB", "sicoob-demonstrativo.ofx", id("line_sicoob"), -15000, "UNMATCHED", null],
      ["mp", "MOCK", "mp-mock-demonstrativo.ofx", id("line_mp"), 4500, "IGNORED", null],
    ].map(([key, adapter, filename, lineId, amountCents, matchStatus, matchedEntryId]) => ({
      id: id(`import_${key}`),
      adapter,
      filename,
      fileHash: createHash("sha256").update(`qacomp-ofx-v1:${key}`).digest("hex"),
      lineId,
      amountCents,
      matchStatus,
      matchedEntryId,
      postedAt: `${today}T12:00:00.000Z`,
      description: `Lançamento fictício ${adapter}`,
    })),
    reconciliation: {
      id: id("reconciliation_mes"),
      title: "Conciliação demonstrativa do mês",
      periodStart: today,
      periodEnd: today,
      status: "OPEN",
    },
    receipts: [
      {
        id: id("receipt_despesa"),
        entryId: id("entry_despesa"),
        storageKey: "qacomp/receipts/despesa-demonstrativa.jpg",
        displayName: "SEM VALOR FISCAL / QA — comprovante da despesa demonstrativa",
        caption: "DESPESA QA",
      },
      {
        id: id("receipt_oferta"),
        entryId: id("entry_oferta"),
        storageKey: "qacomp/receipts/oferta-demonstrativa.jpg",
        displayName: "SEM VALOR FISCAL / QA — comprovante da oferta demonstrativa",
        caption: "OFERTA QA",
      },
    ],
  };

  const catalog = {
    marker: SEED_PREFIX,
    generatedAt: now.toISOString(),
    today,
    tomorrow,
    people,
    households,
    ministry,
    users,
    churchMemberships,
    admissions,
    document: {
      id: id("doc_helena"),
      admissionId: id("adm_helena-carvalho"),
      storageKey: "qacomp/admissions/declaracao-sintetica.txt",
      displayName: "declaracao-sintetica.txt",
      text: "Documento sintético de demonstração. Sem documento pessoal.",
    },
    credentials,
    events,
    roster,
    finance,
    group: {
      id: id("group_bairro"),
      name: "Grupo fictício do Bairro Demonstração",
      leaderPersonId: bySlug.get("paulo-mendes").id,
      memberPersonId: bySlug.get("clara-mendes").id,
      meetingAddress: "Bairro Demonstração, quadra fictícia",
      photoUrl: "/images/qa/events/qacomp-familias.jpg",
    },
    track: {
      id: id("track_trilha"),
      code: "qacomp-trilha",
      name: "Trilha — DEMONSTRAÇÃO DEV",
      stageId: id("track_stage_1"),
      mentorPersonId: bySlug.get("paulo-mendes").id,
      exclusivePersonId: bySlug.get("yara-monteiro").id,
      memberPersonId: bySlug.get("sofia-mendes").id,
    },
    cms: {
      id: id("cms_banner"),
      slug: "qacomp-banner-revisao",
      title: "Banner em revisão — DEMONSTRAÇÃO DEV",
      imageUrl: "/images/qa/events/qacomp-mocas.jpg",
      status: "REVISAO",
    },
    interest: {
      id: id("interest_elisa"),
      personId: bySlug.get("elisa-cardoso").id,
      displayName: "Elisa Cardoso",
      email: emailFor("qacomp-elisa-cardoso"),
    },
    repertoire: {
      id: id("repertoire_domingo"),
      idempotencyKey: "qacomp-repertoire-domingo",
      serviceAt,
      items: [
        [id("song_1"), 0, "Canção de demonstração", "G"],
        [id("song_2"), 1, "Refrão fictício", "D"],
      ],
      noticePersonId: bySlug.get("helena-carvalho").id,
    },
    birthdays: [
      { id: id("bday_hoje"), personId: bySlug.get("yara-monteiro").id, occasionDate: today },
      { id: id("bday_amanha"), personId: bySlug.get("otavio-pires").id, occasionDate: tomorrow },
    ],
    vocal: { personId: bySlug.get("helena-carvalho").id, classification: "SOPRANO" },
    availability: {
      id: id("availability_helena"),
      personId: bySlug.get("helena-carvalho").id,
      weekday: new Date(serviceAt).getUTCDay(),
      startMinute: 21 * 60,
      endMinute: 23 * 60,
    },
    impediment: {
      id: id("impediment_pedro"),
      personId: bySlug.get("pedro-ferreira").id,
      startsAt: at(now, 7, 0),
      endsAt: at(now, 8, 3),
    },
    preference: { id: id("preference_felipe"), personId: bySlug.get("felipe-barbosa").id },
    ministryLinks: [
      ["helena-carvalho", "LIDER"],
      ["joao-carvalho", "INTEGRANTE"],
      ["maria-ferreira", "INTEGRANTE"],
      ["felipe-barbosa", "APOIO"],
    ].map(([slug, role]) => ({
      id: id(`mm_${slug}`),
      personId: bySlug.get(slug).id,
      role,
    })),
  };
  assertCatalogSafe(catalog);
  return catalog;
}

function event(now, spec) {
  const slug = `qacomp-${spec.key}`;
  const startsAt = at(now, spec.day, 22);
  const modalities = spec.retreat
    ? [{ id: id(`mod_${spec.key}_familia`), code: "familia", name: "Família", kind: "FAMILY", min: 2, max: 6 }]
    : [{ id: id(`mod_${spec.key}_individual`), code: "individual", name: "Individual", kind: "INDIVIDUAL", min: 1, max: 1 }];
  return {
    id: id(`event_${spec.key}`),
    slug,
    name: spec.name,
    description: "Evento sintético de demonstração. Nenhum pagamento ou mensagem sai deste ambiente.",
    imageUrl: `/images/qa/events/${slug}.jpg`,
    banner: { ...spec.banner, shift: spec.banner.shift + spec.key.length },
    startsAt,
    endsAt: at(now, spec.day, 23),
    locationText: "Templo — Riacho Fundo I",
    status: spec.status ?? "PUBLISHED",
    featuredOnHome: Boolean(spec.featured) && (spec.status ?? "PUBLISHED") === "PUBLISHED" && spec.day > 0,
    ticketPolicy: spec.policy,
    future: spec.day > 0,
    modalities,
    retreat: Boolean(spec.retreat),
    lots: spec.lots.map(([code, name, priceCents, status, provider, closesDay], index) => ({
      id: id(`lot_${spec.key}_${code}`),
      code,
      name,
      priceCents,
      status,
      provider,
      sortOrder: index,
      modalityCode: modalities[0].code,
      opensAt: at(now, closesDay - 20, 12),
      closesAt: at(now, closesDay, 20),
    })),
    registrations: spec.registrations.map((item) => registration(spec.key, item, modalities[0].code)),
  };
}

function reg(key, slug, lot, partySize, status, paymentStatus, withTickets, guardian = null) {
  return { key, slug, lot, partySize, status, paymentStatus, withTickets, guardian };
}

function registration(eventKey, item, modalityCode) {
  const names = [item.slug, "Acompanhante Fictício Um", "Acompanhante Fictício Dois"];
  return {
    id: id(`reg_${eventKey}_${item.key}`),
    personSlug: item.slug,
    modalityCode,
    lotCode: item.lot,
    partySize: item.partySize,
    status: item.status,
    paymentStatus: item.paymentStatus,
    checkInCode: checkInCode(`${eventKey}-${item.key}`),
    guardian: item.guardian,
    tickets: item.withTickets
      ? Array.from({ length: item.partySize }, (_, position) => ({
        position: position + 1,
        participantName: position === 0 ? null : names[position],
        code: ticketCode(`${eventKey}-${item.key}-${position + 1}`),
        checkedIn: item.status === "CHECKED_IN" && position === 0,
      }))
      : [],
    payment: item.paymentStatus === "CONFIRMED_MOCK" && item.lot === "gratis" ? null : {
      id: id(`pay_${eventKey}_${item.key}`),
      status: item.paymentStatus,
      providerRef: `mock-qacomp-${eventKey}-${item.key}`,
    },
  };
}

function slot(moduleKey, roleLabel, personSlug, status, substituteSlug = null, partnerSlug = null) {
  return { moduleKey, roleLabel, personSlug, status, substituteSlug, partnerSlug };
}

export function summarize(catalog) {
  const future = catalog.events.filter((item) => item.future && item.status === "PUBLISHED");
  const past = catalog.events.filter((item) => !item.future);
  return {
    people: catalog.people.length,
    portraits: catalog.people.length,
    futureEvents: future.length,
    pastEvents: past.length,
    events: catalog.events.map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      startsAt: item.startsAt,
      status: item.status,
      ticketPolicy: item.ticketPolicy,
      imageUrl: item.imageUrl,
      registrations: item.registrations.length,
      tickets: item.registrations.reduce((sum, registration) => sum + registration.tickets.length, 0),
    })),
    users: catalog.users.map((user) => ({ role: user.role, email: user.email, personId: user.personId })),
    credentials: catalog.credentials.map((item) => ({ id: item.id, status: item.status, personId: item.personId })),
    birthdays: catalog.birthdays,
    rosterId: catalog.roster.id,
    ministryId: catalog.ministry.id,
    trackId: catalog.track.id,
    expenseId: catalog.finance.expense.id,
    receipts: catalog.finance.receipts.map((item) => ({
      id: item.id,
      entryId: item.entryId,
      displayName: item.displayName,
    })),
    wrongCheckInExample: "00000000000000000000000000000000",
  };
}

function assertCatalogSafe(catalog) {
  const emails = [];
  const visit = (value) => {
    if (typeof value === "string") {
      if (sensitive(value)) throw new Error("Catálogo contém padrão de CPF");
      const found = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
      emails.push(...found);
    } else if (value && typeof value === "object") {
      for (const nested of Object.values(value)) visit(nested);
    }
  };
  visit(summarize(catalog));
  visit(catalog.people.map((person) => ({ email: person.email, name: person.displayName, address: person.address })));
  visit(catalog.finance.receiving);
  for (const email of emails) {
    if (!email.endsWith(EMAIL_DOMAIN)) throw new Error(`E-mail fora de ${EMAIL_DOMAIN}`);
  }
  if (catalog.people.length < 30) throw new Error("A massa precisa de pelo menos 30 pessoas sintéticas");
}
