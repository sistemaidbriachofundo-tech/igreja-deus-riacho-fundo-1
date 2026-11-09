import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { EventRegistrationsService } from "../events/event-registrations.service";
import { EventsService } from "../events/events.service";
import type { AuthUser } from "../auth/types/auth-user";
import { countsAreBalanced } from "./participation";
import { ReportsService } from "./reports.service";

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
  email: "sec@example.test",
  grants: [
    {
      roleCode: "SECRETARIA",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    },
  ],
};

const lider: AuthUser = {
  userId: "u-lider",
  personId: "p-lider",
  email: "lider@example.test",
  grants: [
    {
      roleCode: "LIDER_MINISTERIO",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: "m-jovens",
    },
  ],
};

const outroLider: AuthUser = {
  userId: "u-outro",
  personId: "p-outro",
  email: "outro@example.test",
  grants: [
    {
      roleCode: "LIDER_MINISTERIO",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: "m-homens",
    },
  ],
};

const membro: AuthUser = {
  userId: "u-membro",
  personId: "p-membro",
  email: "membro@example.test",
  grants: [
    {
      roleCode: "MEMBRO",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    },
  ],
};

type Row = Record<string, unknown> & { id: string };

/**
 * Persistência em memória do mesmo processo: create/update/find compartilham as tabelas.
 * Não substitui o Postgres da HML; prova o fluxo evento → presença → relatório sem duplicar contagem.
 */
