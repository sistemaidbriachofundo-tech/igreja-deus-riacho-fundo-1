/**
 * Catálogo estável da massa visual de DEV.
 * Pessoas e eventos são fictícios. Os IDs qaImg* nunca reaproveitam cadastro oficial.
 */
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export const QA_ORG_SLUG = "igreja-de-deus";
export const QA_CHURCH_SLUG = "riacho-fundo-1";
export const IMAGE_SOURCE_COMMIT = "61f1ed83eab1bfb2a6a97263c8d4e4726b15a54e";
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const DAY = 24 * 60 * 60 * 1000;

const PEOPLE_SPEC = [
  { n: 1, sex: "FEMALE", year: 1992, birthday: "today", kind: "MEMBER", membership: "ACTIVE", credential: "ACTIVE", household: true },
  { n: 2, sex: "MALE", year: 1986, birthday: "tomorrow", kind: "MEMBER", membership: "ACTIVE", credential: "ACTIVE", household: true },
  { n: 3, sex: "FEMALE", year: 2004, birthday: "2004-04-02", kind: "MEMBER", membership: "ACTIVE", credential: "ACTIVE" },
  { n: 4, sex: "MALE", year: 1958, birthday: "1958-08-19", kind: "VISITOR" },
  { n: 5, sex: "OTHER", year: 1990, birthday: "1990-03-14", kind: "MEMBER", membership: "PENDING_ADMISSION" },
  { n: 6, sex: "FEMALE", year: 1978, birthday: "1978-06-09", kind: "MEMBER", membership: "ACTIVE", credential: "REVOKED" },
  { n: 7, sex: "MALE", year: 1995, birthday: "1995-01-27", kind: "MEMBER", membership: "ACTIVE", credential: "ACTIVE" },
  { n: 8, sex: "FEMALE", year: 1982, birthday: "1982-09-03", kind: "MEMBER", membership: "ACTIVE", credential: "ACTIVE" },
  { n: 9, sex: "MALE", year: 1970, birthday: "1970-12-11", kind: "MEMBER", membership: "ACTIVE", credential: "ACTIVE" },
  { n: 10, sex: "FEMALE", year: 2001, birthday: "2001-05-22", kind: "MEMBER", membership: "ACTIVE", credential: "ACTIVE" },
  { n: 11, sex: "MALE", year: 1964, birthday: "1964-02-18", kind: "MEMBER", membership: "ACTIVE", credential: "ACTIVE" },
  { n: 12, sex: "FEMALE", year: 1998, birthday: "1998-10-07", kind: "MEMBER", membership: "ACTIVE", credential: "ACTIVE" },
];

export function stableOpaqueToken(key) {
  const digest = createHash("sha256").update(`qa-rf1-img-credential:${key}`).digest();
  let token = "";
  for (let index = 0; index < 32; index += 1) token += TOKEN_ALPHABET[digest[index] % TOKEN_ALPHABET.length];
  return token;
}

