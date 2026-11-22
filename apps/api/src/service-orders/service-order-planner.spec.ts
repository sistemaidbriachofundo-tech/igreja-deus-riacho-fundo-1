import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_SERVICE_ORDER_POLICY,
  impedimentCovers,
  normalizeServiceOrderPolicy,
  planServiceOrders,
  rotationTieBreak,
  weekdayInTimeZone,
  zonedTimeToUtc,
  type PlannerInput,
} from "./service-order-planner";

const people = [
  { personId: "pessoa-ana", displayName: "Ana Costa" },
  { personId: "pessoa-bia", displayName: "Bia Nunes" },
  { personId: "pessoa-caio", displayName: "Caio Lima" },
];

function plan(extra: Partial<PlannerInput> = {}) {
  return planServiceOrders({
    year: 2027,
    month: 1,
    policy: {
      ...DEFAULT_SERVICE_ORDER_POLICY,
      pools: { direcao: ["pessoa-ana", "pessoa-bia", "pessoa-caio"], pregacao: ["pessoa-ana", "pessoa-bia", "pessoa-caio"], bencao: ["pessoa-ana", "pessoa-bia"] },
    },
    people,
    ...extra,
  });
}

function role(serviceIndex: number, key: string, result = plan()) {
  const service = result.services[serviceIndex];
  if (!service) throw new Error(`sem culto ${serviceIndex}`);
  const item = service.items.find((entry) => entry.roleKey === key);
  if (!item) throw new Error(`sem função ${key}`);
  return item;
}