function createMemoryPrisma() {
  const tables = new Map<string, Row[]>();
  let seq = 1;
  const table = (name: string) => {
    let rows = tables.get(name);
    if (!rows) {
      rows = [];
      tables.set(name, rows);
    }
    return rows;
  };
  const hydrate = (name: string, row: Row): Row => {
    if (name === "eventRegistration") {
      const event = table("portalEvent").find((item) => item.id === row.eventId);
      return { ...row, event: event ? { ...event } : null };
    }
    if (name === "churchMembership") {
      const person = table("person").find((item) => item.id === row.personId);
      return { ...row, person: person ? { ...person } : null };
    }
    return { ...row };
  };
  const matches = (row: Row, where?: Record<string, unknown>): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([key, expected]) => {
      if (key === "AND" && Array.isArray(expected)) {
        return expected.every((item) =>
          matches(row, item as Record<string, unknown>),
        );
      }
      if (key === "OR" && Array.isArray(expected)) {
        return expected.some((item) =>
          matches(row, item as Record<string, unknown>),
        );
      }
      const value = row[key];
      if (
        expected &&
        typeof expected === "object" &&
        !(expected instanceof Date) &&
        !Array.isArray(expected)
      ) {
        const cond = expected as Record<string, unknown>;
        if ("in" in cond) return (cond.in as unknown[]).includes(value);
        if ("not" in cond) {
          return cond.not === null ? value != null : value !== cond.not;
        }
        if ("gte" in cond || "lte" in cond) {
          const time =
            value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
          if ("gte" in cond && time < new Date(String(cond.gte)).getTime()) return false;
          if ("lte" in cond && time > new Date(String(cond.lte)).getTime()) return false;
          return true;
        }
        if (value && typeof value === "object") {
          return matches(value as Row, cond);
        }
        return false;
      }
      return value === expected;
    });
  };
  const sortRows = (rows: Row[], orderBy?: unknown) => {
    const specs = !orderBy
      ? []
      : Array.isArray(orderBy)
        ? (orderBy as Array<Record<string, string>>)
        : [orderBy as Record<string, string>];
    return [...rows].sort((left, right) => {
      for (const spec of specs) {
        const key = Object.keys(spec)[0];
        if (!key) continue;
        const dir = spec[key] === "desc" ? -1 : 1;
        const a = left[key];
        const b = right[key];
        if (a === b) continue;
        if (a == null) return -1 * dir;
        if (b == null) return 1 * dir;
        if (a instanceof Date && b instanceof Date) {
          return (a.getTime() - b.getTime()) * dir;
        }
        return String(a).localeCompare(String(b)) * dir;
      }
      return 0;
    });
  };
  const apiFor = (name: string) => ({
    async create({ data }: { data: Record<string, unknown> }) {
      const row = {
        ...data,
        id: (data.id as string) ?? `${name}_${seq++}`,
        createdAt: (data.createdAt as Date) ?? new Date(),
        updatedAt: new Date(),
      } as Row;
      table(name).push(row);
      return { ...row };
    },
    async findFirst(args?: { where?: Record<string, unknown> }) {
      const found = table(name).find((row) => matches(hydrate(name, row), args?.where));
      return found ? { ...hydrate(name, found) } : null;
    },
    async findMany(args?: {
      where?: Record<string, unknown>;
      orderBy?: unknown;
      take?: number;
      select?: Record<string, boolean>;
    }) {
      let rows = sortRows(
        table(name)
          .map((row) => hydrate(name, row))
          .filter((row) => matches(row, args?.where)),
        args?.orderBy,
      );
      if (args?.take) rows = rows.slice(0, args.take);
      if (!args?.select) return rows.map((row) => ({ ...row }));
      return rows.map((row) => {
        const picked: Row = { id: row.id };
        for (const key of Object.keys(args.select ?? {})) {
          if (args.select?.[key]) picked[key] = row[key];
        }
        return picked;
      });
    },
    async update({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) {
      const found = table(name).find((row) => matches(row, where));
      if (!found) throw new Error(`missing ${name}`);
      Object.assign(found, data, { updatedAt: new Date() });
      return { ...hydrate(name, found) };
    },
    async count(args?: { where?: Record<string, unknown> }) {
      return table(name).filter((row) => matches(hydrate(name, row), args?.where)).length;
    },
    async aggregate(args: {
      where?: Record<string, unknown>;
      _sum?: { partySize?: boolean };
    }) {
      const rows = table(name).filter((row) => matches(hydrate(name, row), args.where));
      const partySize = rows.reduce(
        (total, row) => total + (typeof row.partySize === "number" ? row.partySize : 0),
        0,
      );
      return { _sum: { partySize: rows.length === 0 ? null : partySize } };
    },
    async groupBy(args: {
      by: string[];
      where?: Record<string, unknown>;
      _count?: { _all?: boolean };
      _sum?: { partySize?: boolean };
    }) {
      const groups = new Map<string, { key: Row; rows: Row[] }>();
      for (const row of table(name).filter((item) =>
        matches(hydrate(name, item), args.where),
      )) {
        const key: Row = { id: "" };
        for (const field of args.by) key[field] = row[field] ?? null;
        const sig = JSON.stringify(args.by.map((field) => key[field]));
        const bucket = groups.get(sig) ?? { key, rows: [] };
        bucket.rows.push(row);
        groups.set(sig, bucket);
      }
      return [...groups.values()].map((bucket) => ({
        ...bucket.key,
        ...(args._count ? { _count: { _all: bucket.rows.length } } : {}),
        ...(args._sum
          ? {
              _sum: {
                partySize: bucket.rows.reduce(
                  (total, row) =>
                    total + (typeof row.partySize === "number" ? row.partySize : 0),
                  0,
                ),
              },
            }
          : {}),
      }));
    },
  });
  const client = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "$transaction") {
          return async (fn: (tx: unknown) => Promise<unknown>) => fn(client);
        }
        if (prop === "then") return undefined;
        return apiFor(String(prop));
      },
    },
  );
  table("ministry").push({
    id: "m-jovens",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    name: "Jovens",
    slug: "jovens",
    publishStatus: "PUBLISHED",
  });
  return { client, table };
}

function visiblePdfText(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  const decoded = [...raw.matchAll(/<([0-9A-Fa-f]+)>/g)].map((match) =>
    Buffer.from(match[1], "hex").toString("latin1"),
  );
  return `${raw}\n${decoded.join("\n")}`;
}

