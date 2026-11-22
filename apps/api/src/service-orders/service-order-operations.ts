import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  DEFAULT_SERVICE_ORDER_POLICY,
  normalizeServiceOrderPolicy,
  planServiceOrders,
  type PlannerInput,
  type ServiceOrderPolicyConfig,
} from "./service-order-planner";
import { mapServiceOrder, type ServiceOrderRow } from "./service-order-mapper";

type Store = PrismaClient | Prisma.TransactionClient;

const includeItems = { items: { orderBy: { position: "asc" as const } } };

export interface PolicyWrite {
  minGapDays: number;
  monthlyLimitPerPerson: number;
  avoidDualDirectionAndPreaching: boolean;
  skipUnavailable: boolean;
  blessingRoleKey: string;
  directionRoleKey: string;
  preachingRoleKey: string;
  slots: ServiceOrderPolicyConfig["slots"];
  roles: ServiceOrderPolicyConfig["roles"];
  pools: Array<{ roleKey: string; personIds: string[] }>;
}

export function policyFromWrite(input: PolicyWrite): ServiceOrderPolicyConfig {
  const pools: Record<string, string[]> = {};
  for (const pool of input.pools ?? []) {
    for (const personId of pool.personIds ?? []) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(personId)) {
        throw new BadRequestException("O rodízio usa identificadores de pessoas, sem nomes.");
      }
    }
    pools[pool.roleKey] = pool.personIds;
  }
  const policy = normalizeServiceOrderPolicy({ ...input, pools });
  if (/\bbispo\b|\bpastora\b/i.test(JSON.stringify(policy))) {
    throw new BadRequestException("As regras não fixam nomes de liderança.");
  }
  return policy;
}

export async function readPolicy(db: Store, churchId: string) {
  const row = await db.serviceOrderPolicy.findUnique({ where: { churchId } });
  const policy = normalizeServiceOrderPolicy((row?.config ?? null) as Partial<ServiceOrderPolicyConfig> | null);
  return {
    source: row ? "stored" as const : "default" as const,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    policy,
    defaults: DEFAULT_SERVICE_ORDER_POLICY,
  };
}

export async function savePolicy(db: Store, pilot: { organizationId: string; churchId: string }, actorId: string, input: PolicyWrite) {
  const policy = policyFromWrite(input);
  const row = await db.serviceOrderPolicy.upsert({
    where: { churchId: pilot.churchId },
    create: { organizationId: pilot.organizationId, churchId: pilot.churchId, config: policy as unknown as Prisma.InputJsonValue, updatedByUserId: actorId },
    update: { config: policy as unknown as Prisma.InputJsonValue, updatedByUserId: actorId },
  });
  await db.auditLog.create({
    data: {
      actorUserId: actorId, action: "service_order.policy", resourceType: "service_order_policy", resourceId: row.id,
      organizationId: pilot.organizationId, churchId: pilot.churchId,
      metadata: { minGapDays: policy.minGapDays, monthlyLimitPerPerson: policy.monthlyLimitPerPerson, slots: policy.slots.length, roles: policy.roles.length },
    },
  });
  return readPolicy(db, pilot.churchId);
}