export function saoPauloDate(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const read = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function shiftDate(date, days) {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

function isoDate(date) {
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${date.year}-${month}-${day}`;
}

function atUtc(now, dayOffset, hour) {
  const date = new Date(now.getTime() + dayOffset * DAY);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function buildPeople(now) {
  const today = saoPauloDate(now);
  const tomorrow = shiftDate(today, 1);
  return PEOPLE_SPEC.map((spec) => {
    const birth = spec.birthday === "today"
      ? { ...today, year: spec.year }
      : spec.birthday === "tomorrow"
        ? { ...tomorrow, year: spec.year }
        : null;
    const birthDate = birth
      ? isoDate(birth)
      : spec.birthday;
    return {
      id: `qaImgPerson${pad(spec.n)}`,
      file: `pessoa-qa-${pad(spec.n)}.svg`,
      imageUrl: `/images/qa/people/pessoa-qa-${pad(spec.n)}.svg`,
      displayName: `Pessoa QA ${pad(spec.n)} (demonstração)`,
      email: `qa.pessoa.${pad(spec.n)}@example.test`,
      sex: spec.sex,
      kind: spec.kind,
      birthDate,
      birthdayLabel: spec.birthday === "today" ? "hoje" : spec.birthday === "tomorrow" ? "amanha" : "fixa",
      household: Boolean(spec.household),
      membership: spec.membership
        ? {
          id: `qaImgMembership${pad(spec.n)}`,
          status: spec.membership,
          notes: "Cadastro fictício QA. Sem documento real.",
        }
        : null,
      credential: spec.credential
        ? {
          id: `qaImgCredential${pad(spec.n)}`,
          status: spec.credential,
          opaqueToken: stableOpaqueToken(`pessoa-${pad(spec.n)}`),
          revokedAt: spec.credential === "REVOKED" ? "2026-01-15T15:00:00.000Z" : null,
        }
        : null,
    };
  });
}

function eventBase(spec, now) {
  const future = spec.when === "future";
  return {
    id: spec.id,
    slug: spec.slug,
    name: spec.name,
    file: spec.file,
    imageUrl: `/images/qa/events/${spec.file}`,
    description: "Evento fictício de demonstração DEV. Sem cobrança real e sem mensagem externa.",
    locationText: "Salão de demonstração DEV",
    when: spec.when,
    startsAt: atUtc(now, spec.day, 22),
    endsAt: atUtc(now, spec.day, 23),
    status: spec.status,
    ticketPolicy: spec.ticketPolicy,
    featuredOnHome: false,
    publishedAt: future ? atUtc(now, -2, 12) : atUtc(now, spec.day - 3, 12),
    cancelledAt: spec.status === "CANCELLED" ? atUtc(now, spec.day, 18) : null,
  };
}

function buildEvents(now, people) {
  const byNumber = (number) => people[number - 1];
  const specs = [
    eventBase({ id: "qaImgEventMocas", slug: "qa-dev-so-para-mocas", name: "Só para Moças — DEMONSTRAÇÃO DEV", file: "so-para-mocas.svg", when: "future", day: 21, status: "PUBLISHED", ticketPolicy: "PARTICIPANT" }, now),
    eventBase({ id: "qaImgEventHomens", slug: "qa-dev-encontro-homens", name: "Encontro de Homens — DEMONSTRAÇÃO DEV", file: "encontro-homens.svg", when: "future", day: 28, status: "PUBLISHED", ticketPolicy: "REGISTRATION" }, now),
    eventBase({ id: "qaImgEventRetiro", slug: "qa-dev-retiro-familias", name: "Retiro de Famílias — DEMONSTRAÇÃO DEV", file: "retiro-familias.svg", when: "future", day: 35, status: "PUBLISHED", ticketPolicy: "PARTICIPANT" }, now),
    eventBase({ id: "qaImgEventEnraizados", slug: "qa-dev-enraizados", name: "Enraizados — DEMONSTRAÇÃO DEV", file: "enraizados.svg", when: "future", day: 42, status: "PUBLISHED", ticketPolicy: "REGISTRATION" }, now),
    eventBase({ id: "qaImgEventAcolhimento", slug: "qa-dev-acolhimento", name: "Acolhimento — DEMONSTRAÇÃO DEV", file: "acolhimento.svg", when: "future", day: 49, status: "PUBLISHED", ticketPolicy: "REGISTRATION" }, now),
    eventBase({ id: "qaImgEventOficina", slug: "qa-dev-oficina", name: "Oficina paga — DEMONSTRAÇÃO DEV", file: "oficina-qa.svg", when: "future", day: 56, status: "PUBLISHED", ticketPolicy: "REGISTRATION" }, now),
    eventBase({ id: "qaImgEventMocasArquivo", slug: "qa-dev-mocas-arquivo", name: "Só para Moças — ARQUIVO DEV", file: "so-para-mocas.svg", when: "past", day: -40, status: "CANCELLED", ticketPolicy: "REGISTRATION" }, now),
    eventBase({ id: "qaImgEventHomensArquivo", slug: "qa-dev-homens-arquivo", name: "Encontro de Homens — ARQUIVO DEV", file: "encontro-homens.svg", when: "past", day: -70, status: "ARCHIVED", ticketPolicy: "REGISTRATION" }, now),
    eventBase({ id: "qaImgEventRetiroArquivo", slug: "qa-dev-retiro-arquivo", name: "Retiro de Famílias — ARQUIVO DEV", file: "retiro-familias.svg", when: "past", day: -100, status: "ARCHIVED", ticketPolicy: "REGISTRATION" }, now),
    eventBase({ id: "qaImgEventOficinaArquivo", slug: "qa-dev-oficina-arquivo", name: "Oficina paga — ARQUIVO DEV", file: "oficina-qa.svg", when: "past", day: -130, status: "ARCHIVED", ticketPolicy: "REGISTRATION" }, now),
  ];
  const modality = (event, code, name, kind, min, max) => ({
    id: `${event.id}Mod${code}`,
    eventId: event.id,
    code,
    name,
    kind,
    minPartySize: min,
    maxPartySize: max,
    capacity: 40,
    sortOrder: 0,
  });
  const lot = (event, code, name, extra) => ({
    id: `${event.id}Lot${code}`,
    eventId: event.id,
    modalityId: `${event.id}Mod${extra.modality}`,
    code,
    name,
    capacity: 40,
    priceCents: extra.priceCents ?? 0,
    currency: "BRL",
    opensAt: extra.opensAt ?? null,
    closesAt: extra.closesAt ?? null,
    status: extra.status ?? "OPEN",
    paymentProvider: extra.paymentProvider ?? "PIX",
    sortOrder: extra.sortOrder ?? 0,
  });
  const registration = (event, code, person, extra) => ({
    id: `${event.id}Reg${code}`,
    eventId: event.id,
    modalityId: `${event.id}Mod${extra.modality}`,
    lotId: `${event.id}Lot${extra.lot}`,
    personId: person.id,
    displayName: person.displayName,
    notificationEmail: person.email,
    partySize: extra.partySize,
    status: extra.status,
    paymentStatus: extra.paymentStatus,
    checkInCode: extra.checkInCode,
    checkedInAt: extra.checkedInAt ?? null,
    cancelledAt: extra.cancelledAt ?? null,
    participantRoster: extra.roster ?? null,
  });
  const ticket = (registrationId, position, code, person) => ({
    id: `${registrationId}Tk${position}`,
    registrationId,
    position,
    code,
    participantName: person.displayName,
    participantEmail: person.email,
  });
  const payment = (event, registrationId, lotCode, extra) => ({
    id: `${registrationId}Pay`,
    eventId: event.id,
    registrationId,
    lotId: `${event.id}Lot${lotCode}`,
    amountCents: extra.amountCents,
    currency: "BRL",
    status: extra.status,
    providerRef: extra.providerRef,
    paymentProvider: extra.paymentProvider,
    attemptRef: extra.attemptRef,
    dueOn: extra.dueOn ?? null,
    confirmedAt: extra.confirmedAt ?? null,
  });

  const [mocas, homens, retiro, enraizados, acolhimento, oficina, mocasArquivo, homensArquivo, retiroArquivo, oficinaArquivo] = specs;
  const p1 = byNumber(1);
  const p2 = byNumber(2);
  const p3 = byNumber(3);
  const p5 = byNumber(5);
  const p6 = byNumber(6);
  const p7 = byNumber(7);
  const p8 = byNumber(8);
  const p9 = byNumber(9);
  const p10 = byNumber(10);
  const p11 = byNumber(11);
  const p12 = byNumber(12);
  const modalities = [
    modality(mocas, "individual", "Individual", "INDIVIDUAL", 1, 1),
    modality(homens, "individual", "Individual", "INDIVIDUAL", 1, 1),
    modality(retiro, "familia", "Família", "FAMILY", 2, 6),
    modality(enraizados, "individual", "Individual", "INDIVIDUAL", 1, 1),
    modality(acolhimento, "individual", "Individual", "INDIVIDUAL", 1, 1),
    modality(oficina, "individual", "Individual", "INDIVIDUAL", 1, 1),
    modality(mocasArquivo, "individual", "Individual", "INDIVIDUAL", 1, 1),
    modality(homensArquivo, "individual", "Individual", "INDIVIDUAL", 1, 1),
    modality(retiroArquivo, "individual", "Individual", "INDIVIDUAL", 1, 1),
    modality(oficinaArquivo, "individual", "Individual", "INDIVIDUAL", 1, 1),
  ];
  const lots = [
    lot(mocas, "gratis", "Lote gratuito", { modality: "individual", priceCents: 0, status: "OPEN" }),
    lot(homens, "gratis", "Lote gratuito", { modality: "individual", priceCents: 0, status: "OPEN" }),
    lot(retiro, "gratis", "Lote gratuito", { modality: "familia", priceCents: 0, status: "OPEN" }),
    lot(enraizados, "vencido", "Lote vencido", { modality: "individual", priceCents: 1500, status: "CLOSED", closesAt: atUtc(now, -1, 12), sortOrder: 0 }),
    lot(enraizados, "pix", "Lote Pix mock", { modality: "individual", priceCents: 4500, status: "OPEN", paymentProvider: "PIX", sortOrder: 1 }),
    lot(acolhimento, "gratis", "Lote gratuito", { modality: "individual", priceCents: 0, status: "OPEN" }),
    lot(oficina, "pix", "Lote Pix mock", { modality: "individual", priceCents: 4500, status: "OPEN", paymentProvider: "PIX", sortOrder: 0 }),
    lot(oficina, "mp", "Lote Mercado Pago mock", { modality: "individual", priceCents: 8000, status: "OPEN", paymentProvider: "MERCADO_PAGO", sortOrder: 1 }),
    lot(mocasArquivo, "encerrado", "Lote encerrado", { modality: "individual", priceCents: 0, status: "CLOSED" }),
    lot(homensArquivo, "encerrado", "Lote encerrado", { modality: "individual", priceCents: 0, status: "CLOSED" }),
    lot(retiroArquivo, "encerrado", "Lote encerrado", { modality: "individual", priceCents: 0, status: "CLOSED", closesAt: atUtc(now, -90, 12) }),
    lot(oficinaArquivo, "mock", "Lote mock encerrado", { modality: "individual", priceCents: 4500, status: "CLOSED", paymentProvider: "PIX" }),
  ];
  const retiroRoster = [p2, p1, p7].map((person) => ({ name: person.displayName, email: person.email }));
  const registrations = [
    registration(mocas, "01", p1, { modality: "individual", lot: "gratis", partySize: 1, status: "CONFIRMED", paymentStatus: "CONFIRMED_MOCK", checkInCode: "QAIMGCHKMOCAS", roster: [{ name: p1.displayName, email: p1.email }] }),
    registration(homens, "01", p2, { modality: "individual", lot: "gratis", partySize: 1, status: "CONFIRMED", paymentStatus: "CONFIRMED_MOCK", checkInCode: "QAIMGCHKHOMENS" }),
    registration(retiro, "01", p2, { modality: "familia", lot: "gratis", partySize: 3, status: "CONFIRMED", paymentStatus: "CONFIRMED_MOCK", checkInCode: "QAIMGCHKRETIRO", roster: retiroRoster }),
    registration(enraizados, "01", p8, { modality: "individual", lot: "pix", partySize: 1, status: "PENDING_PAYMENT", paymentStatus: "PENDING", checkInCode: "QAIMGCHKENRAIZ" }),
    registration(acolhimento, "01", p3, { modality: "individual", lot: "gratis", partySize: 1, status: "CONFIRMED", paymentStatus: "CONFIRMED_MOCK", checkInCode: "QAIMGCHKACOLHE" }),
    registration(oficina, "01", p9, { modality: "individual", lot: "pix", partySize: 1, status: "PENDING_PAYMENT", paymentStatus: "PENDING", checkInCode: "QAIMGCHKOFIC01" }),
    registration(oficina, "02", p10, { modality: "individual", lot: "mp", partySize: 1, status: "CONFIRMED", paymentStatus: "CONFIRMED_MOCK", checkInCode: "QAIMGCHKOFIC02" }),
    registration(mocasArquivo, "01", p6, { modality: "individual", lot: "encerrado", partySize: 1, status: "CANCELLED", paymentStatus: "CANCELLED", checkInCode: "QAIMGCHKARQMOC", cancelledAt: mocasArquivo.cancelledAt }),
    registration(homensArquivo, "01", p11, { modality: "individual", lot: "encerrado", partySize: 1, status: "CHECKED_IN", paymentStatus: "CONFIRMED_MOCK", checkInCode: "QAIMGCHKARQHOM", checkedInAt: homensArquivo.startsAt }),
    registration(retiroArquivo, "01", p12, { modality: "individual", lot: "encerrado", partySize: 1, status: "CONFIRMED", paymentStatus: "CONFIRMED_MOCK", checkInCode: "QAIMGCHKARQRET" }),
    registration(oficinaArquivo, "01", p5, { modality: "individual", lot: "mock", partySize: 1, status: "CANCELLED", paymentStatus: "FAILED_MOCK", checkInCode: "QAIMGCHKARQOFI" }),
  ];
  const mocasReg = registrations[0];
  const retiroReg = registrations[2];
  const oficinaPaid = registrations[6];
  const homensArquivoReg = registrations[8];
  const tickets = [
    ticket(mocasReg.id, 1, "QAIMGTKTMOCAS1", p1),
    ticket(retiroReg.id, 1, "QAIMGTKTRET01", p2),
    ticket(retiroReg.id, 2, "QAIMGTKTRET02", p1),
    ticket(retiroReg.id, 3, "QAIMGTKTRET03", p7),
    ticket(oficinaPaid.id, 1, "QAIMGTKTOFIC10", p10),
    { ...ticket(homensArquivoReg.id, 1, "QAIMGTKTARQHOM", p11), checkedInAt: homensArquivo.startsAt },
  ];
  const payments = [
    payment(enraizados, registrations[3].id, "pix", { amountCents: 4500, status: "PENDING", paymentProvider: "PIX", providerRef: "qa-mock-pix-enraizados", attemptRef: "qa-mock-attempt-enraizados", dueOn: atUtc(now, -1, 12).slice(0, 10) }),
    payment(oficina, registrations[5].id, "pix", { amountCents: 4500, status: "PENDING", paymentProvider: "PIX", providerRef: "qa-mock-pix-oficina", attemptRef: "qa-mock-attempt-oficina-pix", dueOn: atUtc(now, -1, 12).slice(0, 10) }),
    payment(oficina, oficinaPaid.id, "mp", { amountCents: 8000, status: "CONFIRMED_MOCK", paymentProvider: "MERCADO_PAGO", providerRef: "qa-mock-mp-oficina", attemptRef: "qa-mock-attempt-oficina-mp", confirmedAt: atUtc(now, -1, 15) }),
    payment(oficinaArquivo, registrations[10].id, "mock", { amountCents: 4500, status: "FAILED_MOCK", paymentProvider: "PIX", providerRef: "qa-mock-pix-oficina-arquivo", attemptRef: "qa-mock-attempt-oficina-arquivo" }),
  ];
  return { events: specs, modalities, lots, registrations, tickets, payments };
}

export function buildQaImagePlan(now = new Date()) {
  const clock = now instanceof Date ? now : new Date(now);
  const people = buildPeople(clock);
  const events = buildEvents(clock, people);
  return {
    sourceCommit: IMAGE_SOURCE_COMMIT,
    generatedAt: clock.toISOString(),
    household: {
      id: "qaImgHousehold01",
      label: "Família QA Demonstração",
      address: "Conjunto QA, Riacho Fundo — demonstração",
    },
    people,
    ...events,
  };
}

export function listQaImageFiles(root) {
  const base = join(root, "apps/web/public/images/qa");
  const read = (dir) => readdirSync(join(base, dir)).filter((name) => name.endsWith(".svg")).sort();
  return { people: read("people"), events: read("events") };
}

export function publicEventCards(plan) {
  return plan.events
    .filter((event) => event.status === "PUBLISHED")
    .map((event) => ({
      slug: event.slug,
      name: event.name,
      imageUrl: event.imageUrl,
      startsAt: event.startsAt,
    }));
}

export const PERSONA_VIEWS = Object.freeze([
  { id: "admin", role: "PLATFORM_ADMIN", account: "platform.demo@example.test", route: "/app/membros/", sees: ["pessoas QA", "JPEG", "carteirinhas"] },
  { id: "secretaria", role: "SECRETARIA", account: "ana.demo@example.test", route: "/app/secretaria/", sees: ["membresia pendente", "carteirinha ativa", "carteirinha revogada"] },
  { id: "pastor", role: "PASTOR", account: "pastor.demo@example.test", route: "/app/membros/", sees: ["ficha QA"] },
  { id: "tesouraria", role: "TESOURARIA", account: "tesouraria.demo@example.test", route: "/app/tesouraria/", sees: ["pagamento mock"], hidden: ["JPEG", "senha"] },
  { id: "lider", role: "LIDER_MINISTERIO", account: "lider.jovens.demo@example.test", route: "/app/eventos/", sees: ["inscricoes de demonstracao"] },
  { id: "membro", role: "MEMBRO", account: "bruno.demo@example.test", route: "/app/eventos/?evento=qa-dev-so-para-mocas", sees: ["capa do evento", "propria carteirinha"] },
  { id: "editor", role: "EDITOR_SITE", account: "editor.demo@example.test", route: "/app/site/", sees: ["imageUrl sintetica"] },
  { id: "publicador", role: "PUBLICADOR_SITE", account: "publicador.demo@example.test", route: "/app/site/", sees: ["imageUrl sintetica"] },
  { id: "convidado", role: "PUBLIC", account: null, route: "/eventos/inscricao/?evento=qa-dev-so-para-mocas", sees: ["banner publico"], hidden: ["email", "JPEG", "token"] },
]);