describe("evento → presença → relatório", () => {
  it("persists a draft, publish, check-in and auditable counts without duplicating or exposing a minor", async () => {
    const db = createMemoryPrisma();
    const pilotService = { getPilotChurch: async () => pilot };
    const events = new EventsService(db.client as never, pilotService as never);
    const registrations = new EventRegistrationsService(
      db.client as never,
      pilotService as never,
    );
    const reports = new ReportsService(db.client as never, pilotService as never);

    const created = await events.create(secretaria, {
      name: "Encontro teste",
      slug: "encontro-teste",
      startsAt: "2026-12-01T19:00:00.000Z",
      description: "Evento sintético de homologação",
      locationText: "Salão de testes",
      ministryId: "m-jovens",
    });
    expect(created.status).toBe("DRAFT");
    const edited = await events.patch(secretaria, created.id, {
      description: "Evento sintético revisado",
    });
    expect(edited.description).toBe("Evento sintético revisado");
    const published = await events.publish(secretaria, created.id);
    expect(published.status).toBe("PUBLISHED");
    expect(db.table("portalEvent")).toHaveLength(1);

    const modality = await registrations.createModality(secretaria, created.id, {
      code: "individual",
      name: "Individual",
      kind: "CUSTOM",
      minPartySize: 1,
      maxPartySize: 8,
    });
    const adult = await registrations.createStaffRegistration(secretaria, created.id, {
      displayName: "TESTE Adulto",
      modalityId: modality.id,
      partySize: 2,
      isMinor: false,
    });
    const minor = await registrations.createStaffRegistration(secretaria, created.id, {
      displayName: "TESTE Menor",
      modalityId: modality.id,
      partySize: 1,
      isMinor: true,
      guardianDisplayName: "TESTE Responsavel",
      guardianAcknowledged: true,
    });
    expect(minor.status).toBe("CONFIRMED");
    await expect(registrations.checkIn(secretaria, minor.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const checked = await registrations.checkIn(
      secretaria,
      adult.id,
      adult.checkInCode,
    );
    expect(checked.status).toBe("CHECKED_IN");
    const again = await registrations.checkIn(
      secretaria,
      adult.id,
      adult.checkInCode,
    );
    expect(again.status).toBe("CHECKED_IN");
    expect(db.table("eventRegistration")).toHaveLength(2);
    expect(
      db.table("eventRegistration").filter((row) => row.status === "CHECKED_IN"),
    ).toHaveLength(1);

    const report = await reports.participation(secretaria, { eventId: created.id });
    expect(countsAreBalanced(report.counts)).toBe(true);
    expect(report.counts).toMatchObject({
      registrations: 2,
      checkedIn: 1,
      confirmedAwaitingPresence: 1,
      participants: 3,
      presentParticipants: 2,
      minorsOmitted: 1,
    });
    expect(report.rows.map((row) => row.syntheticLabel)).toEqual(["TESTE Adulto"]);
    expect(JSON.stringify(report)).not.toContain("TESTE Menor");
    expect(JSON.stringify(report)).not.toContain("TESTE Responsavel");
    expect(JSON.stringify(report)).not.toContain(adult.checkInCode);

    const repeated = await reports.participation(secretaria, { eventId: created.id });
    expect(repeated.counts).toEqual(report.counts);
    expect(db.table("eventRegistration")).toHaveLength(2);

    const csv = await reports.participationFile(
      secretaria,
      { eventId: created.id, status: "CHECKED_IN" },
      "csv",
    );
    const csvText = csv.bytes.toString("utf8");
    expect(csvText).toContain("TESTE Adulto");
    expect(csvText).toContain("CHECKED_IN");
    expect(csvText).not.toContain("TESTE Menor");
    expect(csvText.match(/TESTE Adulto/g)).toHaveLength(1);

    const pdf = await reports.participationFile(secretaria, { eventId: created.id }, "pdf");
    const pdfText = visiblePdfText(pdf.bytes);
    expect(pdf.bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(pdfText).toContain("TESTE Adulto");
    expect(pdfText).toContain("Menores omitidos 1");
    expect(pdfText).not.toContain("TESTE Menor");
    expect(pdfText).not.toContain(adult.checkInCode);

    const filtered = await reports.participation(secretaria, {
      eventId: created.id,
      from: "2026-12-01T00:00:00.000Z",
      to: "2026-12-02T00:00:00.000Z",
    });
    expect(filtered.counts.registrations).toBe(2);
    const outside = await reports.participation(secretaria, {
      eventId: created.id,
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
    });
    expect(outside.counts.registrations).toBe(0);

    await expect(
      reports.participation(outroLider, { eventId: created.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const own = await reports.participation(lider, { eventId: created.id });
    expect(own.counts.checkedIn).toBe(1);
    await expect(reports.participation(membro, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const audits = db.table("auditLog").map((row) => row.action);
    expect(audits).toEqual(
      expect.arrayContaining([
        "portal_event.create",
        "portal_event.patch",
        "event_registration.check_in",
        "report.participation.read",
        "report.participation.csv",
        "report.participation.pdf",
      ]),
    );
    expect(JSON.stringify(db.table("auditLog"))).not.toContain("TESTE Menor");
    expect(
      db.table("auditLog").filter((row) => row.action === "event_registration.check_in"),
    ).toHaveLength(1);
  });
});
