/**
 * Catálogo fictício da apresentação de homologação.
 * Nomes naturais, sem CPF, telefone, Pix ou contato real.
 * A marca de homologação fica no shell do script, não em cada nome.
 */
import { createHash } from "node:crypto";

export const SEED_PREFIX = "hmlpres_";
export const PILOT_ORG_SLUG = "igreja-de-deus";
export const PILOT_CHURCH_SLUG = "riacho-fundo-1";
export const EMAIL_DOMAIN = "@example.test";

const MINISTRY_ROLES = new Set(["LIDER", "COORDENADOR", "INTEGRANTE", "APOIO"]);
const MINISTRY_STATUSES = new Set(["ATIVO", "CONVIDADO", "PAUSADO", "ENCERRADO"]);
const ACTIVE_ROSTER = new Set(["PENDING", "CONFIRMED"]);
const CHURCH_UTC_OFFSET = "-03:00";

const PEOPLE = [
  ["joao-carvalho", "João Carvalho", "carvalho", false, null],
  ["helena-carvalho", "Helena Carvalho", "carvalho", false, null],
  ["lucas-carvalho", "Lucas Carvalho", "carvalho", true, "joao-carvalho"],
  ["maria-ferreira", "Maria Ferreira", "ferreira", false, null],
  ["pedro-ferreira", "Pedro Ferreira", "ferreira", false, null],
  ["paulo-mendes", "Paulo Mendes", "mendes", false, null],
  ["clara-mendes", "Clara Mendes", "mendes", false, null],
  ["sofia-mendes", "Sofia Mendes", "mendes", true, "paulo-mendes"],
  ["ana-ribeiro", "Ana Ribeiro", "ribeiro", false, null],
  ["rafael-ribeiro", "Rafael Ribeiro", "ribeiro", false, null],
  ["beatriz-nunes", "Beatriz Nunes", null, false, null],
  ["tiago-almeida", "Tiago Almeida", null, false, null],
  ["camila-rocha", "Camila Rocha", null, false, null],
  ["diego-martins", "Diego Martins", null, false, null],
  ["larissa-gomes", "Larissa Gomes", null, false, null],
  ["andre-souza", "André Souza", null, false, null],
  ["renata-lima", "Renata Lima", null, false, null],
  ["felipe-barbosa", "Felipe Barbosa", null, false, null],
  ["juliana-costa", "Juliana Costa", null, false, null],
  ["marcos-vieira", "Marcos Vieira", null, false, null],
  ["patricia-azevedo", "Patrícia Azevedo", null, false, null],
  ["henrique-dias", "Henrique Dias", null, false, null],
  ["elisa-cardoso", "Elisa Cardoso", null, false, null],
];

const HOUSEHOLDS = [
  ["carvalho", "Família Carvalho"],
  ["ferreira", "Família Ferreira"],
  ["mendes", "Família Mendes"],
  ["ribeiro", "Família Ribeiro"],
];

const MINISTRIES = [
  {
    key: "homens",
    slugs: ["homens"],
    nameHints: ["homem"],
    name: "Homens",
    description: "Comunhão e formação dos homens da congregação.",
    scheduleText: "Sábados, no período da manhã",
  },
  {
    key: "louvor",
    slugs: ["louvor", "louvor-demo"],
    nameHints: ["louvor"],
    name: "Louvor",
    description: "Música e acolhida nos cultos.",
    scheduleText: "Domingos, no culto da noite",
  },
  {
    key: "jovens",
    slugs: ["jovens"],
    nameHints: ["jovem"],
    name: "Jovens",
    description: "Encontros e acompanhamento da juventude.",
    scheduleText: "Sábados, à noite",
  },
  {
    key: "mulheres",
    slugs: ["mulheres"],
    nameHints: ["mulher"],
    name: "Mulheres",
    description: "Círculos de estudo e convivência.",
    scheduleText: "Quintas, à noite",
  },
  {
    key: "adolescentes",
    slugs: ["adolescentes"],
    nameHints: ["adolescent"],
    name: "Adolescentes",
    description: "Encontros com presença de responsáveis.",
    scheduleText: "Terças, à noite",
  },
  {
    key: "atmosfera",
    slugs: ["atmosfera"],
    nameHints: ["atmosfera"],
    name: "Atmosfera",
    description: "Hospitalidade e recepção nos cultos.",
    scheduleText: "Domingos, antes do culto",
  },
];