describe("ordem de culto", () => {
  it("gera os cultos de janeiro no fuso de Brasília e repete o mesmo plano", () => {
    const previous = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    const first = plan();
    process.env.TZ = "UTC";
    const second = plan();
    process.env.TZ = previous;
    expect(first).toEqual(second);
    expect(zonedTimeToUtc(2027, 1, 3, 10, 0).toISOString()).toBe("2027-01-03T13:00:00.000Z");
    expect(weekdayInTimeZone(2027, 1, 3)).toBe(0);
    expect(weekdayInTimeZone(2027, 1, 7)).toBe(4);
    const instants = first.services.map((service) => service.serviceAt);
    expect(instants).toContain("2027-01-03T13:00:00.000Z");
    expect(instants).toContain("2027-01-03T22:00:00.000Z");
    expect(instants).toContain("2027-01-07T23:00:00.000Z");
    expect(first.services.filter((service) => service.title.startsWith("Culto de domingo"))).toHaveLength(10);
    expect(first.services.filter((service) => service.title === "Culto de quinta")).toHaveLength(4);
    expect(JSON.stringify(DEFAULT_SERVICE_ORDER_POLICY)).not.toMatch(/bispo|pastora/i);
    expect(normalizeServiceOrderPolicy(null)).toMatchObject({ minGapDays: 14, blessingRoleKey: "bencao" });
  });

  it("roda entre meses por identificador, ignora texto livre e não favorece o menor id", () => {
    const result = plan({
      history: [
        { personId: "pessoa-ana", roleKey: "pregacao", serviceAt: "2026-12-06T13:00:00.000Z" },
        { personId: "pessoa-ana", roleKey: "pregacao", serviceAt: "2026-12-13T13:00:00.000Z" },
        { personId: "pessoa-bia", roleKey: "pregacao", serviceAt: "2026-12-20T13:00:00.000Z" },
      ],
    });
    expect(role(0, "direcao", result).responsiblePersonId).toBe("pessoa-caio");
    const tied = ["pessoa-z", "pessoa-a", "pessoa-m"];
    const lexical = [...tied].sort()[0];
    let serviceAt = "";
    let chosen = lexical;
    for (let day = 7; day <= 28; day += 7) {
      serviceAt = zonedTimeToUtc(2027, 2, day, 10, 0).toISOString();
      chosen = [...tied].sort((left, right) => rotationTieBreak(serviceAt, "pregacao", left) - rotationTieBreak(serviceAt, "pregacao", right))[0] ?? lexical;
      if (chosen !== lexical) break;
    }
    expect(chosen).not.toBe(lexical);
    const february = planServiceOrders({
      year: 2027, month: 2, people: tied.map((personId) => ({ personId, displayName: `Nome ${personId}` })),
      policy: {
        ...DEFAULT_SERVICE_ORDER_POLICY,
        roles: [{ key: "pregacao", title: "Pregação", minutes: 35, source: "pool" }],
        slots: [{ weekday: 0, time: "10:00", title: "Culto" }],
        pools: { pregacao: tied },
      },
    });
    const service = february.services.find((item) => item.serviceAt === serviceAt);
    expect(service?.items[0]?.responsiblePersonId).toBe(chosen);
  });

  it("bloqueia indisponibilidade real, ausência e dupla função, e deixa A definir sem inventar alguém", () => {
    const result = plan({
      impediments: [{ personId: "pessoa-caio", startsAt: "2027-01-03T12:00:00.000Z", endsAt: "2027-01-03T23:00:00.000Z" }],
      policy: {
        ...DEFAULT_SERVICE_ORDER_POLICY,
        monthlyLimitPerPerson: 1,
        pools: { direcao: ["pessoa-ana"], pregacao: ["pessoa-ana"], bencao: ["pessoa-bia"] },
      },
    });
    expect(impedimentCovers(result ? [{ personId: "pessoa-caio", startsAt: "2027-01-03T12:00:00.000Z", endsAt: "2027-01-03T23:00:00.000Z" }] : [], "pessoa-caio", "2027-01-03T13:00:00.000Z")).toBe(true);
    expect(role(0, "direcao", result).responsiblePersonId).toBe("pessoa-ana");
    expect(role(0, "pregacao", result).responsible).toBeNull();
    expect(role(0, "pregacao", result).alert).toMatch(/direção e pregação/);
    const morning = plan({
      rosters: [{
        serviceAt: "2027-01-03T13:00:00.000Z", status: "PUBLISHED",
        slots: [
          { personId: "pessoa-bia", displayName: "Bia Nunes", roleLabel: "Louvor", status: "DECLINED" },
          { personId: "pessoa-caio", displayName: "Caio Lima", roleLabel: "Louvor", status: "CONFIRMED" },
          { personId: "pessoa-ana", displayName: "Ana Costa", roleLabel: "Louvor", status: "PENDING" },
        ],
      }, {
        serviceAt: "2027-01-03T13:00:00.000Z", status: "DRAFT",
        slots: [{ personId: "pessoa-bia", displayName: "Bia Nunes", roleLabel: "Louvor", status: "CONFIRMED" }],
      }],
    });
    expect(role(0, "louvor", morning).responsiblePersonId).toBe("pessoa-caio");
    const empty = plan({ policy: { ...DEFAULT_SERVICE_ORDER_POLICY, pools: {} }, rosters: [] });
    expect(role(0, "direcao", empty)).toMatchObject({ responsible: null, responsiblePersonId: null });
    expect(role(0, "direcao", empty).alert).toMatch(/A definir/);
    expect(JSON.stringify(empty)).not.toContain("voluntário inventado");
  });

  it("aplica limite do mês, intervalo e exceções explícitas", () => {
    const limited = plan({
      history: [{ personId: "pessoa-caio", roleKey: "direcao", serviceAt: "2027-01-03T13:00:00.000Z" }],
      policy: { ...DEFAULT_SERVICE_ORDER_POLICY, monthlyLimitPerPerson: 1, minGapDays: 14, pools: { direcao: ["pessoa-caio"], pregacao: ["pessoa-bia"], bencao: ["pessoa-ana"] } },
    });
    expect(role(0, "direcao", limited).responsiblePersonId).not.toBe("pessoa-caio");
    const recent = plan({
      history: [{ personId: "pessoa-bia", roleKey: "direcao", serviceAt: "2026-12-28T13:00:00.000Z" }],
      policy: { ...DEFAULT_SERVICE_ORDER_POLICY, pools: { direcao: ["pessoa-bia"], pregacao: ["pessoa-ana"], bencao: ["pessoa-ana"] } },
    });
    expect(role(0, "direcao", recent).responsible).toBeNull();
    expect(role(0, "direcao", recent).alert).toMatch(/Intervalo mínimo/);
    const skipped = plan({
      exceptions: [
        { serviceAt: "2027-01-07T23:00:00.000Z", kind: "SKIP", note: "Sem culto nesta quinta fictícia" },
        { serviceAt: "2027-01-03T22:00:00.000Z", kind: "SPECIAL", title: "Culto de Ceia", note: "Ceia fictícia registrada" },
      ],
    });
    expect(skipped.services.some((service) => service.serviceAt === "2027-01-07T23:00:00.000Z")).toBe(false);
    expect(skipped.alerts.join(" ")).toMatch(/exceção/);
    const special = skipped.services.find((service) => service.serviceAt === "2027-01-03T22:00:00.000Z");
    expect(special).toMatchObject({ kind: "SPECIAL", title: "Culto de Ceia" });
  });

  it("prefere confirmado, recalcula o horário e a migração só adiciona estrutura", () => {
    const result = plan();
    const opening = role(0, "abertura", result);
    const praise = role(0, "louvor", result);
    expect(opening.startsAt).toBe("2027-01-03T13:00:00.000Z");
    expect(praise.startsAt).toBe("2027-01-03T13:05:00.000Z");
    const sql = readFileSync(join(__dirname, "../../../../packages/db/prisma/migrations/20261122150000_service_order_central/migration.sql"), "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "service_order_policies"/);
    expect(sql.split("\n").some((line) => /^\s*(DROP|TRUNCATE|DELETE)\b/i.test(line))).toBe(false);
  });

  it("não aplica a massa fora da branch Neon de QA", () => {
    const root = join(__dirname, "../../../..");
    const blocked = spawnSync(process.execPath, ["scripts/dev/seed-ordem-culto-qa.mjs", "--check"], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "postgresql://user:secret@db.example.com/idriacho1_hml", OC_QA_SEED_CONFIRM: "br-twilight-bonus-b6moawk7", NEON_BRANCH_ID: "br-twilight-bonus-b6moawk7" },
    });
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain("SEED_BLOCKED_HOST");
    expect(blocked.stderr).not.toContain("secret");
    const checked = spawnSync(process.execPath, ["scripts/dev/seed-ordem-culto-qa.mjs", "--check"], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "postgresql://user:secret@ep-qa.neon.tech/idriacho1_hml?branch=br-twilight-bonus-b6moawk7", OC_QA_SEED_CONFIRM: "br-twilight-bonus-b6moawk7", NEON_BRANCH_ID: "br-twilight-bonus-b6moawk7" },
    });
    expect(checked.status).toBe(0);
    expect(checked.stdout).toContain('"applied":false');
    expect(checked.stdout).not.toContain("secret");
  });
});