export async function composePlan(db: Store, pilot: { organizationId: string; churchId: string }, year: number, month: number) {
  const { policy } = await readPolicy(db, pilot.churchId);
  const rangeStart = new Date(Date.UTC(year, month - 1, 1) - 36 * 3_600_000);
  const rangeEnd = new Date(Date.UTC(year, month, 1) + 36 * 3_600_000);
  const orders = await db.serviceOrder.findMany({ where: { churchId: pilot.churchId }, include: includeItems });
  const rosters = await db.roster.findMany({
    where: { churchId: pilot.churchId, status: "PUBLISHED", serviceAt: { gte: rangeStart, lt: rangeEnd } },
    include: { slots: { include: { assignments: { include: { person: { select: { id: true, displayName: true } } } } } } },
  });
  const impediments = await db.volunteerImpediment.findMany({
    where: { churchId: pilot.churchId, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
    select: { personId: true, startsAt: true, endsAt: true },
  });
  const exceptions = await db.serviceOrderException.findMany({
    where: { churchId: pilot.churchId, serviceAt: { gte: rangeStart, lt: rangeEnd } },
  });
  const repertoires = await db.worshipRepertoire.findMany({
    where: { churchId: pilot.churchId, serviceAt: { gte: rangeStart, lt: rangeEnd } },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  const poolIds = [...new Set(Object.values(policy.pools).flat())];
  const people = poolIds.length === 0 ? [] : await db.person.findMany({
    where: { id: { in: poolIds }, organizationId: pilot.organizationId },
    select: { id: true, displayName: true },
  });
  const monthOrders = orders.filter((order) => {
    const civil = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(order.serviceAt);
    return civil.slice(0, 7) === `${year}-${String(month).padStart(2, "0")}`;
  });
  const history = orders.filter((order) => !monthOrders.includes(order)).flatMap((order) => order.items.flatMap((item) => item.responsiblePersonId ? [{
    personId: item.responsiblePersonId,
    roleKey: item.roleKey ?? "etapa",
    serviceAt: order.serviceAt.toISOString(),
  }] : []));
  const input: PlannerInput = {
    year,
    month,
    policy,
    history,
    existingServiceAt: monthOrders.map((order) => order.serviceAt.toISOString()),
    locked: monthOrders.map((order) => ({
      serviceAt: order.serviceAt.toISOString(),
      title: order.title,
      kind: order.kind === "SPECIAL" ? "SPECIAL" as const : "REGULAR" as const,
      note: order.notes,
      items: [...order.items].sort((left, right) => left.position - right.position).map((item, position) => ({
        position,
        roleKey: item.roleKey ?? "etapa",
        title: item.title,
        minutes: item.minutes ?? 5,
        responsible: item.responsible,
        responsiblePersonId: item.responsiblePersonId,
        equipment: item.equipment,
        notes: item.itemNotes,
        alert: item.alert,
        startsAt: order.serviceAt.toISOString(),
      })),
    })),
    people: people.map((person) => ({ personId: person.id, displayName: person.displayName })),
    impediments: impediments.map((item) => ({ personId: item.personId, startsAt: item.startsAt.toISOString(), endsAt: item.endsAt.toISOString() })),
    exceptions: exceptions.map((item) => ({ serviceAt: item.serviceAt.toISOString(), kind: item.kind === "SKIP" ? "SKIP" : "SPECIAL", title: item.title, note: item.note })),
    rosters: rosters.map((roster) => ({
      serviceAt: roster.serviceAt.toISOString(),
      status: "PUBLISHED",
      slots: roster.slots.flatMap((slot) => slot.assignments.map((assignment) => ({
        personId: assignment.personId,
        displayName: assignment.person.displayName,
        roleLabel: slot.roleLabel,
        status: assignment.status,
      }))),
    })),
    songs: repertoires.flatMap((repertoire) => repertoire.items.map((item) => ({
      serviceAt: repertoire.serviceAt.toISOString(),
      title: item.title,
      musicalKey: item.musicalKey,
    }))),
  };
  return { plan: planServiceOrders(input), orders };
}

export async function generateDrafts(
  db: PrismaClient,
  pilot: { organizationId: string; churchId: string },
  actorId: string,
  year: number,
  month: number,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM churches WHERE id = ${pilot.churchId} FOR UPDATE`;
    const { plan } = await composePlan(tx, pilot, year, month);
    const created = [];
    const skipped: Array<{ serviceAt: string; orderId: string }> = [];
    for (const service of plan.services) {
      const current = await tx.serviceOrder.findFirst({
        where: { churchId: pilot.churchId, serviceAt: new Date(service.serviceAt) },
        select: { id: true },
      });
      if (current || service.existing) {
        skipped.push({ serviceAt: service.serviceAt, orderId: current?.id ?? "" });
        continue;
      }
      try {
        const row = await tx.serviceOrder.create({
          data: {
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            title: service.title,
            serviceAt: new Date(service.serviceAt),
            notes: service.note,
            status: "DRAFT",
            kind: service.kind,
            createdByUserId: actorId,
            items: { create: service.items.map((item) => ({
              position: item.position,
              title: item.title,
              minutes: item.minutes,
              responsible: item.responsible,
              roleKey: item.roleKey,
              responsiblePersonId: item.responsiblePersonId,
              equipment: item.equipment,
              itemNotes: item.notes,
              alert: item.alert,
            })) },
          },
          include: includeItems,
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actorId, action: "service_order.generate", resourceType: "service_order", resourceId: row.id,
            organizationId: pilot.organizationId, churchId: pilot.churchId,
            metadata: { status: "DRAFT", serviceAt: service.serviceAt, itemCount: service.items.length, openAlerts: service.alerts.length },
          },
        });
        created.push(mapServiceOrder(row));
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
          skipped.push({ serviceAt: service.serviceAt, orderId: "" });
          continue;
        }
        throw error;
      }
    }
    return { month: plan.month, timeZone: plan.timeZone, created, skipped, alerts: plan.alerts, preview: plan.services };
  });
}

export async function revisePublished(db: PrismaClient, pilot: { organizationId: string; churchId: string }, actorId: string, orderId: string, expectedUpdatedAt?: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM service_orders WHERE id = ${orderId} AND church_id = ${pilot.churchId} FOR UPDATE`;
    const current = await tx.serviceOrder.findFirst({ where: { ...pilot, id: orderId }, include: includeItems });
    if (!current) throw new NotFoundException("Ordem de culto não encontrada");
    if (expectedUpdatedAt && current.updatedAt.toISOString() !== expectedUpdatedAt) {
      throw new ConflictException({ code: "SERVICE_ORDER_STALE", message: "A ordem foi atualizada por outra gravação. Recarregue antes de continuar." });
    }
    if (current.status !== "PUBLISHED") {
      throw new ConflictException({ code: "SERVICE_ORDER_STATE", message: "A revisão versionada parte de uma ordem publicada." });
    }
    const snapshot = mapServiceOrder(current as ServiceOrderRow);
    await tx.serviceOrderRevision.create({
      data: { orderId, revision: current.revision, snapshot: snapshot as unknown as Prisma.InputJsonValue, createdByUserId: actorId },
    });
    const row = await tx.serviceOrder.update({
      where: { id: orderId },
      data: { status: "DRAFT", approvedByUserId: null, approvedAt: null, publishedByUserId: null, publishedAt: null, revision: { increment: 1 } },
      include: includeItems,
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actorId, action: "service_order.revise", resourceType: "service_order", resourceId: orderId,
        organizationId: pilot.organizationId, churchId: pilot.churchId,
        metadata: { fromRevision: current.revision, toRevision: row.revision, serviceAt: current.serviceAt.toISOString() },
      },
    });
    return mapServiceOrder(row);
  });
}

export async function briefingFor(db: Store, pilot: { churchId: string }, serviceAt: Date) {
  const [rosters, repertoires] = await Promise.all([
    db.roster.findMany({
      where: { churchId: pilot.churchId, serviceAt, status: "PUBLISHED" },
      include: { slots: { include: { assignments: { include: { person: { select: { id: true, displayName: true } } } } } } },
    }),
    db.worshipRepertoire.findMany({
      where: { churchId: pilot.churchId, serviceAt },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);
  return {
    roster: rosters.flatMap((roster) => roster.slots.flatMap((slot) => slot.assignments.map((assignment) => ({
      roleLabel: slot.roleLabel,
      personId: assignment.personId,
      displayName: assignment.person.displayName,
      status: assignment.status,
    })))),
    repertoire: repertoires.flatMap((repertoire) => repertoire.items.map((item) => ({
      title: item.title,
      musicalKey: item.musicalKey,
      status: repertoire.status,
    }))),
  };
}

export function duplicateException(): never {
  throw new ConflictException({ code: "SERVICE_ORDER_EXCEPTION_DUPLICATE", message: "Já existe essa exceção para o horário." });
}