/** Papel formal. Não cria Grant e não é manifestação de interesse. */
const MEMBERSHIP_ROWS = [
  ["homens", "paulo-mendes", "LIDER", "ATIVO"],
  ["homens", "joao-carvalho", "COORDENADOR", "ATIVO"],
  ["homens", "pedro-ferreira", "INTEGRANTE", "ATIVO"],
  ["homens", "rafael-ribeiro", "INTEGRANTE", "ATIVO"],
  ["homens", "tiago-almeida", "INTEGRANTE", "ATIVO"],
  ["homens", "marcos-vieira", "INTEGRANTE", "ATIVO"],
  ["homens", "henrique-dias", "APOIO", "CONVIDADO"],
  ["homens", "andre-souza", "INTEGRANTE", "PAUSADO"],
  ["louvor", "maria-ferreira", "LIDER", "ATIVO"],
  ["louvor", "helena-carvalho", "COORDENADOR", "ATIVO"],
  ["louvor", "ana-ribeiro", "INTEGRANTE", "ATIVO"],
  ["louvor", "beatriz-nunes", "INTEGRANTE", "ATIVO"],
  ["louvor", "camila-rocha", "INTEGRANTE", "ATIVO"],
  ["louvor", "larissa-gomes", "INTEGRANTE", "ATIVO"],
  ["louvor", "juliana-costa", "APOIO", "ATIVO"],
  ["louvor", "renata-lima", "INTEGRANTE", "ATIVO"],
  ["jovens", "felipe-barbosa", "LIDER", "ATIVO"],
  ["jovens", "patricia-azevedo", "COORDENADOR", "ATIVO"],
  ["jovens", "diego-martins", "INTEGRANTE", "ATIVO"],
  ["jovens", "camila-rocha", "INTEGRANTE", "ATIVO"],
  ["jovens", "lucas-carvalho", "INTEGRANTE", "ATIVO"],
  ["jovens", "sofia-mendes", "INTEGRANTE", "ATIVO"],
  ["jovens", "pedro-ferreira", "APOIO", "ATIVO"],
  ["mulheres", "clara-mendes", "LIDER", "ATIVO"],
  ["mulheres", "beatriz-nunes", "COORDENADOR", "ATIVO"],
  ["mulheres", "maria-ferreira", "INTEGRANTE", "ATIVO"],
  ["mulheres", "ana-ribeiro", "INTEGRANTE", "ATIVO"],
  ["mulheres", "patricia-azevedo", "INTEGRANTE", "ATIVO"],
  ["mulheres", "larissa-gomes", "APOIO", "ATIVO"],
  ["adolescentes", "renata-lima", "LIDER", "ATIVO"],
  ["adolescentes", "juliana-costa", "COORDENADOR", "ATIVO"],
  ["adolescentes", "lucas-carvalho", "INTEGRANTE", "ATIVO"],
  ["adolescentes", "sofia-mendes", "INTEGRANTE", "ATIVO"],
  ["adolescentes", "tiago-almeida", "APOIO", "ATIVO"],
  ["atmosfera", "joao-carvalho", "LIDER", "ATIVO"],
  ["atmosfera", "helena-carvalho", "INTEGRANTE", "ATIVO"],
  ["atmosfera", "pedro-ferreira", "INTEGRANTE", "ATIVO"],
  ["atmosfera", "tiago-almeida", "INTEGRANTE", "ATIVO"],
  ["atmosfera", "henrique-dias", "APOIO", "ATIVO"],
  ["atmosfera", "andre-souza", "INTEGRANTE", "ENCERRADO"],
];

