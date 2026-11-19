import { ConflictException, ForbiddenException } from "@nestjs/common";
import { ServiceOrdersService, type ServiceOrderWriteInput } from "./service-orders.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("ServiceOrdersService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };
  const pastor: AuthUser = {
    userId: "u-pastor", personId: "p-pastor", email: "pastor.demo@example.test",
    grants: [{ roleCode: "PASTOR", organizationId: "org1", churchId: "church-rf1" }],
  };
  const admin: AuthUser = {
    userId: "u-admin", personId: "p-admin", email: "admin.demo@example.test",
    grants: [{ roleCode: "PLATFORM_ADMIN", organizationId: "org1", churchId: null }],
  };
  const otherPastor: AuthUser = {
    userId: "u-outro", personId: "p-outro", email: "outro.demo@example.test",
    grants: [{ roleCode: "PASTOR", organizationId: "org1", churchId: "outra-igreja" }],
  };
  const morning: ServiceOrderWriteInput = {
    title: "Culto de domingo",
    serviceAt: "2027-01-03T10:00:00-03:00",
    notes: "Resumo fictício",
    items: [
      { title: "Oração", minutes: 5, responsible: "Pastoral" },
      { title: "Leitura", responsible: "Recepção" },
    ],
  };

  function database() {
    const orders: Array<Record<string, unknown>> = [];
    const items: Array<Record<string, unknown>> = [];
    const audits: Array<Record<string, unknown>> = [];
    let sequence = 0;
    const nextId = () => `id-${++sequence}`;
    const withItems = (order: Record<string, unknown>) => ({
      ...order,
      items: items.filter((item) => item.orderId === order.id).sort((left, right) => Number(left.position) - Number(right.position)),
    });
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      serviceOrder: {
        findMany: jest.fn(async () => orders.map(withItems)),
        findFirst: jest.fn(async ({ where }: { where: { id?: string; serviceAt?: Date; NOT?: { id: string } } }) => {
          const found = orders.find((order) => {
            if (where.id && order.id !== where.id) return false;
            if (where.serviceAt && +new Date(String(order.serviceAt)) !== +where.serviceAt) return false;
            if (where.NOT?.id && order.id === where.NOT.id) return false;
            return true;
          });
          return found ? withItems(found) : null;
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const created = data.items as { create: Array<Record<string, unknown>> };
          const order = {
            id: nextId(), title: data.title, serviceAt: data.serviceAt, notes: data.notes,
            status: "DRAFT", updatedAt: new Date("2027-01-01T12:00:00.000Z"),
            createdByUserId: data.createdByUserId,
          };
          orders.push(order);
          for (const item of created.create) items.push({ id: nextId(), orderId: order.id, ...item });
          return withItems(order);
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const order = orders.find((item) => item.id === where.id);
          if (!order) throw Object.assign(new Error("missing"), { code: "P2025" });
          const nested = data.items as { deleteMany?: unknown; create?: Array<Record<string, unknown>> } | undefined;
          if (nested?.deleteMany) {
            for (let index = items.length - 1; index >= 0; index -= 1) {
              if (items[index].orderId === order.id) items.splice(index, 1);
            }
          }
          for (const item of nested?.create ?? []) items.push({ id: nextId(), orderId: order.id, ...item });
          Object.assign(order, {
            title: data.title ?? order.title,
            serviceAt: data.serviceAt ?? order.serviceAt,
            notes: data.notes === undefined ? order.notes : data.notes,
            status: data.status ?? order.status,
            approvedByUserId: data.approvedByUserId === undefined ? order.approvedByUserId : data.approvedByUserId,
            approvedAt: data.approvedAt === undefined ? order.approvedAt : data.approvedAt,
            publishedByUserId: data.publishedByUserId,
            publishedAt: data.publishedAt,
            updatedAt: new Date("2027-01-01T12:05:00.000Z"),
          });
          return withItems(order);
        }),
      },
      auditLog: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; }) },
    };
    const prisma = { ...tx, $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) };
    return { prisma, orders, audits };
  }

  function service() {
    const db = database();
    return {
      ...db,
      api: new ServiceOrdersService(db.prisma as never, { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never),
    };
  }

  it("salva rascunho, aprova e publica uma ordem por culto", async () => {
    const { api, audits } = service();
    const created = await api.create(pastor, morning);
    expect(created).toMatchObject({
      title: "Culto de domingo",
      serviceAt: "2027-01-03T13:00:00.000Z",
      notes: "Resumo fictício",
      status: "DRAFT",
      items: [
        { position: 0, title: "Oração", minutes: 5, responsible: "Pastoral" },
        { position: 1, title: "Leitura", minutes: null, responsible: "Recepção" },
      ],
    });
    await expect(api.create(pastor, morning)).rejects.toMatchObject({ response: { code: "SERVICE_ORDER_DUPLICATE" } });
    const evening = await api.create(pastor, { ...morning, serviceAt: "2027-01-03T19:00:00-03:00", title: "Culto da noite" });
    expect(evening.serviceAt).toBe("2027-01-03T22:00:00.000Z");
    const approved = await api.approve(pastor, created.id, created.updatedAt);
    expect(approved.status).toBe("APPROVED");
    const again = await api.approve(pastor, created.id, approved.updatedAt);
    expect(again.status).toBe("APPROVED");
    const published = await api.publish(pastor, created.id, approved.updatedAt);
    expect(published.status).toBe("PUBLISHED");
    await expect(api.publish(pastor, evening.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(api.update(pastor, created.id, morning)).rejects.toMatchObject({ response: { code: "SERVICE_ORDER_LOCKED" } });
    const listed = await api.list(pastor);
    expect(listed.orders.map((order) => order.status)).toEqual(["PUBLISHED", "DRAFT"]);
    expect(audits.map((entry) => entry.action)).toEqual([
      "service_order.create", "service_order.create", "service_order.approve", "service_order.publish",
    ]);
    expect(JSON.stringify(audits)).not.toContain("Resumo fictício");
  });

  it("recusa gravação concorrente e reabre a ordem aprovada para edição", async () => {
    const { api } = service();
    const created = await api.create(pastor, morning);
    await expect(api.update(pastor, created.id, { ...morning, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }))
      .rejects.toMatchObject({ response: { code: "SERVICE_ORDER_STALE" } });
    const approved = await api.approve(pastor, created.id);
    const edited = await api.update(pastor, created.id, {
      ...morning, title: "Culto revisado", expectedUpdatedAt: approved.updatedAt,
    });
    expect(edited).toMatchObject({ title: "Culto revisado", status: "DRAFT" });
    await expect(api.publish(pastor, created.id)).rejects.toMatchObject({ response: { code: "SERVICE_ORDER_STATE" } });
  });

  it("permite consulta do administrador e recusa edição fora do pastor da congregação", async () => {
    const { api } = service();
    const created = await api.create(pastor, morning);
    await expect(api.list(admin)).resolves.toMatchObject({ orders: [{ id: created.id }] });
    await expect(api.getById(admin, created.id)).resolves.toMatchObject({ status: "DRAFT" });
    await expect(api.update(admin, created.id, morning)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(api.approve(admin, created.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(api.publish(admin, created.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(api.list(otherPastor)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