const ROSTER_ROWS = [
  {
    key: "louvor-15",
    ministry: "louvor",
    title: "Culto de domingo",
    serviceAt: "2026-11-15T22:00:00.000Z",
    status: "PUBLISHED",
    slots: [
      {
        key: "vocal",
        roleLabel: "Vocal",
        requiresCouple: true,
        person: "helena-carvalho",
        partner: "joao-carvalho",
        status: "CONFIRMED",
      },
      { key: "teclado", roleLabel: "Teclado", person: "maria-ferreira", status: "CONFIRMED" },
      { key: "apoio", roleLabel: "Apoio", person: "ana-ribeiro", status: "CONFIRMED" },
      { key: "coro", roleLabel: "Coro", person: "beatriz-nunes", status: "CONFIRMED" },
    ],
  },
  {
    key: "homens-21",
    ministry: "homens",
    title: "Encontro de homens",
    serviceAt: "2026-11-21T13:00:00.000Z",
    status: "PUBLISHED",
    slots: [
      { key: "coord", roleLabel: "Coordenação", person: "paulo-mendes", status: "CONFIRMED" },
      { key: "acolhida", roleLabel: "Acolhida", person: "pedro-ferreira", status: "CONFIRMED" },
      { key: "palavra", roleLabel: "Palavra", person: "rafael-ribeiro", status: "PENDING" },
      { key: "apoio", roleLabel: "Apoio", person: "tiago-almeida", status: "CONFIRMED" },
    ],
  },
  {
    key: "jovens-21",
    ministry: "jovens",
    title: "Noite jovem",
    serviceAt: "2026-11-21T22:00:00.000Z",
    status: "PUBLISHED",
    slots: [
      { key: "coord", roleLabel: "Coordenação", person: "felipe-barbosa", status: "CONFIRMED" },
      { key: "acolhida", roleLabel: "Acolhida", person: "patricia-azevedo", status: "CONFIRMED" },
      { key: "sala", roleLabel: "Sala", person: "diego-martins", status: "CONFIRMED" },
      { key: "apoio", roleLabel: "Apoio", person: "camila-rocha", status: "PENDING" },
    ],
  },
  {
    key: "adolescentes-17",
    ministry: "adolescentes",
    title: "Encontro de adolescentes",
    serviceAt: "2026-11-17T23:00:00.000Z",
    status: "PUBLISHED",
    slots: [
      { key: "coord", roleLabel: "Coordenação", person: "renata-lima", status: "CONFIRMED" },
      { key: "apoio", roleLabel: "Apoio", person: "juliana-costa", status: "CONFIRMED" },
      { key: "sala", roleLabel: "Sala", person: "lucas-carvalho", status: "CONFIRMED" },
      { key: "circulo", roleLabel: "Círculo", person: "sofia-mendes", status: "CONFIRMED" },
    ],
  },
  {
    key: "mulheres-19",
    ministry: "mulheres",
    title: "Círculo de mulheres",
    serviceAt: "2026-11-19T23:00:00.000Z",
    status: "PUBLISHED",
    slots: [
      { key: "coord", roleLabel: "Coordenação", person: "clara-mendes", status: "CONFIRMED" },
      { key: "palavra", roleLabel: "Palavra", person: "maria-ferreira", status: "CONFIRMED" },
      { key: "acolhida", roleLabel: "Acolhida", person: "ana-ribeiro", status: "CONFIRMED" },
      { key: "apoio", roleLabel: "Apoio", person: "beatriz-nunes", status: "CONFIRMED" },
    ],
  },
  {
    key: "louvor-22",
    ministry: "louvor",
    title: "Culto de domingo",
    serviceAt: "2026-11-22T22:00:00.000Z",
    status: "PUBLISHED",
    slots: [
      { key: "vocal", roleLabel: "Vocal", person: "maria-ferreira", status: "CONFIRMED" },
      {
        key: "teclado",
        roleLabel: "Teclado",
        person: "larissa-gomes",
        status: "SUBSTITUTED",
        substitute: { person: "camila-rocha", status: "CONFIRMED" },
      },
      { key: "coro", roleLabel: "Coro", person: "beatriz-nunes", status: "CONFIRMED" },
      { key: "violao", roleLabel: "Violão", person: "renata-lima", status: "DECLINED" },
    ],
  },
  {
    key: "atmosfera-29",
    ministry: "atmosfera",
    title: "Hospitalidade do culto",
    serviceAt: "2026-11-29T22:00:00.000Z",
    status: "PUBLISHED",
    slots: [
      { key: "porta", roleLabel: "Porta", person: "joao-carvalho", status: "CONFIRMED" },
      { key: "recepcao", roleLabel: "Recepção", person: "helena-carvalho", status: "CONFIRMED" },
      { key: "patio", roleLabel: "Pátio", person: "pedro-ferreira", status: "PENDING" },
      { key: "cafe", roleLabel: "Café", person: "tiago-almeida", status: "CONFIRMED" },
    ],
  },
];

const ACCOUNTS = [
  ["1.1.01", "Caixa", "ASSET"],
  ["1.2.01", "Valores a receber", "ASSET"],
  ["2.1.01", "Contas a pagar", "LIABILITY"],
  ["4.1.01", "Ofertas e dízimos", "REVENUE"],
  ["5.1.01", "Despesas de culto", "EXPENSE"],
  ["5.9.01", "Taxas operacionais", "EXPENSE"],
];

const LEDGER_ENTRIES = [
  {
    key: "oferta",
    description: "Oferta do culto de 8 de novembro",
    entryDate: "2026-11-08",
    lines: [
      ["1.1.01", "DEBIT", 18000],
      ["4.1.01", "CREDIT", 18000],
    ],
  },
  {
    key: "dizimo",
    description: "Dízimo do período",
    entryDate: "2026-11-08",
    lines: [
      ["1.2.01", "DEBIT", 9600],
      ["4.1.01", "CREDIT", 9600],
    ],
  },
  {
    key: "material",
    description: "Material de apoio ao culto",
    entryDate: "2026-11-09",
    lines: [
      ["5.1.01", "DEBIT", 4200],
      ["2.1.01", "CREDIT", 4200],
    ],
  },
  {
    key: "taxa",
    description: "Taxa operacional do período",
    entryDate: "2026-11-09",
    lines: [
      ["5.9.01", "DEBIT", 300],
      ["1.1.01", "CREDIT", 300],
    ],
  },
];

function personId(slug) {
  return `${SEED_PREFIX}person_${slug}`;
}

function emailFor(slug, isMinor) {
  if (isMinor) return null;
  return `${slug}@example.test`;
}

export function stableOpaqueToken(seed) {
  const first = createHash("sha256").update(`idriacho1-hml-credential-v1:${seed}`).digest();
  const second = createHash("sha256").update(`idriacho1-hml-credential-v1b:${seed}`).digest();
  return Buffer.concat([first, second]).subarray(0, 32).toString("base64url");
}

export function stableCheckInCode(seed) {
  return createHash("sha256").update(`idriacho1-hml-checkin-v1:${seed}`).digest("hex").slice(0, 32);
}

function churchDayKey(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function sensitive(value) {
  const text = String(value ?? "");
  return (
    /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(text) ||
    /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b/.test(text) ||
    /@/.test(text) ||
    /\bcpf\b/i.test(text) ||
    /\btelefone\b/i.test(text)
  );
}

function displayHasLab(value) {
  return /\b(demo|teste|test|mock|endpoint|schema|roster)\b/i.test(value);
}

export function buildCatalog() {
  const people = PEOPLE.map(([slug, displayName, householdKey, isMinor, guardianSlug]) => ({
    slug,
    id: personId(slug),
    displayName,
    email: emailFor(slug, isMinor),
    householdKey,
    householdId: householdKey ? `${SEED_PREFIX}household_${householdKey}` : null,
    isMinor,
    legalGuardianPersonId: guardianSlug ? personId(guardianSlug) : null,
    kind: slug === "elisa-cardoso" ? "VISITOR" : "MEMBER",
    avatarFile: `avatars/${slug}.svg`,
    photoStorageKey: `synthetic/avatars/${slug}.svg`,
  }));
  const bySlug = new Map(people.map((person) => [person.slug, person]));

  const households = HOUSEHOLDS.map(([key, label]) => ({
    key,
    id: `${SEED_PREFIX}household_${key}`,
    label,
  }));

  const ministries = MINISTRIES.map((ministry) => ({
    ...ministry,
    createdId: `${SEED_PREFIX}ministry_${ministry.key}`,
    coverFile: `scenes/${ministry.key}.svg`,
  }));

  const memberships = MEMBERSHIP_ROWS.map(([ministry, slug, role, status]) => ({
    id: `${SEED_PREFIX}mm_${ministry}_${slug}`,
    ministry,
    personId: personId(slug),
    slug,
    role,
    status,
    source: "DIRETO",
    endedAt: status === "ENCERRADO" ? "2026-10-01T00:00:00.000Z" : null,
  }));

  const rosters = ROSTER_ROWS.map((roster) => ({
    id: `${SEED_PREFIX}roster_${roster.key}`,
    key: roster.key,
    ministry: roster.ministry,
    title: roster.title,
    serviceAt: roster.serviceAt,
    status: roster.status,
    churchDay: churchDayKey(roster.serviceAt),
    slots: roster.slots.map((slot, index) => {
      const assignmentId = `${SEED_PREFIX}asg_${roster.key}_${slot.key}`;
      return {
        id: `${SEED_PREFIX}slot_${roster.key}_${slot.key}`,
        roleLabel: slot.roleLabel,
        requiresCouple: Boolean(slot.requiresCouple),
        sortOrder: index,
        assignment: {
          id: assignmentId,
          personId: personId(slot.person),
          slug: slot.person,
          partnerPersonId: slot.partner ? personId(slot.partner) : null,
          partnerSlug: slot.partner ?? null,
          status: slot.status,
          substitute: slot.substitute
            ? {
                id: `${assignmentId}_sub`,
                personId: personId(slot.substitute.person),
                slug: slot.substitute.person,
                status: slot.substitute.status,
                substituteForId: assignmentId,
              }
            : null,
        },
      };
    }),
  }));

  const availability = [];
  const seenWindow = new Set();
  for (const roster of rosters) {
    const at = new Date(roster.serviceAt);
    const weekday = at.getUTCDay();
    const minute = at.getUTCHours() * 60 + at.getUTCMinutes();
    const startMinute = Math.max(0, minute - 30);
    const endMinute = Math.min(1440, minute + 90);
    for (const slot of roster.slots) {
      const slugs = [slot.assignment.slug, slot.assignment.partnerSlug, slot.assignment.substitute?.slug];
      for (const slug of slugs) {
        if (!slug) continue;
        const id = `${SEED_PREFIX}av_${slug}_${weekday}_${startMinute}`;
        if (seenWindow.has(id)) continue;
        seenWindow.add(id);
        availability.push({
          id,
          personId: personId(slug),
          slug,
          weekday,
          startMinute,
          endMinute,
        });
      }
    }
  }

  const impediments = [
    {
      id: `${SEED_PREFIX}imp_andre-souza`,
      personId: personId("andre-souza"),
      slug: "andre-souza",
      startsAt: "2026-11-15T00:00:00.000Z",
      endsAt: "2026-11-16T03:00:00.000Z",
    },
  ];

  const members = people.filter((person) => person.kind === "MEMBER");
  const credentials = members.map((person) => ({
    id: `${SEED_PREFIX}cred_${person.slug}`,
    membershipId: `${SEED_PREFIX}cm_${person.slug}`,
    admissionId: `${SEED_PREFIX}adm_${person.slug}`,
    personId: person.id,
    slug: person.slug,
    opaqueToken: stableOpaqueToken(person.slug),
  }));

  const events = [
    {
      id: `${SEED_PREFIX}event_culto_08`,
      key: "culto-08",
      ministry: "louvor",
      name: "Culto de gratidão",
      slug: "hmlpres-culto-de-gratidao-8",
      description: "Culto dominical já realizado, com presença registrada.",
      startsAt: "2026-11-08T22:00:00.000Z",
      endsAt: "2026-11-09T00:30:00.000Z",
      locationText: "Templo — Riacho Fundo I",
      status: "PUBLISHED",
      featuredOnHome: false,
      imageFile: "scenes/culto.svg",
      modalities: [
        { id: `${SEED_PREFIX}mod_culto_08_ind`, code: "individual", name: "Individual", kind: "INDIVIDUAL", capacity: 120, minPartySize: 1, maxPartySize: 1 },
      ],
      lots: [
        { id: `${SEED_PREFIX}lot_culto_08_livre`, modalityCode: "individual", code: "livre", name: "Entrada livre", priceCents: 0, status: "OPEN", capacity: 120 },
      ],
      registrations: [
        reg("joao-08", "culto-08", "joao-carvalho", "CHECKED_IN", 1, false),
        reg("maria-08", "culto-08", "maria-ferreira", "CHECKED_IN", 1, false),
        reg("pedro-08", "culto-08", "pedro-ferreira", "CONFIRMED", 1, false),
        reg("elisa-08", "culto-08", "elisa-cardoso", "CONFIRMED", 1, false),
        reg("lucas-08", "culto-08", "lucas-carvalho", "CONFIRMED", 1, true, "joao-carvalho"),
        reg("henrique-08", "culto-08", "henrique-dias", "CANCELLED", 1, false),
      ],
    },
    {
      id: `${SEED_PREFIX}event_culto_15`,
      key: "culto-15",
      ministry: "louvor",
      name: "Culto de domingo",
      slug: "hmlpres-culto-de-domingo",
      description: "Culto da congregação no domingo à noite.",
      startsAt: "2026-11-15T22:00:00.000Z",
      endsAt: "2026-11-16T00:30:00.000Z",
      locationText: "Templo — Riacho Fundo I",
      status: "PUBLISHED",
      featuredOnHome: true,
      imageFile: "scenes/culto.svg",
      modalities: [
        { id: `${SEED_PREFIX}mod_culto_15_ind`, code: "individual", name: "Individual", kind: "INDIVIDUAL", capacity: 120, minPartySize: 1, maxPartySize: 1 },
      ],
      lots: [
        { id: `${SEED_PREFIX}lot_culto_15_livre`, modalityCode: "individual", code: "livre", name: "Entrada livre", priceCents: 0, status: "OPEN", capacity: 120 },
      ],
      registrations: [
        reg("joao-15", "culto-15", "joao-carvalho", "CONFIRMED", 1, false),
        reg("helena-15", "culto-15", "helena-carvalho", "CONFIRMED", 1, false),
        reg("sofia-15", "culto-15", "sofia-mendes", "CONFIRMED", 1, true, "paulo-mendes"),
      ],
    },
    {
      id: `${SEED_PREFIX}event_familias`,
      key: "familias",
      ministry: "homens",
      name: "Encontro das famílias",
      slug: "hmlpres-encontro-das-familias",
      description: "Manhã de convivência das famílias da congregação.",
      startsAt: "2026-11-21T13:00:00.000Z",
      endsAt: "2026-11-21T16:00:00.000Z",
      locationText: "Salão — Riacho Fundo I",
      status: "PUBLISHED",
      featuredOnHome: false,
      imageFile: "scenes/familias.svg",
      modalities: [
        { id: `${SEED_PREFIX}mod_familias_fam`, code: "familia", name: "Família", kind: "FAMILY", capacity: 80, minPartySize: 2, maxPartySize: 6 },
        { id: `${SEED_PREFIX}mod_familias_ind`, code: "individual", name: "Individual", kind: "INDIVIDUAL", capacity: 40, minPartySize: 1, maxPartySize: 1 },
      ],
      lots: [
        { id: `${SEED_PREFIX}lot_familias_livre`, modalityCode: "familia", code: "livre", name: "Entrada livre", priceCents: 0, status: "OPEN", capacity: 80 },
        { id: `${SEED_PREFIX}lot_familias_contrib`, modalityCode: "individual", code: "contribuicao", name: "Contribuição opcional", priceCents: 1500, status: "OPEN", capacity: 40 },
      ],
      registrations: [
        {
          ...reg("familia-carvalho", "familias", null, "CONFIRMED", 3, false),
          displayName: "Família Carvalho",
          modalityCode: "familia",
          lotCode: "livre",
        },
        {
          ...reg("familia-mendes", "familias", null, "CONFIRMED", 3, false),
          displayName: "Família Mendes",
          modalityCode: "familia",
          lotCode: "livre",
        },
        {
          ...reg("marcos-contrib", "familias", "marcos-vieira", "PENDING_PAYMENT", 1, false),
          modalityCode: "individual",
          lotCode: "contribuicao",
          payment: {
            id: `${SEED_PREFIX}pay_marcos-contrib`,
            amountCents: 1500,
            status: "PENDING",
            providerRef: "mock-hmlpres-marcos-contrib",
          },
        },
      ],
    },
  ];

  const accounts = ACCOUNTS.map(([code, name, type]) => ({
    id: `${SEED_PREFIX}acc_${code.replaceAll(".", "_")}`,
    code,
    name,
    type,
  }));

  const ledgerEntries = LEDGER_ENTRIES.map((entry) => {
    const amountCents = entry.lines
      .filter((line) => line[1] === "DEBIT")
      .reduce((sum, line) => sum + line[2], 0);
    return {
      id: `${SEED_PREFIX}entry_${entry.key}`,
      key: entry.key,
      description: entry.description,
      entryDate: entry.entryDate,
      amountCents,
      competenceYear: 2026,
      competenceMonth: 11,
      status: "APPROVED",
      lines: entry.lines.map(([code, side, amount]) => ({
        id: `${SEED_PREFIX}line_${entry.key}_${side.toLowerCase()}_${code.replaceAll(".", "_")}`,
        code,
        side,
        amountCents: amount,
      })),
    };
  });

  const smallGroup = {
    id: `${SEED_PREFIX}sg_carvalho`,
    name: "Célula Carvalho",
    leaderPersonId: personId("joao-carvalho"),
    meetsAtHint: "Domingos à tarde, em casa",
    members: ["joao-carvalho", "helena-carvalho", "lucas-carvalho", "maria-ferreira"].map((slug) => ({
      id: `${SEED_PREFIX}sgm_${slug}`,
      personId: personId(slug),
      role: slug === "joao-carvalho" ? "LEADER" : "MEMBER",
    })),
    meeting: {
      id: `${SEED_PREFIX}sgmeet_2026_11_08`,
      occurredAt: "2026-11-08T18:00:00.000Z",
      notes: "Leitura e oração em família",
      attendances: ["joao-carvalho", "helena-carvalho", "lucas-carvalho"].map((slug) => ({
        id: `${SEED_PREFIX}sgatt_${slug}`,
        personId: personId(slug),
        present: true,
      })),
    },
  };

  const catalog = {
    people,
    bySlug,
    households,
    ministries,
    memberships,
    rosters,
    availability,
    impediments,
    credentials,
    events,
    accounts,
    ledgerEntries,
    fund: {
      id: `${SEED_PREFIX}fund_culto`,
      code: "CULTO",
      name: "Culto",
    },
    costCenter: {
      id: `${SEED_PREFIX}cc_culto`,
      code: "CULTO",
      name: "Culto",
    },
    budget: {
      id: `${SEED_PREFIX}budget_2026_culto`,
      year: 2026,
      title: "Previsão de culto 2026",
      status: "ACTIVE",
      line: {
        id: `${SEED_PREFIX}budget_line_culto`,
        accountCode: "5.1.01",
        plannedCents: 200000,
        notes: "Material e apoio dos cultos",
      },
    },
    smallGroup,
    ledgerPosition: ledgerPosition(ledgerEntries, accounts),
    participation: participationOf(events),
  };
  assertCatalog(catalog);
  return catalog;
}

function reg(key, eventKey, slug, status, partySize, isMinor, guardianSlug = null) {
  const person = slug ? PEOPLE.find((row) => row[0] === slug) : null;
  return {
    id: `${SEED_PREFIX}reg_${key}`,
    key,
    eventKey,
    slug,
    displayName: person ? person[1] : null,
    modalityCode: "individual",
    lotCode: "livre",
    partySize,
    isMinor,
    guardianSlug,
    guardianDisplayName: guardianSlug
      ? PEOPLE.find((row) => row[0] === guardianSlug)?.[1] ?? null
      : null,
    status,
    paymentStatus: status === "PENDING_PAYMENT" ? "PENDING" : status === "CANCELLED" ? "CANCELLED" : "CONFIRMED_MOCK",
    checkInCode: stableCheckInCode(key),
    checkedInAt: status === "CHECKED_IN" ? "2026-11-08T22:20:00.000Z" : null,
    cancelledAt: status === "CANCELLED" ? "2026-11-07T15:00:00.000Z" : null,
    guardian: isMinor
      ? {
          id: `${SEED_PREFIX}guard_${key}`,
          status: "AUTHORIZED",
          acknowledgmentText: "Responsável ciente da participação neste encontro.",
          authorizedAt: "2026-11-07T18:00:00.000Z",
        }
      : null,
    payment: null,
  };
}

export function ledgerPosition(entries, accounts) {
  const typeByCode = new Map(accounts.map((account) => [account.code, account.type]));
  const position = {
    receitaRecebidaCents: 0,
    recebivelAbertoCents: 0,
    caixaLiquidadoCents: 0,
    despesaComprometidaCents: 0,
    disponivelCents: 0,
    brutoCents: 0,
    taxaCents: 0,
    liquidoCents: 0,
  };
  for (const entry of entries) {
    if (entry.status !== "APPROVED" && entry.status !== "REVERSED") continue;
    for (const line of entry.lines) {
      const code = line.code;
      const sign = line.side === "DEBIT" ? 1 : -1;
      if (code.startsWith("1.1")) position.caixaLiquidadoCents += sign * line.amountCents;
      if (code.startsWith("1.2")) position.recebivelAbertoCents += sign * line.amountCents;
      if (code.startsWith("2.1")) position.despesaComprometidaCents += -sign * line.amountCents;
      if (typeByCode.get(code) === "REVENUE" && line.side === "CREDIT") {
        position.brutoCents += line.amountCents;
      }
      if (code.startsWith("5.9") && line.side === "DEBIT") position.taxaCents += line.amountCents;
      if (
        (code.startsWith("1.1") && line.side === "DEBIT" && entryHasRevenueCredit(entry)) ||
        (code.startsWith("1.2") && line.side === "CREDIT")
      ) {
        position.receitaRecebidaCents += line.amountCents;
      }
    }
  }
  position.disponivelCents = position.caixaLiquidadoCents - position.despesaComprometidaCents;
  position.liquidoCents = position.brutoCents - position.taxaCents;
  return position;
}

function entryHasRevenueCredit(entry) {
  return entry.lines.some((line) => line.side === "CREDIT" && line.code.startsWith("4."));
}

export function participationOf(events) {
  const counts = {
    registrations: 0,
    cancelled: 0,
    checkedIn: 0,
    pendingPayment: 0,
    confirmedAwaitingPresence: 0,
    participants: 0,
    presentParticipants: 0,
    minorsOmitted: 0,
  };
  const rows = [];
  for (const event of events) {
    for (const registration of event.registrations) {
      counts.registrations += 1;
      if (registration.status === "CANCELLED") counts.cancelled += 1;
      else counts.participants += registration.partySize;
      if (registration.status === "CHECKED_IN") {
        counts.checkedIn += 1;
        counts.presentParticipants += registration.partySize;
      } else if (registration.status === "PENDING_PAYMENT") counts.pendingPayment += 1;
      else if (registration.status === "CONFIRMED") counts.confirmedAwaitingPresence += 1;
      if (registration.isMinor) {
        counts.minorsOmitted += 1;
        continue;
      }
      rows.push({
        id: registration.id,
        displayName: registration.displayName,
        status: registration.status,
      });
    }
  }
  return { counts, rows };
}

export function assertCatalog(catalog) {
  const slugs = new Set(catalog.people.map((person) => person.slug));
  const required = ["joao-carvalho", "maria-ferreira", "paulo-mendes", "ana-ribeiro"];
  for (const slug of required) {
    if (!slugs.has(slug)) throw new Error(`Pessoa obrigatória ausente: ${slug}`);
  }
  for (const person of catalog.people) {
    if (displayHasLab(person.displayName)) {
      throw new Error(`Nome com rótulo técnico: ${person.displayName}`);
    }
    if (person.email && !person.email.endsWith(EMAIL_DOMAIN)) {
      throw new Error(`E-mail fora de ${EMAIL_DOMAIN}`);
    }
    if (person.email && sensitive(person.email.replace(EMAIL_DOMAIN, ""))) {
      throw new Error("Parte local do e-mail parece dado pessoal");
    }
    if (person.isMinor && !person.legalGuardianPersonId) {
      throw new Error(`Menor sem responsável: ${person.slug}`);
    }
    if (!person.avatarFile.endsWith(".svg")) throw new Error("Avatar precisa ser SVG sintético");
  }
  const preservedEmails = catalog.people.map((person) => person.email).filter(Boolean);
  if (new Set(preservedEmails).size !== preservedEmails.length) {
    throw new Error("E-mail sintético duplicado");
  }

  for (const membership of catalog.memberships) {
    if (!MINISTRY_ROLES.has(membership.role) || !MINISTRY_STATUSES.has(membership.status)) {
      throw new Error(`Vínculo formal inválido: ${membership.id}`);
    }
    if (membership.status === "ENCERRADO" && !membership.endedAt) {
      throw new Error("Vínculo encerrado sem data");
    }
  }

  const activeByDay = new Map();
  for (const roster of rostersOf(catalog)) {
    if (displayHasLab(roster.title)) throw new Error(`Escala com rótulo técnico: ${roster.title}`);
    for (const slot of roster.slots) {
      const peopleOnSlot = [slot.assignment, slot.assignment.substitute].filter(Boolean);
      for (const assignment of peopleOnSlot) {
        if (slot.requiresCouple && assignment === slot.assignment && !assignment.partnerPersonId) {
          throw new Error(`Função de casal sem parceiro: ${slot.id}`);
        }
        if (!ACTIVE_ROSTER.has(assignment.status)) continue;
        const ids = [assignment.personId, assignment.partnerPersonId].filter(Boolean);
        for (const id of ids) {
          const key = `${roster.churchDay}:${id}`;
          if (activeByDay.has(key)) {
            throw new Error(`Mesma pessoa em duas escalas no dia ${roster.churchDay}`);
          }
          activeByDay.set(key, roster.id);
        }
        assertAvailable(catalog, assignment.personId, roster.serviceAt);
        if (assignment.partnerPersonId) assertAvailable(catalog, assignment.partnerPersonId, roster.serviceAt);
        assertNoImpediment(catalog, assignment.personId, roster.serviceAt);
      }
    }
  }

  for (const credential of catalog.credentials) {
    if (sensitive(credential.opaqueToken) || !/^[A-Za-z0-9_-]{22,86}$/.test(credential.opaqueToken)) {
      throw new Error("Token de carteirinha inseguro");
    }
  }
  for (const event of catalog.events) {
    if (displayHasLab(event.name) || displayHasLab(event.description)) {
      throw new Error(`Evento com rótulo técnico: ${event.name}`);
    }
    for (const registration of event.registrations) {
      if (registration.displayName && (displayHasLab(registration.displayName) || sensitive(registration.displayName))) {
        throw new Error("Inscrição com dado pessoal ou rótulo técnico");
      }
      if (!/^[a-f0-9]{32}$/.test(registration.checkInCode)) {
        throw new Error("Código de presença inválido");
      }
      if (registration.status === "CHECKED_IN" && registration.isMinor) {
        throw new Error("Menor não entra como presença publicada");
      }
      if (registration.status === "CHECKED_IN" && !registration.checkedInAt) {
        throw new Error("Presença sem horário");
      }
      if (registration.status === "PENDING_PAYMENT" && registration.payment?.status === "CONFIRMED_MOCK") {
        throw new Error("Pagamento pendente não pode nascer confirmado");
      }
      if (registration.isMinor && registration.guardian?.status !== "AUTHORIZED") {
        throw new Error("Menor sem autorização do responsável");
      }
    }
  }
  for (const entry of catalog.ledgerEntries) {
    const debit = entry.lines.filter((line) => line.side === "DEBIT").reduce((sum, line) => sum + line.amountCents, 0);
    const credit = entry.lines.filter((line) => line.side === "CREDIT").reduce((sum, line) => sum + line.amountCents, 0);
    if (debit !== credit || debit !== entry.amountCents || debit <= 0) {
      throw new Error(`Lançamento desequilibrado: ${entry.key}`);
    }
    if (displayHasLab(entry.description)) throw new Error("Descrição contábil com rótulo técnico");
  }
  const position = catalog.ledgerPosition;
  if (
    position.receitaRecebidaCents !== 18000 ||
    position.recebivelAbertoCents !== 9600 ||
    position.caixaLiquidadoCents !== 17700 ||
    position.despesaComprometidaCents !== 4200 ||
    position.disponivelCents !== 13500 ||
    position.brutoCents !== 27600 ||
    position.taxaCents !== 300 ||
    position.liquidoCents !== 27300
  ) {
    throw new Error(`Posição derivada inesperada: ${JSON.stringify(position)}`);
  }
  const participation = catalog.participation.counts;
  if (
    participation.checkedIn !== 2 ||
    participation.minorsOmitted !== 2 ||
    participation.pendingPayment !== 1 ||
    participation.cancelled !== 1
  ) {
    throw new Error(`Participação derivada inesperada: ${JSON.stringify(participation)}`);
  }
  return catalog;
}

function rostersOf(catalog) {
  return catalog.rosters;
}

function assertAvailable(catalog, personIdValue, serviceAt) {
  const windows = catalog.availability.filter((window) => window.personId === personIdValue);
  const at = new Date(serviceAt);
  const weekday = at.getUTCDay();
  const minute = at.getUTCHours() * 60 + at.getUTCMinutes();
  const open = windows.some(
    (window) => window.weekday === weekday && minute >= window.startMinute && minute < window.endMinute,
  );
  if (!open) throw new Error(`Fora da disponibilidade: ${personIdValue} em ${serviceAt}`);
}

function assertNoImpediment(catalog, personIdValue, serviceAt) {
  const at = new Date(serviceAt).getTime();
  const blocked = catalog.impediments.some(
    (item) =>
      item.personId === personIdValue &&
      new Date(item.startsAt).getTime() <= at &&
      new Date(item.endsAt).getTime() > at,
  );
  if (blocked) throw new Error(`Impedimento no horário da escala: ${personIdValue}`);
}

export const PUBLIC_IMAGE_DIR = "apps/web/public/images/synthetic";
